export type FreshnessGrade = "A" | "B" | "C" | "D";

export type CitationMode =
  | "allowed"
  | "allowed_with_disclosure"
  | "needs_revalidation"
  | "historical_only";

export type FreshnessAssessment = {
  freshnessGrade: FreshnessGrade;
  citationMode: CitationMode;
  freshnessReason: string;
  publishedAt: string | null;
  lastCheckedAt: string | null;
  publicationAgeDays: number | null;
  verificationAgeDays: number | null;
};

export const freshnessGradeDefinitions: Record<
  FreshnessGrade,
  { label: string; meaning: string; citation: string }
> = {
  A: {
    label: "当前已核验",
    meaning: "现行或当年政策，来源和文本状态完整。",
    citation: "可正常引用，仍需保留版本与依据。",
  },
  B: {
    label: "当前但需关注",
    meaning: "政策较旧、仅元数据核验，或属于长期现行文件。",
    citation: "可引用，但必须披露发布和最近检查时间。",
  },
  C: {
    label: "陈旧待复核",
    meaning: "往年回退、链接待核、时间缺失或超过复核周期。",
    citation: "不得单独作出确定结论，引用前先查新官方来源。",
  },
  D: {
    label: "失效或历史",
    meaning: "已过期、被替代或明确废止。",
    citation: "仅用于历史回放，禁止回答当前政策问题。",
  },
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function daysBetween(earlier: string | null | undefined, later: string) {
  const start = parseDate(earlier);
  const end = parseDate(later);
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.valueOf() - start.valueOf()) / 86_400_000));
}

function inferredPublishedAt(title: string, url: string) {
  const compactDate = url.match(/(?:t|\/)(20\d{2})(\d{2})(\d{2})(?:_|\/)/);
  if (compactDate) return `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`;

  const pathDate = url.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
  if (pathDate) {
    return `${pathDate[1]}-${pathDate[2].padStart(2, "0")}-${pathDate[3].padStart(2, "0")}`;
  }

  const monthDate = url.match(/\/(20\d{2})-(\d{2})(?:\/|$)/);
  if (monthDate) return `${monthDate[1]}-${monthDate[2]}-01`;

  const titleYear = title.match(/(20\d{2})\s*年/);
  return titleYear ? `${titleYear[1]}-01-01` : null;
}

export function assessTransactionSource(
  source: {
    title: string;
    url: string;
    publishedAt?: string;
    lastCheckedAt?: string;
    lifecycleStatus?: "current" | "superseded" | "expired";
  },
  asOfDate: string,
): FreshnessAssessment {
  const publishedAt = source.publishedAt ?? inferredPublishedAt(source.title, source.url);
  const lastCheckedAt = source.lastCheckedAt ?? asOfDate;
  const publicationAgeDays = daysBetween(publishedAt, asOfDate);
  const verificationAgeDays = daysBetween(lastCheckedAt, asOfDate);

  if (source.lifecycleStatus === "expired" || source.lifecycleStatus === "superseded") {
    return {
      freshnessGrade: "D",
      citationMode: "historical_only",
      freshnessReason: source.lifecycleStatus === "expired" ? "已过有效期" : "已被后续政策替代",
      publishedAt,
      lastCheckedAt,
      publicationAgeDays,
      verificationAgeDays,
    };
  }

  if (!publishedAt || verificationAgeDays === null || verificationAgeDays > 180) {
    return {
      freshnessGrade: "C",
      citationMode: "needs_revalidation",
      freshnessReason: !publishedAt ? "发布时间尚未结构化" : "超过 180 天未重新检查来源",
      publishedAt,
      lastCheckedAt,
      publicationAgeDays,
      verificationAgeDays,
    };
  }

  if (publicationAgeDays !== null && publicationAgeDays > 730) {
    return {
      freshnessGrade: "B",
      citationMode: "allowed_with_disclosure",
      freshnessReason: "发布超过 2 年，但已在当前快照重新检查",
      publishedAt,
      lastCheckedAt,
      publicationAgeDays,
      verificationAgeDays,
    };
  }

  return {
    freshnessGrade: "A",
    citationMode: "allowed",
    freshnessReason: "近 2 年发布且已在当前快照检查",
    publishedAt,
    lastCheckedAt,
    publicationAgeDays,
    verificationAgeDays,
  };
}

export function formatElapsedTime(days: number | null) {
  if (days === null) return "时间未标注";
  if (days < 31) return `${days} 天`;
  if (days < 365) return `${Math.max(1, Math.round(days / 30))} 个月`;
  const years = days / 365;
  return `${years >= 10 ? Math.round(years) : years.toFixed(1)} 年`;
}

export function formatAge(days: number | null) {
  return days === null ? "时间未标注" : `发布 ${formatElapsedTime(days)}`;
}

export function FreshnessBadge({ assessment }: { assessment: FreshnessAssessment }) {
  const definition = freshnessGradeDefinitions[assessment.freshnessGrade];
  return (
    <span
      className={`freshness-badge freshness-grade-${assessment.freshnessGrade.toLowerCase()}`}
      title={`${definition.meaning}${definition.citation}`}
    >
      <b>{assessment.freshnessGrade}</b>{definition.label}
    </span>
  );
}

export function PolicyFreshnessLegend({
  counts,
  reviewWindowDays,
}: {
  counts?: Partial<Record<FreshnessGrade, number>>;
  reviewWindowDays: number;
}) {
  return (
    <section className="freshness-legend" aria-labelledby="freshness-legend-heading">
      <div className="freshness-legend-intro">
        <span>政策时效分级</span>
        <h2 id="freshness-legend-heading">引用之前，先看有效性和最近检查时间</h2>
        <p>分级综合适用年度、生效状态、发布时间和最近来源检查，不是单纯按文件年龄判定；当前来源复核周期为 {reviewWindowDays} 天。</p>
      </div>
      <div className="freshness-legend-grid">
        {(Object.entries(freshnessGradeDefinitions) as Array<
          [FreshnessGrade, (typeof freshnessGradeDefinitions)[FreshnessGrade]]
        >).map(([grade, item]) => (
          <article className={`freshness-legend-item freshness-grade-${grade.toLowerCase()}`} key={grade}>
            <div><strong>{grade}</strong><span>{item.label}</span>{counts?.[grade] !== undefined ? <b>{counts[grade]}</b> : null}</div>
            <p>{item.meaning}</p>
            <small>{item.citation}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
