"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import educationSummaryJson from "./generated/education-summary.json";
import { DomainTabs, type KnowledgeDomain } from "./domain-tabs";
import type {
  EducationCityData,
  EducationCitySummary,
  EducationCatchment,
  EducationPolicy,
  EducationRetrievalPacket,
  EducationRule,
  EducationSchool,
  EducationSummary,
  EducationTimeline,
} from "./education-types";

const educationSummary = educationSummaryJson as unknown as EducationSummary;
const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type EducationView = "policies" | "rules" | "timelines" | "schools" | "catchments" | "evidence" | "coverage";
type StageFilter = "all" | "primary" | "junior";

const viewLabels: Record<EducationView, string> = {
  policies: "政策文件",
  rules: "规则条款",
  timelines: "入学时间线",
  schools: "公办学校",
  catchments: "对口小区",
  evidence: "轻量证据包",
  coverage: "覆盖与缺口",
};

const catchmentMechanismLabels: Record<string, string> = {
  service_area_registration: "服务范围登记",
  single_school: "单校划片",
  multi_school: "多校划片",
  computer_lottery: "电脑派位",
  allocation: "统筹分配",
  unknown: "机制待确认",
};

const packetQualityLabels: Record<string, string> = {
  high: "高质量候选",
  medium: "中质量候选",
  low: "低质量候选",
};

const ruleTypeLabels: Record<string, string> = {
  eligibility: "入学资格",
  age: "入学年龄",
  hukou: "户籍",
  housing: "住房与房产",
  residence_permit: "居住证",
  social_insurance: "社保",
  materials: "材料",
  registration: "报名",
  verification: "审核",
  priority: "排序优先级",
  allocation: "分配与统筹",
  computer_lottery: "电脑派位",
  direct_admission: "直升",
  transfer: "转学",
  special_group: "特殊群体",
  school_choice: "择校限制",
  warning: "风险提示",
  other: "其他",
};

const completenessLabels: Record<string, string> = {
  complete: "完整区级文件",
  partial_geography: "局部地域",
  dynamic_only: "动态查询",
  previous_year: "往年回退",
  unknown: "范围待确认",
};

const sourceStatusLabels: Record<string, string> = {
  verified: "已核验",
  fallback: "往年回退",
  url_pending: "链接待核",
  district_led: "区级/流程来源",
};

const schoolLevelLabels: Record<string, string> = {
  primary: "小学",
  junior: "初中",
  nine_year: "九年一贯制",
  twelve_year: "十二年一贯制",
  complete_secondary: "完全中学",
};

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN");
}

function stageMatches(stage: string, filter: StageFilter) {
  return filter === "all" || stage === filter || stage === "both";
}

function schoolStageMatches(school: EducationSchool, filter: StageFilter) {
  if (filter === "all") return true;
  return filter === "primary" ? Boolean(school.hasPrimary) : Boolean(school.hasJunior);
}

function textMatches(query: string, values: Array<string | number | null | undefined>) {
  const terms = query.trim().toLocaleLowerCase("zh-CN").split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = values.filter((value) => value !== null && value !== undefined).join(" ").toLocaleLowerCase("zh-CN");
  return terms.every((term) => haystack.includes(term));
}

function PolicyRecord({ policy }: { policy: EducationPolicy }) {
  return (
    <article className="education-record policy-record">
      <div className="education-record-meta">
        <span>{policy.districtName}</span>
        <span>{policy.stageLabel}</span>
        <span>{policy.admissionYear}</span>
        <span className={policy.sourceStatus === "fallback" ? "status-warn" : "status-good"}>
          {sourceStatusLabels[policy.sourceStatus] ?? policy.sourceStatus}
        </span>
      </div>
      <h4>{policy.title}</h4>
      <p>{policy.issuingAuthority}</p>
      <dl className="record-facts">
        <div><dt>覆盖口径</dt><dd>{completenessLabels[policy.scopeCompleteness] ?? policy.scopeCompleteness}</dd></div>
        <div><dt>结构化内容</dt><dd>{policy.ruleCount} 条规则 · {policy.timelineCount} 个时间点</dd></div>
        <div><dt>发布 / 生效</dt><dd>{policy.publishedDate ?? "未标注"} / {policy.effectiveFrom ?? "未标注"}</dd></div>
        <div><dt>来源权威度</dt><dd>L{policy.authorityLevel} · {policy.verificationStatus}</dd></div>
      </dl>
      {policy.notes ? <div className="record-note">{policy.notes}</div> : null}
      <a className="record-source" href={policy.sourceUrl} target="_blank" rel="noreferrer">
        查看原始来源 · {policy.sourceTitle}<b aria-hidden="true">↗</b>
      </a>
    </article>
  );
}

function RuleRecord({ rule }: { rule: EducationRule }) {
  return (
    <article className="education-record rule-record">
      <div className="education-record-meta">
        <span>{rule.districtName}</span>
        <span>{rule.stageLabel}</span>
        <span>{ruleTypeLabels[rule.ruleType] ?? rule.ruleType}</span>
        <span>{rule.isInferred ? "机器结构化" : "人工结构化"}</span>
      </div>
      <h4>{rule.ruleText}</h4>
      <p>适用对象：{rule.subjectGroup}</p>
      {rule.evidenceText ? <blockquote>{rule.evidenceText}</blockquote> : null}
      <div className="record-trace">
        <span>来源定位：{rule.sourceLocator}</span>
        <span>置信度：{rule.confidence.toFixed(2)}</span>
      </div>
      <a className="record-source" href={rule.sourceUrl} target="_blank" rel="noreferrer">
        {rule.policyTitle}<b aria-hidden="true">↗</b>
      </a>
    </article>
  );
}

function TimelineRecord({ timeline }: { timeline: EducationTimeline }) {
  return (
    <article className="education-record timeline-record">
      <div className="timeline-date">
        <strong>{timeline.startsAt ?? "日期未结构化"}</strong>
        <span>{timeline.endsAt && timeline.endsAt !== timeline.startsAt ? `至 ${timeline.endsAt}` : ""}</span>
      </div>
      <div>
        <div className="education-record-meta">
          <span>{timeline.districtName}</span><span>{timeline.stageLabel}</span><span>{timeline.eventType}</span>
        </div>
        <h4>{timeline.eventName}</h4>
        <p>{timeline.evidenceText}</p>
        <a className="record-source" href={timeline.sourceUrl} target="_blank" rel="noreferrer">
          {timeline.policyTitle}<b aria-hidden="true">↗</b>
        </a>
      </div>
    </article>
  );
}

function SchoolRecord({ school }: { school: EducationSchool }) {
  const details = [
    ["学校概况", school.overview],
    ["师资力量", school.facultyStrength],
    ["特色教学", school.featuredTeaching],
    ["家长口碑", school.parentReputation],
    ["升学情况", school.progressionOutcomes],
    ["获奖情况", school.awards],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <article className="education-record school-record">
      <div className="education-record-meta">
        <span>{school.districtName}</span>
        <span>{schoolLevelLabels[school.schoolLevel] ?? school.schoolLevel}</span>
        <span>公办</span>
        <span>{school.verifiedAt.slice(0, 10)}</span>
      </div>
      <h4>{school.name}</h4>
      {school.aliases ? <p>别名：{school.aliases}</p> : null}
      <dl className="record-facts">
        <div><dt>地址</dt><dd>{school.address ?? "暂无可靠公开证据"}</dd></div>
        <div><dt>电话</dt><dd>{school.phone ?? "暂无可靠公开证据"}</dd></div>
        <div><dt>学段</dt><dd>{[school.hasPrimary ? "小学" : "", school.hasJunior ? "初中" : ""].filter(Boolean).join(" + ")}</dd></div>
        <div><dt>来源权威度</dt><dd>L{school.authorityLevel}</dd></div>
      </dl>
      {details.length ? (
        <details className="school-details">
          <summary>查看有证据的学校详情（{details.length} 项）</summary>
          {details.map(([label, value]) => <div key={label}><strong>{label}</strong><p>{value}</p></div>)}
        </details>
      ) : null}
      <div className="record-note">公办性质证据：{school.publicStatusEvidence}</div>
      <a className="record-source" href={school.sourceUrl} target="_blank" rel="noreferrer">
        {school.sourceTitle}<b aria-hidden="true">↗</b>
      </a>
    </article>
  );
}

function CatchmentRecord({ catchment }: { catchment: EducationCatchment }) {
  const isOfficial = catchment.knowledgeStatus === "verified_official";
  return (
    <article className="education-record catchment-record">
      <div className="education-record-meta">
        <span>{catchment.districtName}</span>
        <span>{catchment.stageLabel}</span>
        <span>{catchment.admissionYear}</span>
        <span>{catchmentMechanismLabels[catchment.mechanism] ?? catchment.mechanism}</span>
        <span className={isOfficial ? "status-good" : "status-warn"}>{isOfficial ? "官方来源已核" : "第三方来源待核"}</span>
      </div>
      <h4>{catchment.communityName} → {catchment.schoolName}{catchment.campusName ? `（${catchment.campusName}）` : ""}</h4>
      {catchment.communityAlias ? <p>小区别名：{catchment.communityAlias}</p> : null}
      <dl className="record-facts">
        <div><dt>适用与限制</dt><dd>{catchment.eligibilityNote ?? "以原政策范围和资格审核为准"}</dd></div>
        <div><dt>学校主表关联</dt><dd>{catchment.schoolId ? `school_id ${catchment.schoolId}` : "尚未关联，仅按来源学校名展示"}</dd></div>
        <div><dt>来源定位</dt><dd>{catchment.sourceLocator}</dd></div>
        <div><dt>置信度</dt><dd>{catchment.confidence.toFixed(2)} · 权威度 L{catchment.authorityLevel}</dd></div>
      </dl>
      <blockquote>{catchment.evidenceText}</blockquote>
      {catchment.notes ? <div className="record-note">{catchment.notes}</div> : null}
      {!isOfficial ? <div className="record-note">这条记录不得作为确定性对口结论；需以后续官方原件或学校通知复核。</div> : null}
      <a className="record-source" href={catchment.sourceUrl} target="_blank" rel="noreferrer">
        {catchment.sourcePublisher} · {catchment.sourceTitle}<b aria-hidden="true">↗</b>
      </a>
    </article>
  );
}

function EvidencePacketRecord({ packet }: { packet: EducationRetrievalPacket }) {
  return (
    <article className="education-record evidence-packet-record">
      <div className="education-record-meta">
        <span>{packetQualityLabels[packet.quality] ?? packet.quality}</span>
        <span>{packet.recommendedAction}</span>
        <span className="status-warn">待审候选</span>
      </div>
      <h4>{packet.title}</h4>
      <p>候选内容 {formatNumber(packet.candidateChars)} 字符 / 原文 {formatNumber(packet.sourceChars)} 字符，保留约 {Math.round(packet.reductionRatio * 100)}%。</p>
      <details className="school-details">
        <summary>查看候选证据行（{packet.evidenceLines.length} 条）</summary>
        {packet.evidenceLines.map((line) => <div key={`${packet.policyId}-${line.lineNo}`}><strong>原文行 {line.lineNo}</strong><p>{line.text}</p></div>)}
      </details>
      <div className="record-note">这是V3为节省Agent上下文生成的检索与复核小包，不直接替代政策原文或结构化规则。</div>
      <div className="record-trace"><span>来源引用：{packet.sourceRef}</span><span>policy_id：{packet.policyId}</span></div>
    </article>
  );
}

export function EducationExplorer({
  onDomainChange,
}: {
  onDomainChange: (domain: KnowledgeDomain) => void;
}) {
  const [selectedCityCode, setSelectedCityCode] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, EducationCityData>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<EducationView>("policies");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<StageFilter>("all");
  const [district, setDistrict] = useState("all");
  const [ruleType, setRuleType] = useState("all");
  const [visibleLimit, setVisibleLimit] = useState(24);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedSummary = educationSummary.cities.find((city) => city.code === selectedCityCode) ?? null;
  const selectedData = selectedCityCode ? cache[selectedCityCode] ?? null : null;

  useEffect(() => {
    if (!selectedCityCode || cache[selectedCityCode]) return;
    const controller = new AbortController();
    fetch(`${publicBasePath}/data/education/${selectedCityCode}.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<EducationCityData>;
      })
      .then((payload) => setCache((current) => ({ ...current, [selectedCityCode]: payload })))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setLoadError(`城市知识包加载失败：${error.message}`);
      });
    return () => controller.abort();
  }, [cache, selectedCityCode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && selectedCityCode && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCityCode]);

  const openCity = (city: EducationCitySummary) => {
    if (selectedCityCode === city.code) {
      setSelectedCityCode(null);
      setQuery("");
      return;
    }
    setSelectedCityCode(city.code);
    setLoadError(null);
    setView("policies");
    setQuery("");
    setStage("all");
    setDistrict("all");
    setRuleType("all");
    setVisibleLimit(24);
  };

  const filteredPolicies = useMemo(() => (selectedData?.policies ?? []).filter((item) =>
    stageMatches(item.stage, stage) &&
    (district === "all" || item.districtCode === district) &&
    textMatches(query, [item.title, item.issuingAuthority, item.districtName, item.stageLabel, item.sourceTitle, item.notes]),
  ), [selectedData, stage, district, query]);

  const filteredRules = useMemo(() => (selectedData?.rules ?? []).filter((item) =>
    stageMatches(item.stage, stage) &&
    (district === "all" || item.districtCode === district) &&
    (ruleType === "all" || item.ruleType === ruleType) &&
    textMatches(query, [item.ruleText, item.evidenceText, item.subjectGroup, item.policyTitle, item.districtName, ruleTypeLabels[item.ruleType]]),
  ), [selectedData, stage, district, ruleType, query]);

  const filteredTimelines = useMemo(() => (selectedData?.timelines ?? []).filter((item) =>
    stageMatches(item.stage, stage) &&
    (district === "all" || item.districtCode === district) &&
    textMatches(query, [item.eventName, item.eventType, item.evidenceText, item.policyTitle, item.districtName]),
  ), [selectedData, stage, district, query]);

  const filteredSchools = useMemo(() => (selectedData?.schools ?? []).filter((item) =>
    schoolStageMatches(item, stage) &&
    (district === "all" || item.districtCode === district) &&
    textMatches(query, [item.name, item.aliases, item.districtName, item.address, item.overview, item.featuredTeaching]),
  ), [selectedData, stage, district, query]);

  const filteredCatchments = useMemo(() => (selectedData?.catchments ?? []).filter((item) =>
    stageMatches(item.stage, stage) &&
    (district === "all" || item.districtCode === district) &&
    textMatches(query, [item.schoolName, item.campusName, item.communityName, item.communityAlias, item.districtName, item.eligibilityNote]),
  ), [selectedData, stage, district, query]);

  const filteredEvidencePackets = useMemo(() => (selectedData?.retrieval.packets ?? []).filter((item) =>
    (district === "all" || item.districtCode === district) &&
    textMatches(query, [item.title, item.sourceKind, item.sourceRef, packetQualityLabels[item.quality], ...item.evidenceLines.map((line) => line.text)]),
  ), [selectedData, district, query]);

  const currentCount = view === "policies" ? filteredPolicies.length
    : view === "rules" ? filteredRules.length
      : view === "timelines" ? filteredTimelines.length
        : view === "schools" ? filteredSchools.length
          : view === "catchments" ? filteredCatchments.length
            : view === "evidence" ? filteredEvidencePackets.length
              : selectedData?.districts.length ?? 0;

  return (
    <div className="app-shell education-shell">
      <header className="topbar">
        <a className="brand" href="#education" onClick={() => setSelectedCityCode(null)}>
          <span className="brand-mark">房</span>
          <span><strong>房产决策知识库</strong><small>PROPERTY DECISION KB</small></span>
        </a>

        <DomainTabs active="education" onChange={onDomainChange} />

        <div className={`search-shell ${selectedCityCode ? "" : "search-disabled"}`} role="search">
          <span className="search-glyph" aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={query}
            disabled={!selectedCityCode}
            onChange={(event) => { setQuery(event.target.value); setVisibleLimit(24); }}
            placeholder={selectedSummary ? `搜索${selectedSummary.name}政策、规则、学校或小区` : "先展开城市，再检索教育知识"}
            aria-label="搜索当前城市教育知识库"
          />
          {query ? <button className="clear-search" onClick={() => { setQuery(""); setVisibleLimit(24); }} aria-label="清除搜索">×</button> : <kbd>/</kbd>}
        </div>

        <div className="release-badge">
          <span className="release-pulse" />
          <span><small>教育库发布</small><strong>{educationSummary.release}</strong></span>
        </div>
      </header>

      <div className="mobile-filters education-mobile-filters" aria-label="教育城市筛选">
        <button className={!selectedCityCode ? "active" : ""} onClick={() => setSelectedCityCode(null)}>总览</button>
        {educationSummary.cities.map((city) => (
          <button key={city.code} className={selectedCityCode === city.code ? "active" : ""} onClick={() => openCity(city)}>{city.name}</button>
        ))}
      </div>

      <div className="page-grid" id="education">
        <aside className="sidebar education-sidebar">
          <div className="sidebar-block">
            <span className="sidebar-label">31 城教育知识</span>
            <nav>
              <button className={!selectedCityCode ? "active" : ""} onClick={() => setSelectedCityCode(null)}>
                <span>总览</span><small>政策 + 学校 + 证据</small>
              </button>
              {educationSummary.cities.map((city) => (
                <button key={city.code} className={selectedCityCode === city.code ? "active" : ""} onClick={() => openCity(city)}>
                  <span>{city.name}</span><small>{city.metrics.policy_documents} 政策 · {city.metrics.schools} 学校</small>
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar-status">
            <span>数据状态</span>
            <strong>{educationSummary.validated ? "V3基础与扩展校验通过" : "V3校验未通过"}</strong>
            <small>仅使用V3 · 只读导出</small>
          </div>
        </aside>

        <main className="content">
          <section className="hero education-hero">
            <div className="hero-copy">
              <span className="overline">EDUCATION POLICY & PUBLIC SCHOOL KB</span>
              <h1>教育政策、学校与对口范围，<br />按证据拆开看。</h1>
              <p>当前唯一数据源为V3：保留31城政策、规则、时间线和公办学校，并增加学校—小区关系、咨询场景索引及面向Agent的轻量证据包。</p>
            </div>
            <div className="hero-facts">
              <div><strong>{formatNumber(educationSummary.metrics.policyDocuments)}</strong><span>政策文档</span></div>
              <div><strong>{formatNumber(educationSummary.metrics.policyRules)}</strong><span>结构化规则</span></div>
              <div><strong>{formatNumber(educationSummary.metrics.schools)}</strong><span>公办学校</span></div>
              <div><strong>{formatNumber(educationSummary.metrics.catchments)}</strong><span>学校对口记录</span></div>
            </div>
          </section>

          <div className="freshness-strip">
            <div><span className="status-dot status-dot-good" /><span>数据库快照</span><strong>{educationSummary.asOfDate}</strong></div>
            <div><span className="status-dot status-dot-neutral" /><span>内容 / 结构</span><strong>{educationSummary.contentVersion} · schema v{educationSummary.schemaVersion}</strong></div>
            <div><span className="status-dot status-dot-good" /><span>V3扩展校验</span><strong>{educationSummary.extensionValidation.ok ? "passed" : "failed"}</strong></div>
            <p>仅使用 education_kb_project V3；基础事实与待审候选严格区分。</p>
          </div>

          <section className="education-method" aria-label="教育知识库结构">
            <article><span>01 / POLICY</span><h2>入学政策</h2><p>按城市、区县、学段和年份组织政策文件，再关联资格、户籍、住房、材料、排序与派位规则。</p></article>
            <article><span>02 / SCHOOL</span><h2>学校与对口</h2><p>学校身份、学段和详情独立建模；V3新增逐小区服务范围，并明确官方已核与第三方待核。</p></article>
            <article><span>03 / AGENT PACKET</span><h2>轻量证据包</h2><p>31城349个候选小包用于减少Agent上下文；高、中、低质量与复核动作均保留，不冒充最终事实。</p></article>
          </section>

          <section className="city-section education-city-section" aria-labelledby="education-city-heading">
            <div className="section-intro">
              <span>城市知识包</span>
              <h2 id="education-city-heading">点击城市展开，再次点击收起</h2>
              <p>每次只读取一个城市的 JSON 分片。切换城市时不回到页面顶部，也不会加载其余30城的明细。</p>
            </div>

            <div className="education-city-grid">
              {educationSummary.cities.map((city) => (
                <Fragment key={city.code}>
                  <button
                    className={`education-city-card ${selectedCityCode === city.code ? "selected" : ""}`}
                    onClick={() => openCity(city)}
                    aria-expanded={selectedCityCode === city.code}
                    aria-controls={`education-package-${city.code}`}
                  >
                    <span className="city-code">{city.code}</span>
                    <span className="education-city-toggle">{selectedCityCode === city.code ? "×" : "+"}</span>
                    <h3>{city.name}</h3>
                    <p>{city.metrics.policy_documents} 政策 · {formatNumber(city.metrics.rules)} 规则</p>
                    <small>{formatNumber(city.metrics.schools)} 学校 · {city.metrics.catchments} 对口 · {city.metrics.review_packets} 证据包</small>
                  </button>

                  {selectedCityCode === city.code ? (
                    <section className="education-city-package" id={`education-package-${city.code}`}>
                      <div className="package-heading education-package-heading">
                        <div>
                          <span>已展开 · {city.name}教育知识库包</span>
                          <h2>{city.officialName}</h2>
                          <p>{city.metrics.policy_documents} 份政策 · {formatNumber(city.metrics.rules)} 条规则 · {formatNumber(city.metrics.schools)} 所学校 · {city.metrics.catchments} 条对口记录 · {city.metrics.review_packets} 个轻量证据包</p>
                        </div>
                        <button onClick={() => setSelectedCityCode(null)}>收起知识包</button>
                      </div>

                      {!selectedData && !loadError ? <div className="education-loading">正在读取 {city.name} 分片…</div> : null}
                      {loadError ? <div className="education-error">{loadError}</div> : null}

                      {selectedData ? (
                        <div className="education-browser" id="education-detail">
                          <div className="education-view-tabs" role="tablist" aria-label={`${city.name}知识分类`}>
                            {(Object.keys(viewLabels) as EducationView[]).map((key) => {
                              const count = key === "policies" ? filteredPolicies.length
                                : key === "rules" ? filteredRules.length
                                  : key === "timelines" ? filteredTimelines.length
                                    : key === "schools" ? filteredSchools.length
                                      : key === "catchments" ? filteredCatchments.length
                                        : key === "evidence" ? filteredEvidencePackets.length
                                          : selectedData.districts.length;
                              return <button key={key} className={view === key ? "active" : ""} onClick={() => { setView(key); setVisibleLimit(24); }}>{viewLabels[key]}<small>{formatNumber(count)}</small></button>;
                            })}
                          </div>

                          {view !== "coverage" ? (
                            <div className="education-filters">
                              {view !== "evidence" ? <label>学段<select value={stage} onChange={(event) => { setStage(event.target.value as StageFilter); setVisibleLimit(24); }}><option value="all">全部学段</option><option value="primary">小学</option><option value="junior">初中</option></select></label> : null}
                              <label>区域<select value={district} onChange={(event) => { setDistrict(event.target.value); setVisibleLimit(24); }}><option value="all">全市 + 全部区县</option>{selectedData.districts.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                              {view === "rules" ? <label>规则类型<select value={ruleType} onChange={(event) => { setRuleType(event.target.value); setVisibleLimit(24); }}><option value="all">全部规则类型</option>{Object.entries(ruleTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label> : null}
                              <div className="filter-result"><strong>{formatNumber(currentCount)}</strong><span>条匹配</span></div>
                            </div>
                          ) : null}

                          <div className="education-record-list">
                            {view === "policies" ? filteredPolicies.slice(0, visibleLimit).map((item) => <PolicyRecord policy={item} key={item.id} />) : null}
                            {view === "rules" ? filteredRules.slice(0, visibleLimit).map((item) => <RuleRecord rule={item} key={item.id} />) : null}
                            {view === "timelines" ? filteredTimelines.slice(0, visibleLimit).map((item) => <TimelineRecord timeline={item} key={item.id} />) : null}
                            {view === "schools" ? filteredSchools.slice(0, visibleLimit).map((item) => <SchoolRecord school={item} key={item.id} />) : null}
                            {view === "catchments" ? filteredCatchments.slice(0, visibleLimit).map((item) => <CatchmentRecord catchment={item} key={item.id} />) : null}
                            {view === "evidence" ? filteredEvidencePackets.slice(0, visibleLimit).map((item) => <EvidencePacketRecord packet={item} key={`${item.policyId}-${item.sourceRef}`} />) : null}
                            {view === "coverage" ? (
                              <div className="coverage-panel">
                                <div className="coverage-summary">
                                  <article><strong>{city.metrics.complete_district_stage}/ {city.metrics.districts * 2}</strong><span>完整区级政策覆盖</span></article>
                                  <article><strong>{city.metrics.sourced_district_stage}/ {city.metrics.districts * 2}</strong><span>有区级来源覆盖</span></article>
                                  <article><strong>{city.metrics.school_districts}/ {city.metrics.districts}</strong><span>有学校记录区县</span></article>
                                  <article><strong>{city.metrics.catchments}</strong><span>学校对口记录</span></article>
                                </div>
                                <div className="table-wrap" tabIndex={0} aria-label={`${city.name}区县覆盖表`}>
                                  <table><thead><tr><th>法定区县</th><th>政策文档</th><th>规则</th><th>时间线</th><th>学校</th><th>对口记录</th><th>小学 / 初中记录</th></tr></thead><tbody>{selectedData.districts.map((item) => <tr key={item.code}><td>{item.name}<br /><code>{item.code}</code></td><td>{item.policyDocuments}</td><td>{item.rules}</td><td>{item.timelines}</td><td>{item.schools}</td><td>{item.catchments}</td><td>{item.primary} / {item.junior}</td></tr>)}</tbody></table>
                                </div>
                                <h3 className="coverage-subheading">咨询场景规则索引</h3>
                                <div className="table-wrap" tabIndex={0} aria-label={`${city.name}咨询场景覆盖表`}>
                                  <table><thead><tr><th>家庭咨询场景</th><th>规则行</th><th>关联政策</th><th>规则类型</th><th>样例</th></tr></thead><tbody>{selectedData.scenarioCoverage.map((item) => <tr key={item.scenario}><td>{item.scenarioLabel}<br /><code>{item.scenario}</code></td><td>{item.ruleRows}</td><td>{item.policyCount}</td><td>{Object.entries(item.ruleTypeCounts).map(([key, value]) => `${ruleTypeLabels[key] ?? key} ${value}`).join(" · ") || "缺口"}</td><td>{item.sample ?? "当前没有已归类规则"}</td></tr>)}</tbody></table>
                                </div>
                                <div className="note-box">{educationSummary.nullSemantics} 城市—学段覆盖完成不等于每个区县、每所学校和每个详情字段均已穷尽。</div>
                              </div>
                            ) : null}
                            {view !== "coverage" && currentCount === 0 ? <div className="empty-search">当前筛选条件下没有记录。可清除搜索或切换学段、区域。</div> : null}
                          </div>

                          {view !== "coverage" && visibleLimit < currentCount ? <button className="load-more" onClick={() => setVisibleLimit((value) => value + 24)}>再显示 24 条<span>已显示 {Math.min(visibleLimit, currentCount)} / {currentCount}</span></button> : null}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </Fragment>
              ))}
            </div>
          </section>

          <section className="education-boundary">
            <div><span>V3数据边界</span><h2>基础事实、对口记录与待审证据，状态不能混用。</h2></div>
            <ul>
              <li>可用城市—学段覆盖 {educationSummary.metrics.operationalCityStageCoverage}/{educationSummary.metrics.expectedCityStageCoverage}；严格当年现行覆盖 {educationSummary.metrics.strictCurrentCityStageCoverage}/{educationSummary.metrics.expectedCityStageCoverage}。</li>
              <li>完整区级政策覆盖 {educationSummary.metrics.completeDistrictStageCoverage}/{educationSummary.metrics.expectedDistrictStageCoverage}；学校区县—学段覆盖 {educationSummary.metrics.schoolDistrictStageCoverage}/{educationSummary.metrics.expectedDistrictStageCoverage}。</li>
              <li>{educationSummary.metrics.officialCatchments}条对口记录来自高权威官方来源；{educationSummary.metrics.reviewCatchments}条第三方记录保持待核验，不能用于确定性对口回答。</li>
              <li>{educationSummary.metrics.retrievalPackets}个轻量证据包用于Agent检索与复核，只有{educationSummary.metrics.highQualityPackets}个被标记为高质量候选。</li>
            </ul>
          </section>
        </main>
      </div>

      <footer>
        <div><strong>房产决策知识库</strong><span>教育政策V3 · 31城义务教育、学校与对口范围</span></div>
        <div><span>{educationSummary.release}</span><span>截至 {educationSummary.asOfDate}</span></div>
      </footer>
    </div>
  );
}
