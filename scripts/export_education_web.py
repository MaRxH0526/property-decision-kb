#!/usr/bin/env python3
"""Export the supplied education SQLite knowledge base for the static website.

This script is deliberately read-only. It does not crawl, enrich, or rewrite facts;
it only converts the two source databases and their validation report into a small
summary plus one lazy-loaded JSON payload per city.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


STAGE_LABELS = {
    "primary": "小学",
    "junior": "初中",
    "both": "小学 + 初中",
}


def rows(connection: sqlite3.Connection, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    return [dict(row) for row in connection.execute(sql, tuple(params)).fetchall()]


def scalar(connection: sqlite3.Connection, sql: str, params: Iterable[Any] = ()) -> Any:
    row = connection.execute(sql, tuple(params)).fetchone()
    return row[0] if row else None


def metadata(connection: sqlite3.Connection) -> dict[str, str]:
    return {row[0]: row[1] for row in connection.execute("SELECT key, value FROM metadata")}


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


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


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
    return {"districts": district_count, **policy, **school}


def city_payload(
    policy_db: sqlite3.Connection,
    school_db: sqlite3.Connection,
    city: dict[str, Any],
    summary_metrics: dict[str, Any],
    exported_at: str,
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

    policy_districts: dict[str, dict[str, int]] = defaultdict(lambda: {"policyDocuments": 0, "rules": 0, "timelines": 0})
    school_districts: dict[str, dict[str, int]] = defaultdict(lambda: {"schools": 0, "primary": 0, "junior": 0})
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
        "schemaVersion": 1,
        "exportedAt": exported_at,
        "city": {**city, "metrics": summary_metrics},
        "districts": districts,
        "policies": policies,
        "rules": rules,
        "timelines": timelines,
        "schools": schools,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    script_root = Path(__file__).resolve().parent.parent
    parser.add_argument(
        "--source-root",
        type=Path,
        default=script_root.parent / "education_kb_project",
        help="Path to the supplied education_kb_project directory",
    )
    parser.add_argument("--site-root", type=Path, default=script_root)
    args = parser.parse_args()

    source_root = args.source_root.resolve()
    site_root = args.site_root.resolve()
    policy_path = source_root / "data" / "enrollment_policies.sqlite3"
    school_path = source_root / "data" / "public_schools.sqlite3"
    validation_path = source_root / "reports" / "validation_report.json"
    completion_path = source_root / "reports" / "completion_summary_2026-07-16.md"
    for path in (policy_path, school_path, validation_path, completion_path):
        if not path.exists():
            raise SystemExit(f"Required source file is missing: {path}")

    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    completion = completion_path.read_text(encoding="utf-8")
    test_match = re.search(r"(\d+)/(\d+)通过", completion)

    with open_read_only(policy_path) as policy_db, open_read_only(school_path) as school_db:
        policy_meta = metadata(policy_db)
        school_meta = metadata(school_db)
        exported_at = max(policy_meta["updated_at"], school_meta["updated_at"])
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
            summaries.append({**city, "metrics": metrics})

        policy_report = validation["databases"]["policies"]
        school_report = validation["databases"]["schools"]
        summary = {
            "title": "城市义务教育政策与公办学校知识库",
            "release": f"edu-schema-v{policy_meta['schema_version']}@{exported_at[:10]}",
            "schemaVersion": int(policy_meta["schema_version"]),
            "asOfDate": exported_at[:10],
            "exportedAt": exported_at,
            "validationGeneratedAt": validation["generated_at"],
            "validated": bool(validation["ok"]),
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
            },
            "warnings": validation["warnings"],
            "sourceFiles": [
                "data/enrollment_policies.sqlite3",
                "data/public_schools.sqlite3",
                "reports/validation_report.json",
                "reports/completion_summary_2026-07-16.md",
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
            payload = city_payload(
                policy_db,
                school_db,
                city,
                next(item["metrics"] for item in summaries if item["code"] == city["code"]),
                exported_at,
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
                "city_payload_bytes": total_bytes,
                "summary": str(site_root / "app" / "generated" / "education-summary.json"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
