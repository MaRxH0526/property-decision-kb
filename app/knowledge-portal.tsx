"use client";

import { useState } from "react";
import { type KnowledgeDomain } from "./domain-tabs";
import { EducationExplorer } from "./education-explorer";
import { TransactionExplorer } from "./knowledge-explorer";

export function KnowledgePortal() {
  const [domain, setDomain] = useState<KnowledgeDomain>("transaction");

  const changeDomain = (next: KnowledgeDomain) => {
    setDomain(next);
    window.history.replaceState(null, "", next === "education" ? "#education" : "#top");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return domain === "education" ? (
    <EducationExplorer onDomainChange={changeDomain} />
  ) : (
    <TransactionExplorer onDomainChange={changeDomain} />
  );
}
