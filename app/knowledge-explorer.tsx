"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  cities,
  cityNames,
  knowledgeMeta,
  sections,
  type CityKey,
  type KnowledgeSection,
} from "./knowledge-data";

type FilterKey = CityKey | "all";

const filterItems: { key: FilterKey; label: string; caption: string }[] = [
  { key: "all", label: "总览", caption: "全国通则 + 12 城市" },
  { key: "beijing", label: "北京", caption: "五环内外" },
  { key: "shenzhen", label: "深圳", caption: "分区资格" },
  { key: "guangzhou", label: "广州", caption: "取消限购" },
  { key: "shanghai", label: "上海", caption: "外环 + 房产税" },
  { key: "tianjin", label: "天津", caption: "贷款按区" },
  { key: "wuhan", label: "武汉", caption: "公积金三价取低" },
  { key: "hangzhou", label: "杭州", caption: "积分场景消歧" },
  { key: "suzhou", label: "苏州", caption: "限时公积金" },
  { key: "chengdu", label: "成都", caption: "规则有效期" },
  { key: "chongqing", label: "重庆", caption: "房产税试点" },
  { key: "xian", label: "西安", caption: "双公积金中心" },
  { key: "nanjing", label: "南京", caption: "保障房分流" },
  { key: "common", label: "全国通则", caption: "产权、合同、信贷与税费" },
];

function searchableText(section: KnowledgeSection) {
  return [
    cityNames[section.city],
    section.category,
    section.title,
    section.summary,
    ...(section.details ?? []),
    ...(section.formula ?? []),
    section.note ?? "",
    ...(section.keywords ?? []),
    ...(section.table?.headers ?? []),
    ...(section.table?.rows.flat() ?? []),
    ...(section.sources?.flatMap((source) => [source.title, source.url]) ?? []),
  ]
    .join(" ")
    .toLocaleLowerCase("zh-CN");
}

function matchSection(section: KnowledgeSection, query: string) {
  const terms = query
    .trim()
    .toLocaleLowerCase("zh-CN")
    .split(/\s+/)
    .filter(Boolean);
  if (!terms.length) return false;
  const text = searchableText(section);
  return terms.every((term) => text.includes(term));
}

function snippetFor(section: KnowledgeSection, query: string) {
  const candidates = [
    section.summary,
    ...(section.details ?? []),
    ...(section.table?.rows.flat() ?? []),
    ...(section.formula ?? []),
    section.note ?? "",
  ].filter(Boolean);
  const term = query.trim().split(/\s+/)[0]?.toLocaleLowerCase("zh-CN") ?? "";
  const match = candidates.find((candidate) =>
    candidate.toLocaleLowerCase("zh-CN").includes(term),
  );
  const text = match ?? section.summary;
  return text.length > 92 ? `${text.slice(0, 92)}…` : text;
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{text}</>;
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const expression = new RegExp(`(${escaped.join("|")})`, "gi");
  const chunks = text.split(expression);
  return (
    <>
      {chunks.map((chunk, index) =>
        terms.some((term) => chunk.toLocaleLowerCase("zh-CN") === term.toLocaleLowerCase("zh-CN")) ? (
          <mark key={`${chunk}-${index}`}>{chunk}</mark>
        ) : (
          <Fragment key={`${chunk}-${index}`}>{chunk}</Fragment>
        ),
      )}
    </>
  );
}

function SectionCard({ section }: { section: KnowledgeSection }) {
  return (
    <article className="knowledge-card" id={section.id} data-city={section.city}>
      <div className="knowledge-card-heading">
        <div>
          <div className="eyebrow-row">
            <span className={`city-dot city-dot-${section.city}`} />
            <span>{cityNames[section.city]}</span>
            <span className="eyebrow-separator">/</span>
            <span>{section.category}</span>
          </div>
          <h2>{section.title}</h2>
        </div>
        <a className="section-anchor" href={`#${section.id}`} aria-label={`定位到${section.title}`}>
          §
        </a>
      </div>

      <p className="section-summary">{section.summary}</p>

      {section.table ? (
        <div className="table-wrap" tabIndex={0} aria-label={`${section.title}数据表`}>
          <table>
            <thead>
              <tr>
                {section.table.headers.map((header) => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, rowIndex) => (
                <tr key={`${section.id}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${cell}-${cellIndex}`}>
                      {/^(BJ|SZ|GZ|SH|TJ|WH|HZ|SU|CD|CQ|XA|NJ|NAT)-/.test(cell) || cell.includes("@20") ? (
                        <code>{cell}</code>
                      ) : (
                        cell
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {section.formula ? (
        <div className="formula-block">
          {section.formula.map((formula) => (
            <code key={formula}>{formula}</code>
          ))}
        </div>
      ) : null}

      {section.details?.length ? (
        <ul className="detail-list">
          {section.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}

      {section.note ? <div className="note-box">{section.note}</div> : null}

      {section.sources?.length ? (
        <div className="source-list">
          <span>官方依据</span>
          <div>
            {section.sources.map((source) => (
              <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                {source.title}<b aria-hidden="true">↗</b>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function KnowledgeExplorer() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => (query.trim() ? sections.filter((section) => matchSection(section, query)).slice(0, 10) : []),
    [query],
  );

  const visibleSections = useMemo(() => {
    if (filter === "all") return sections.filter((section) => section.city === "common");
    if (filter === "common") return sections.filter((section) => section.city === "common");
    return sections.filter((section) => section.city === filter);
  }, [filter]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape") {
        setQuery("");
        setSearchOpen(false);
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!window.location.hash) return;
    const id = window.location.hash.slice(1);
    const section = sections.find((item) => item.id === id);
    if (!section) return;
    const timer = window.setTimeout(() => setFilter(section.city), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectFilter = (next: FilterKey) => {
    setFilter(next);
    setQuery("");
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openResult = (section: KnowledgeSection) => {
    setFilter(section.city);
    setSearchOpen(false);
    setQuery("");
    window.history.replaceState(null, "", `#${section.id}`);
    window.setTimeout(() => {
      document.getElementById(section.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const selectedLabel = filterItems.find((item) => item.key === filter)?.label ?? "总览";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" onClick={() => selectFilter("all")}>
          <span className="brand-mark">房</span>
          <span>
            <strong>城市交易知识库</strong>
            <small>SECOND-HAND HOUSING KB</small>
          </span>
        </a>

        <div className="search-shell" role="search">
          <span className="search-glyph" aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="搜索城市、资格、税率、首付或规则 ID"
            aria-label="搜索知识库"
          />
          {query ? (
            <button className="clear-search" onClick={() => setQuery("")} aria-label="清除搜索">
              ×
            </button>
          ) : (
            <kbd>/</kbd>
          )}

          {searchOpen && query ? (
            <div className="search-results" aria-live="polite">
              <div className="search-results-meta">
                <span>{results.length ? `找到 ${results.length} 项` : "没有匹配结果"}</span>
                <button onClick={() => setSearchOpen(false)}>关闭</button>
              </div>
              {results.map((section) => (
                <button className="search-result" key={section.id} onClick={() => openResult(section)}>
                  <span className="result-meta">
                    {cityNames[section.city]} · {section.category}
                  </span>
                  <strong><Highlight text={section.title} query={query} /></strong>
                  <p><Highlight text={snippetFor(section, query)} query={query} /></p>
                </button>
              ))}
              {!results.length ? (
                <div className="empty-search">
                  试试“抵押”“定金”“非京籍”“满五唯一”“二套首付”或规则 ID。
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="release-badge">
          <span className="release-pulse" />
          <span>
            <small>当前发布</small>
            <strong>{knowledgeMeta.release}</strong>
          </span>
        </div>
      </header>

      <div className="mobile-filters" aria-label="城市筛选">
        {filterItems.map((item) => (
          <button
            key={item.key}
            className={filter === item.key ? "active" : ""}
            onClick={() => selectFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="page-grid" id="top">
        <aside className="sidebar">
          <div className="sidebar-block">
            <span className="sidebar-label">知识范围</span>
            <nav>
              {filterItems.map((item) => (
                <button
                  key={item.key}
                  className={filter === item.key ? "active" : ""}
                  onClick={() => selectFilter(item.key)}
                >
                  <span>{item.label}</span>
                  <small>{item.caption}</small>
                </button>
              ))}
            </nav>
          </div>

          <div className="sidebar-block section-nav">
            <span className="sidebar-label">本页目录</span>
            {visibleSections.map((section, index) => (
              <a href={`#${section.id}`} key={section.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                {section.title}
              </a>
            ))}
          </div>

          <div className="sidebar-status">
            <span>数据状态</span>
            <strong>人工核验快照</strong>
            <small>监测基线待完整建立</small>
          </div>
        </aside>

        <main className="content">
          <section className="hero">
            <div className="hero-copy">
              <span className="overline">CITY TRANSACTION KNOWLEDGE BASE</span>
              <h1>全国通则，<br />叠加十二个城市政策包。</h1>
              <p>
                面向二手房购买决策，沉淀产权、合同、贷款、税费和城市资格知识。
                每个结论保留规则、版本、适用层级和官方依据。
              </p>
            </div>
            <div className="hero-facts">
              <div><strong>1+12</strong><span>全国 + 城市包</span></div>
              <div><strong>{sections.length}</strong><span>知识主题</span></div>
              <div><strong>{knowledgeMeta.monitoredSources}</strong><span>官方入口</span></div>
              <div><strong>{knowledgeMeta.goldenCases}</strong><span>黄金用例</span></div>
            </div>
          </section>

          <div className="freshness-strip">
            <div>
              <span className="status-dot status-dot-good" />
              <span>政策快照</span>
              <strong>{knowledgeMeta.asOfDate}</strong>
            </div>
            <div>
              <span className="status-dot status-dot-neutral" />
              <span>结构版本</span>
              <strong>{knowledgeMeta.schemaVersion}</strong>
            </div>
            <div>
              <span className="status-dot status-dot-warn" />
              <span>来源监测</span>
              <strong>baseline pending</strong>
            </div>
            <p>政策辅助判断，不替代住建、税务、银行或登记机构正式核验。</p>
          </div>

          <section className="city-section" aria-labelledby="city-heading">
            <div className="section-intro">
              <span>城市政策包</span>
              <h2 id="city-heading">先选城市，再进入完整规则</h2>
              <p>所有城市先应用全国通则；城市包允许不同层级，按限购空间、贷款地域、公积金中心、房产税试点和特殊住房分别组织。</p>
            </div>
            <div className="city-grid">
              {cities.map((city) => (
                <button
                  className={`city-card ${filter === city.key ? "selected" : ""}`}
                  key={city.key}
                  onClick={() => selectFilter(city.key)}
                  style={{ "--city-accent": city.accent } as React.CSSProperties}
                >
                  <div className="city-card-top">
                    <span className="city-code">{city.code}</span>
                    <span className="city-arrow">↗</span>
                  </div>
                  <h3>{city.name}</h3>
                  <p>{city.status}</p>
                  <dl>
                    <div><dt>关键地域</dt><dd>{city.keyInput}</dd></div>
                    <div><dt>商贷最低首付</dt><dd>{city.commercialDown}</dd></div>
                    <div><dt>公积金最低首付</dt><dd>{city.providentDown}</dd></div>
                  </dl>
                  <div className="city-version">
                    <code>{city.version}</code>
                    <span>生效于 {city.effectiveFrom}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="knowledge-section" aria-labelledby="knowledge-heading">
            <div className="section-intro section-intro-row">
              <div>
                <span>详细知识</span>
                <h2 id="knowledge-heading">{selectedLabel}</h2>
              </div>
              <p>{visibleSections.length} 个主题 · 支持规则 ID 全文检索</p>
            </div>
            <div className="knowledge-stack">
              {visibleSections.map((section) => (
                <SectionCard section={section} key={section.id} />
              ))}
            </div>
          </section>
        </main>
      </div>

      <footer>
        <div>
          <strong>城市二手房交易知识库</strong>
          <span>全国通则 · 12 个城市政策包</span>
        </div>
        <div>
          <span>KB {knowledgeMeta.release}</span>
          <span>截至 {knowledgeMeta.asOfDate}</span>
        </div>
      </footer>
    </div>
  );
}
