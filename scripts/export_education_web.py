#!/usr/bin/env python3
"""Export the V3 education knowledge base for the static website.

This script is deliberately read-only. It does not crawl, enrich, or rewrite facts;
it converts the V3 databases, review packets and coverage indexes into a small
summary plus one lazy-loaded JSON payload per city.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path
from typing import Any, Iterable


STAGE_LABELS = {
    "primary": "小学",
    "junior": "初中",
    "both": "小学 + 初中",
}

FRESHNESS_MODEL_VERSION = "policy-freshness-v1"


def rows(connection: sqlite3.Connection, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in connection.execute(sql, tuple(params)).fetchall()]


def scalar(connection: sqlite3.Connection, sql: str, params: Iterable[Any] = ()) -> Any:
    row = connection.execute(sql, tuple(params)).fetchone()
    return row[0] if row else None


def metadata(connection: sqlite3.Connection) -> dict[str, str]:
    return {row[0]: row[1] for row in connection.execute("SELECT key, value FROM metadata")}


def table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    return bool(
        scalar(
            connection,
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            (table_name,),
        )
    )


def open_read_only(path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def compact(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, str):
        value = re.sub(r"\s+", " ", value).strip()
        return value or None
    return value


def parse_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def age_days(value: Any, as_of_date: str) -> int | None:
    start = parse_date(value)
    end = parse_date(as_of_date)
    if not start or not end:
        return None
    return max(0, (end - start).days)


def assess_policy_freshness(policy: dict[str, Any], as_of_date: str) -> dict[str, Any]:
    publication_age_days = age_days(policy.get("publishedDate"), as_of_date)
    verification_age_days = age_days(policy.get("sourceAccessedAt"), as_of_date)
    effective_to = parse_date(policy.get("effectiveTo"))
    as_of = parse_date(as_of_date)
    last_checked_at = str(policy["sourceAccessedAt"])[:10] if policy.get("sourceAccessedAt") else None

    if policy.get("status") in {"expired", "superseded"} or (
        effective_to and as_of and effective_to < as_of
    ):
        grade = "D"
        citation_mode = "historical_only"
        reason = "政策已过期或被后续文件替代，仅用于历史回放"
    elif policy.get("sourceStatus") in {"fallback", "url_pending"} or policy.get(
        "sourceVerificationStatus"
    ) in {"failed", "stale"}:
        grade = "C"
        citation_mode = "needs_revalidation"
        reason = (
            "往年政策回退，引用前必须查找当年官方文件"
            if policy.get("sourceStatus") == "fallback"
            else "来源链接或核验状态待复核"
        )
    elif verification_age_days is None or verification_age_days > 90:
        grade = "C"
        citation_mode = "needs_revalidation"
        reason = "教育政策超过 90 天未检查来源，引用前需重新核验"
    elif (
        policy.get("admissionYear") == as_of.year
        and policy.get("status") == "current"
        and policy.get("verificationStatus") in {"text_verified", "rules_verified"}
        and policy.get("sourceVerificationStatus") == "verified"
    ):
        grade = "A"
        citation_mode = "allowed"
        reason = "当年政策且已完成正文与来源核验"
    else:
        grade = "B"
        citation_mode = "allowed_with_disclosure"
        reason = (
            "当年政策目前仅完成元数据核验，引用时需披露边界"
            if policy.get("admissionYear") == as_of.year
            else "长期现行政策的适用年度较早，引用时需披露时间"
        )

    return {
        "freshnessGrade": grade,
        "citationMode": citation_mode,
        "freshnessReason": reason,
        "lastCheckedAt": last_checked_at,
        "publicationAgeDays": publication_age_days,
        "verificationAgeDays": verification_age_days,
        "freshnessModelVersion": FRESHNESS_MODEL_VERSION,
    }


def policy_freshness_counts(connection: sqlite3.Connection, as_of_date: str) -> dict[str, int]:
    policies = rows(
        connection,
        """
        SELECT p.admission_year AS admissionYear, p.published_date AS publishedDate,
               p.effective_to AS effectiveTo, p.status, p.source_status AS sourceStatus,
               p.verification_status AS verificationStatus,
               s.accessed_at AS sourceAccessedAt,
               s.verification_status AS sourceVerificationStatus
        FROM policy_documents p
        JOIN sources s ON s.source_id=p.source_id
        """,
    )
    counts = Counter(assess_policy_freshness(policy, as_of_date)["freshnessGrade"] for policy in policies)
    return {grade: counts.get(grade, 0) for grade in ("A", "B", "C", "D")}


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payloads: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            payloads.append(json.loads(line))
    return payloads


def load_extraction_index(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    result: dict[str, dict[str, Any]] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            result[row["city_code"]] = {
                "rawPackets": int(row["raw_packets"]),
                "usablePackets": int(row["usable_packets"]),
                "reviewPackets": int(row["review_packets"]),
                "reviewSourceChars": int(row["review_source_chars"]),
                "reviewCandidateChars": int(row["review_candidate_chars"]),
                "reviewRatio": float(row["review_ratio"]),
                "qualityCounts": json.loads(row["quality_counts"]),
                "actionCounts": json.loads(row["action_counts"]),
            }
    return result


def load_scenario_index(path: Path) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if not path.exists():
        return result
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            result[row["city_code"]].append(
                {
                    "scenario": row["scenario"],
                    "scenarioLabel": row["scenario_label"],
                    "ruleRows": int(row["rule_rows"]),
                    "policyCount": int(row["policy_count"]),
                    "ruleTypeCounts": json.loads(row["rule_type_counts"]),
                    "sample": compact(row["sample"]),
                }
            )
    return result


def export_retrieval_packets(source_root: Path, city_code: str) -> list[dict[str, Any]]:
    path = (
        source_root
        / "knowledge_base"
        / "extraction_packets"
        / "catchment_scope"
        / city_code
        / f"{city_code}_catchment_review_packets.jsonl"
    )
    packets = []
    for packet in read_jsonl(path):
        packets.append(
            {
                "policyId": packet["policy_id"],
                "cityCode": packet["city_code"],
                "districtCode": packet.get("district_code"),
                "title": compact(packet["title"]),
                "sourceKind": packet["source_kind"],
                "sourceRef": packet["source_ref"],
                "sourceChars": packet["source_chars"],
                "candidateChars": packet["candidate_chars"],
                "reductionRatio": packet["reduction_ratio"],
                "quality": packet["quality"],
                "recommendedAction": packet["recommended_action"],
                "knowledgeStatus": "review_candidate",
                "evidenceLines": [
                    {"lineNo": item["line_no"], "text": compact(item["text"])}
                    for item in packet["evidence_lines"]
                ],
            }
        )
    return packets


def validate_v3_extensions(
    school_db: sqlite3.Connection,
    extraction_index: dict[str, dict[str, Any]],
    scenario_index: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    has_catchments = table_exists(school_db, "school_catchment_communities")
    catchments = scalar(school_db, "SELECT COUNT(*) FROM school_catchment_communities") if has_catchments else 0
    catchments_missing_evidence = (
        scalar(
            school_db,
            """
            SELECT COUNT(*) FROM school_catchment_communities
            WHERE trim(evidence_text)='' OR trim(source_locator)='' OR trim(verified_at)=''
            """,
        )
        if has_catchments
        else 0
    )
    unresolved_school_ids = (
        scalar(school_db, "SELECT COUNT(*) FROM school_catchment_communities WHERE school_id IS NULL")
        if has_catchments
        else 0
    )
    official_catchments = (
        scalar(
            school_db,
            """
            SELECT COUNT(*) FROM school_catchment_communities c
            JOIN sources s ON s.source_id=c.source_id
            WHERE s.authority_level>=5 AND c.confidence>=0.9
            """,
        )
        if has_catchments
        else 0
    )
    review_catchments = catchments - official_catchments
    review_packets = sum(item["reviewPackets"] for item in extraction_index.values())
    quality_counts: dict[str, int] = defaultdict(int)
    for item in extraction_index.values():
        for quality, count in item["qualityCounts"].items():
            quality_counts[quality] += count
    result = {
        "ok": bool(
            has_catchments
            and school_db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            and not school_db.execute("PRAGMA foreign_key_check").fetchall()
            and catchments_missing_evidence == 0
            and len(extraction_index) == 31
            and review_packets == 349
        ),
        "scope": "V3新增对口小区表、31城轻量证据包和咨询场景索引",
        "catchments": catchments,
        "officialCatchments": official_catchments,
        "reviewCatchments": review_catchments,
        "catchmentsMissingEvidence": catchments_missing_evidence,
        "unresolvedSchoolIds": unresolved_school_ids,
        "packetCities": len(extraction_index),
        "reviewPackets": review_packets,
        "packetQuality": dict(quality_counts),
        "scenarioCityCombinations": sum(len(items) for items in scenario_index.values()),
    }
    return result


def stage_sql(column: str = "stage") -> str:
    return f"CASE {column} WHEN 'primary' THEN '小学' WHEN 'junior' THEN '初中' ELSE '小学 + 初中' END"


def coverage_metrics(policy_db: sqlite3.Connection, school_db: sqlite3.Connection, city_code: str) -> dict[str, Any]:
    policy = dict(
        policy_db.execute(
            """
            WITH expanded AS (
              SELECT district_code, 'primary' AS stage, scope_completeness FROM policy_documents
              WHERE city_code=? AND district_code IS NOT NULL AND stage IN ('primary','both')
              UNION ALL
              SELECT district_code, 'junior' AS stage, scope_completeness FROM policy_documents
              WHERE city_code=? AND district_code IS NOT NULL AND stage IN ('junior','both')
            )
            SELECT
              COUNT(*) AS policy_documents,
              MAX(admission_year) AS latest_year,
              SUM(CASE WHEN admission_year=2026 AND status='current' AND source_status='verified' THEN 1 ELSE 0 END) AS current_verified_documents,
              (SELECT COUNT(DISTINCT district_code || ':' || stage) FROM expanded WHERE scope_completeness='complete') AS complete_district_stage,
              (SELECT COUNT(DISTINCT district_code || ':' || stage) FROM expanded) AS sourced_district_stage
            FROM policy_documents WHERE city_code=?
            """,
            (city_code, city_code, city_code),
        ).fetchone()
    )
    policy["rules"] = scalar(
        policy_db,
        "SELECT COUNT(*) FROM policy_rules r JOIN policy_documents p ON p.policy_id=r.policy_id WHERE p.city_code=?",
        (city_code,),
    )
    policy["timelines"] = scalar(
        policy_db,
        "SELECT COUNT(*) FROM admission_timeline t JOIN policy_documents p ON p.policy_id=t.policy_id WHERE p.city_code=?",
        (city_code,),
    )
    policy["rule_types"] = scalar(
        policy_db,
        "SELECT COUNT(DISTINCT r.rule_type) FROM policy_rules r JOIN policy_documents p ON p.policy_id=r.policy_id WHERE p.city_code=?",
        (city_code,),
    )
    school = dict(
        school_db.execute(
            """
            SELECT COUNT(*) AS schools,
                   SUM(has_primary) AS primary_records,
                   SUM(has_junior) AS junior_records,
                   COUNT(DISTINCT district_code) AS school_districts,
                   SUM(CASE WHEN address IS NOT NULL AND trim(address)<>'' THEN 1 ELSE 0 END) AS with_address,
                   SUM(CASE WHEN website IS NOT NULL AND trim(website)<>'' THEN 1 ELSE 0 END) AS with_website
            FROM schools WHERE city_code=?
            """,
            (city_code,),
        ).fetchone()
    )
    district_count = scalar(
        policy_db,
        "SELECT COUNT(*) FROM regions WHERE city_code=? AND region_level='district' AND is_current=1",
        (city_code,),
    )
    catchment = {"catchments": 0, "official_catchments": 0, "review_catchments": 0, "catchment_schools": 0}
    if table_exists(school_db, "school_catchment_communities"):
        catchment.update(
            dict(
                school_db.execute(
                    """
                    SELECT COUNT(*) AS catchments,
                           SUM(CASE WHEN so.authority_level>=5 AND c.confidence>=0.9 THEN 1 ELSE 0 END) AS official_catchments,
                           SUM(CASE WHEN so.authority_level<5 OR c.confidence<0.9 THEN 1 ELSE 0 END) AS review_catchments,
                           COUNT(DISTINCT c.school_normalized_name) AS catchment_schools
                    FROM school_catchment_communities c
                    JOIN sources so ON so.source_id=c.source_id
                    WHERE c.city_code=?
                    """,
                    (city_code,),
                ).fetchone()
            )
        )
    return {"districts": district_count, **policy, **school, **catchment}


def city_payload(
    policy_db: sqlite3.Connection,
    school_db: sqlite3.Connection,
    city: dict[str, Any],
    summary_metrics: dict[str, Any],
    exported_at: str,
    as_of_date: str,
    retrieval_packets: list[dict[str, Any]],
    retrieval_summary: dict[str, Any],
    scenario_coverage: list[dict[str, Any]],
) -> dict[str, Any]:
    code = city["code"]

    policies = rows(
        policy_db,
        f"""
        SELECT p.policy_id AS id, p.district_code AS districtCode,
               COALESCE(d.name, p.management_area, '全市') AS districtName,
               p.management_area AS managementArea, p.coverage_scope AS coverageScope,
               p.scope_completeness AS scopeCompleteness, p.source_status AS sourceStatus,
               p.stage, {stage_sql('p.stage')} AS stageLabel, p.admission_year AS admissionYear,
               p.title, p.issuing_authority AS issuingAuthority, p.document_number AS documentNumber,
               p.published_date AS publishedDate, p.effective_from AS effectiveFrom,
               p.effective_to AS effectiveTo, p.status, p.verification_status AS verificationStatus,
               p.notes, s.title AS sourceTitle, s.url AS sourceUrl,
               s.publisher AS sourcePublisher, s.source_type AS sourceType,
               s.authority_level AS authorityLevel, s.verification_status AS sourceVerificationStatus,
               s.accessed_at AS sourceAccessedAt,
               (SELECT COUNT(*) FROM policy_rules r WHERE r.policy_id=p.policy_id) AS ruleCount,
               (SELECT COUNT(*) FROM admission_timeline t WHERE t.policy_id=p.policy_id) AS timelineCount
        FROM policy_documents p
        JOIN sources s ON s.source_id=p.source_id
        LEFT JOIN regions d ON d.region_code=p.district_code
        WHERE p.city_code=?
        ORDER BY p.admission_year DESC,
                 CASE p.coverage_scope WHEN 'city_all' THEN 0 WHEN 'city_urban' THEN 1 ELSE 2 END,
                 districtName, p.stage, p.published_date DESC, p.policy_id
        """,
        (code,),
    )
    for policy in policies:
        for key, value in list(policy.items()):
            policy[key] = compact(value)
        policy.update(assess_policy_freshness(policy, as_of_date))

    rules = rows(
        policy_db,
        f"""
        SELECT r.rule_id AS id, r.policy_id AS policyId, p.district_code AS districtCode,
               COALESCE(d.name, p.management_area, '全市') AS districtName,
               r.stage, {stage_sql('r.stage')} AS stageLabel, r.rule_type AS ruleType,
               r.subject_group AS subjectGroup, r.rule_text AS ruleText,
               r.evidence_text AS evidenceText, r.source_locator AS sourceLocator,
               r.is_inferred AS isInferred, r.confidence,
               p.admission_year AS admissionYear, p.title AS policyTitle,
               s.title AS sourceTitle, s.url AS sourceUrl
        FROM policy_rules r
        JOIN policy_documents p ON p.policy_id=r.policy_id
        JOIN sources s ON s.source_id=p.source_id
        LEFT JOIN regions d ON d.region_code=p.district_code
        WHERE p.city_code=?
        ORDER BY p.admission_year DESC, districtName, r.rule_type, r.rule_id
        """,
        (code,),
    )
    for rule in rules:
        for key, value in list(rule.items()):
            rule[key] = compact(value)
        if rule["evidenceText"] == rule["ruleText"]:
            rule["evidenceText"] = None

    timelines = rows(
        policy_db,
        f"""
        SELECT t.timeline_id AS id, t.policy_id AS policyId, p.district_code AS districtCode,
               COALESCE(d.name, p.management_area, '全市') AS districtName,
               t.stage, {stage_sql('t.stage')} AS stageLabel, t.event_type AS eventType,
               t.event_name AS eventName, t.starts_at AS startsAt, t.ends_at AS endsAt,
               t.evidence_text AS evidenceText, t.source_locator AS sourceLocator,
               t.is_inferred AS isInferred, p.admission_year AS admissionYear,
               p.title AS policyTitle, s.title AS sourceTitle, s.url AS sourceUrl
        FROM admission_timeline t
        JOIN policy_documents p ON p.policy_id=t.policy_id
        JOIN sources s ON s.source_id=p.source_id
        LEFT JOIN regions d ON d.region_code=p.district_code
        WHERE p.city_code=?
        ORDER BY p.admission_year DESC, COALESCE(t.starts_at, '9999'), districtName, t.timeline_id
        """,
        (code,),
    )
    for timeline in timelines:
        for key, value in list(timeline.items()):
            timeline[key] = compact(value)

    schools = rows(
        school_db,
        """
        SELECT sc.school_id AS id, sc.district_code AS districtCode, d.name AS districtName,
               sc.management_area AS managementArea, sc.official_name AS name,
               sc.school_level AS schoolLevel, sc.has_primary AS hasPrimary,
               sc.has_junior AS hasJunior, sc.school_status AS status,
               sc.address, sc.phone, sc.website, sc.official_school_code AS officialSchoolCode,
               sc.established_date AS establishedDate, sc.public_status_evidence AS publicStatusEvidence,
               sc.verified_at AS verifiedAt, so.title AS sourceTitle, so.url AS sourceUrl,
               so.publisher AS sourcePublisher, so.authority_level AS authorityLevel,
               sp.overview, sp.faculty_strength AS facultyStrength,
               sp.parent_reputation_summary AS parentReputation,
               sp.featured_teaching AS featuredTeaching,
               sp.progression_outcomes AS progressionOutcomes, sp.awards,
               GROUP_CONCAT(sa.alias, '、') AS aliases
        FROM schools sc
        JOIN regions d ON d.region_code=sc.district_code
        JOIN sources so ON so.source_id=sc.source_id
        LEFT JOIN school_profiles sp ON sp.school_id=sc.school_id
        LEFT JOIN school_aliases sa ON sa.school_id=sc.school_id
        WHERE sc.city_code=?
        GROUP BY sc.school_id
        ORDER BY d.name, sc.official_name
        """,
        (code,),
    )
    for school in schools:
        for key, value in list(school.items()):
            school[key] = compact(value)

    catchments: list[dict[str, Any]] = []
    if table_exists(school_db, "school_catchment_communities"):
        catchments = rows(
            school_db,
            f"""
            SELECT c.catchment_id AS id, c.school_id AS schoolId,
                   c.district_code AS districtCode, d.name AS districtName,
                   c.school_name AS schoolName, c.school_normalized_name AS schoolNormalizedName,
                   c.campus_name AS campusName, c.admission_year AS admissionYear,
                   c.stage, {stage_sql('c.stage')} AS stageLabel,
                   c.community_name AS communityName, c.community_alias AS communityAlias,
                   c.address_text AS addressText, c.mechanism,
                   c.eligibility_note AS eligibilityNote, c.evidence_text AS evidenceText,
                   c.source_locator AS sourceLocator, c.verified_at AS verifiedAt,
                   c.confidence, c.notes, so.title AS sourceTitle, so.url AS sourceUrl,
                   so.publisher AS sourcePublisher, so.source_type AS sourceType,
                   so.authority_level AS authorityLevel,
                   CASE WHEN so.authority_level>=5 AND c.confidence>=0.9
                        THEN 'verified_official' ELSE 'needs_review' END AS knowledgeStatus
            FROM school_catchment_communities c
            JOIN regions d ON d.region_code=c.district_code
            JOIN sources so ON so.source_id=c.source_id
            WHERE c.city_code=?
            ORDER BY c.admission_year DESC, d.name, c.school_name, c.community_name
            """,
            (code,),
        )
        for catchment in catchments:
            for key, value in list(catchment.items()):
                catchment[key] = compact(value)

    policy_districts: dict[str, dict[str, int]] = defaultdict(lambda: {"policyDocuments": 0, "rules": 0, "timelines": 0})
    school_districts: dict[str, dict[str, int]] = defaultdict(lambda: {"schools": 0, "primary": 0, "junior": 0, "catchments": 0})
    for policy in policies:
        if policy["districtCode"]:
            policy_districts[policy["districtCode"]]["policyDocuments"] += 1
    for rule in rules:
        if rule["districtCode"]:
            policy_districts[rule["districtCode"]]["rules"] += 1
    for timeline in timelines:
        if timeline["districtCode"]:
            policy_districts[timeline["districtCode"]]["timelines"] += 1
    for school in schools:
        item = school_districts[school["districtCode"]]
        item["schools"] += 1
        item["primary"] += int(school["hasPrimary"] or 0)
        item["junior"] += int(school["hasJunior"] or 0)
    for catchment in catchments:
        school_districts[catchment["districtCode"]]["catchments"] += 1

    districts = rows(
        policy_db,
        """
        SELECT region_code AS code, name, official_name AS officialName
        FROM regions WHERE city_code=? AND region_level='district' AND is_current=1
        ORDER BY region_code
        """,
        (code,),
    )
    for district in districts:
        district.update(policy_districts[district["code"]])
        district.update(school_districts[district["code"]])

    return {
        "schemaVersion": 2,
        "contentVersion": "V3",
        "exportedAt": exported_at,
        "city": {**city, "metrics": summary_metrics},
        "districts": districts,
        "policies": policies,
        "rules": rules,
        "timelines": timelines,
        "schools": schools,
        "catchments": catchments,
        "retrieval": {
            "status": "review_candidates_not_final_facts",
            "summary": retrieval_summary,
            "packets": retrieval_packets,
        },
        "scenarioCoverage": scenario_coverage,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    script_root = Path(__file__).resolve().parent.parent
    parser.add_argument(
        "--source-root",
        type=Path,
        default=script_root.parent / "education_kb_project",
        help="Path to the canonical V3 education_kb_project directory",
    )
    parser.add_argument("--site-root", type=Path, default=script_root)
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    site_root = args.site_root.resolve()
    policy_path = source_root / "data" / "enrollment_policies.sqlite3"
    school_path = source_root / "data" / "public_schools.sqlite3"
    validation_path = source_root / "reports" / "validation_report.json"
    completion_path = source_root / "reports" / "completion_summary_2026-07-16.md"
    version_path = source_root / "VERSION.json"
    extraction_index_path = source_root / "reports" / "extraction_packet_index_2026-07-17.csv"
    scenario_index_path = source_root / "reports" / "consulting_scenario_coverage_2026-07-17.csv"
    for path in (
        policy_path,
        school_path,
        validation_path,
        completion_path,
        version_path,
        extraction_index_path,
        scenario_index_path,
    ):
        if not path.exists():
            raise SystemExit(f"Required source file is missing: {path}")

    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    version = json.loads(version_path.read_text(encoding="utf-8"))
    if version.get("contentVersion") != "V3":
        raise SystemExit(f"Only V3 is supported; found {version.get('contentVersion')!r}")
    completion = completion_path.read_text(encoding="utf-8")
    test_match = re.search(r"(\d+)/(\d+)通过", completion)
    extraction_index = load_extraction_index(extraction_index_path)
    scenario_index = load_scenario_index(scenario_index_path)

    with open_read_only(policy_path) as policy_db, open_read_only(school_path) as school_db:
        policy_meta = metadata(policy_db)
        school_meta = metadata(school_db)
        exported_at = max(policy_meta["updated_at"], school_meta["updated_at"])
        extension_validation = validate_v3_extensions(school_db, extraction_index, scenario_index)
        freshness_counts = policy_freshness_counts(policy_db, version["asOfDate"])
        cities = rows(
            policy_db,
            """
            SELECT region_code AS code, name, official_name AS officialName,
                   province_code AS provinceCode
            FROM regions
            WHERE is_target_city=1 AND is_current=1
            ORDER BY region_code
            """,
        )

        summaries: list[dict[str, Any]] = []
        for city in cities:
            metrics = coverage_metrics(policy_db, school_db, city["code"])
            packet_summary = extraction_index.get(city["code"], {})
            metrics.update(
                {
                    "review_packets": packet_summary.get("reviewPackets", 0),
                    "high_quality_packets": packet_summary.get("qualityCounts", {}).get("high", 0),
                    "medium_quality_packets": packet_summary.get("qualityCounts", {}).get("medium", 0),
                    "low_quality_packets": packet_summary.get("qualityCounts", {}).get("low", 0),
                    "scenario_groups": len(scenario_index.get(city["code"], [])),
                }
            )
            summaries.append({**city, "metrics": metrics})

        policy_report = validation["databases"]["policies"]
        school_report = validation["databases"]["schools"]
        summary = {
            "title": "城市义务教育政策、学校与对口范围知识库",
            "release": version["release"],
            "contentVersion": version["contentVersion"],
            "schemaVersion": int(policy_meta["schema_version"]),
            "asOfDate": version["asOfDate"],
            "exportedAt": exported_at,
            "validationGeneratedAt": validation["generated_at"],
            "validated": bool(validation["ok"] and extension_validation["ok"]),
            "baseValidation": {"ok": bool(validation["ok"]), "generatedAt": validation["generated_at"]},
            "extensionValidation": extension_validation,
            "freshnessModel": {
                "version": FRESHNESS_MODEL_VERSION,
                "asOfDate": version["asOfDate"],
                "gradeCounts": freshness_counts,
            },
            "tests": {"passed": int(test_match.group(1)), "total": int(test_match.group(2))} if test_match else None,
            "metrics": {
                "cities": validation["target_city_count"],
                "districts": policy_report["districts"],
                "policyDocuments": policy_report["policy_documents"],
                "policyRules": policy_report["policy_rules"],
                "timelineEvents": policy_report["admission_timeline_events"],
                "operationalCityStageCoverage": policy_report["city_stage_coverage"],
                "strictCurrentCityStageCoverage": policy_report["strict_current_city_stage_coverage"],
                "expectedCityStageCoverage": policy_report["expected_city_stage_coverage"],
                "completeDistrictStageCoverage": policy_report["district_stage_specific_coverage"],
                "districtStageSourceCoverage": policy_report["district_stage_source_coverage"],
                "expectedDistrictStageCoverage": policy_report["expected_district_stage_specific_coverage"],
                "schools": school_report["schools"],
                "schoolCityStageCoverage": school_report["city_stage_coverage"],
                "aliases": school_report["aliases"],
                "claims": school_report["claims"],
                "schoolDistrictStageCoverage": school_report["district_stage_coverage"],
                "catchments": extension_validation["catchments"],
                "officialCatchments": extension_validation["officialCatchments"],
                "reviewCatchments": extension_validation["reviewCatchments"],
                "catchmentCities": sum(1 for item in summaries if item["metrics"]["catchments"]),
                "retrievalPackets": extension_validation["reviewPackets"],
                "highQualityPackets": extension_validation["packetQuality"].get("high", 0),
                "mediumQualityPackets": extension_validation["packetQuality"].get("medium", 0),
                "lowQualityPackets": extension_validation["packetQuality"].get("low", 0),
                "scenarioCityCombinations": extension_validation["scenarioCityCombinations"],
            },
            "warnings": [
                *validation["warnings"],
                "V3: 468条学校对口/服务范围记录尚未关联school_id；网页按学校名和证据原样展示。",
                "V3: 北京11条对口记录来自第三方来源，保持needs_review，不作为确定性对口结论。",
                "V3: 349个轻量证据包是检索与复核候选，不直接替代政策事实。",
            ],
            "sourceFiles": [
                "VERSION.json",
                "data/enrollment_policies.sqlite3",
                "data/public_schools.sqlite3",
                "reports/validation_report.json",
                "reports/completion_summary_2026-07-16.md",
                "reports/extraction_packet_index_2026-07-17.csv",
                "reports/consulting_scenario_coverage_2026-07-17.csv",
                "knowledge_base/extraction_packets/catchment_scope/{city_code}/",
            ],
            "nullSemantics": "NULL 或空字段表示尚无可靠公开证据，不表示不存在该项事实。",
            "cities": summaries,
        }

        write_json(site_root / "app" / "generated" / "education-summary.json", summary)
        city_root = site_root / "public" / "data" / "education"
        city_root.mkdir(parents=True, exist_ok=True)
        expected_files = set()
        for city in cities:
            expected_files.add(f"{city['code']}.json")
            retrieval_packets = export_retrieval_packets(source_root, city["code"])
            payload = city_payload(
                policy_db,
                school_db,
                city,
                next(item["metrics"] for item in summaries if item["code"] == city["code"]),
                exported_at,
                version["asOfDate"],
                retrieval_packets,
                extraction_index.get(city["code"], {}),
                scenario_index.get(city["code"], []),
            )
            write_json(city_root / f"{city['code']}.json", payload)
        for stale in city_root.glob("*.json"):
            if stale.name not in expected_files:
                stale.unlink()

    total_bytes = sum(path.stat().st_size for path in (site_root / "public" / "data" / "education").glob("*.json"))
    print(
        json.dumps(
            {
                "cities": len(cities),
                "release": summary["release"],
                "content_version": summary["contentVersion"],
                "catchments": summary["metrics"]["catchments"],
                "retrieval_packets": summary["metrics"]["retrievalPackets"],
                "city_payload_bytes": total_bytes,
                "summary": str(site_root / "app" / "generated" / "education-summary.json"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
