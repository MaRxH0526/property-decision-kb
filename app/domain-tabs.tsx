"use client";

export type KnowledgeDomain = "transaction" | "education";

export function DomainTabs({
  active,
  onChange,
}: {
  active: KnowledgeDomain;
  onChange: (domain: KnowledgeDomain) => void;
}) {
  return (
    <div className="domain-tabs" aria-label="知识库类型">
      <button
        className={active === "transaction" ? "active" : ""}
        onClick={() => onChange("transaction")}
        aria-pressed={active === "transaction"}
      >
        <span>交易政策</span>
        <small>全国 + 12 城</small>
      </button>
      <button
        className={active === "education" ? "active" : ""}
        onClick={() => onChange("education")}
        aria-pressed={active === "education"}
      >
        <span>教育政策</span>
        <small>31 城</small>
      </button>
    </div>
  );
}
