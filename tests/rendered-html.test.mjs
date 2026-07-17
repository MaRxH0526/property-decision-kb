import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the property decision portal and transaction tab", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>房产决策知识库｜交易政策 \+ 教育政策<\/title>/i);
  assert.match(html, /交易政策/);
  assert.match(html, /教育政策/);
  assert.match(html, /全国通则/);
  assert.match(html, /十二个城市政策包/);
  assert.match(html, /北京/);
  assert.match(html, /深圳/);
  assert.match(html, /广州/);
  assert.match(html, /上海/);
  assert.match(html, /重庆/);
  assert.match(html, /西安/);
  assert.match(html, /南京/);
  assert.match(html, /2026\.07\.16-decision-r1/);
  assert.match(html, /12 城购房资格与精确税费规则已机器化/);
  assert.match(html, /4,159 项断言/);
  assert.match(html, /签合同不等于已经取得房屋产权/);
  assert.match(html, /15% 是全国底线/);
  assert.match(html, /政策时效分级/);
  assert.match(html, /当前已核验/);
  assert.match(html, /当前但需关注/);
  assert.match(html, /陈旧待复核/);
  assert.match(html, /失效或历史/);
  assert.match(html, /搜索城市、资格、税率、首付或规则 ID/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the 12-city transaction decision package as lightweight public JSON", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/data/transaction-decision/manifest.json", import.meta.url), "utf8"));
  const summary = JSON.parse(await readFile(new URL("../public/data/transaction-decision/test-summary.json", import.meta.url), "utf8"));
  const cityFiles = (await readdir(new URL("../public/data/transaction-decision/cities", import.meta.url))).filter((name) => name.endsWith(".json"));

  assert.equal(manifest.release, "2026.07.16-decision-r1");
  assert.equal(manifest.reviewStatus, "validated_snapshot");
  assert.equal(manifest.cityPackages.length, 12);
  assert.equal(manifest.coverage.executableRules, 70);
  assert.equal(manifest.coverage.nationalRules, 14);
  assert.equal(manifest.coverage.cityEligibilityRules, 56);
  assert.equal(manifest.coverage.validationAssertions, 4159);
  assert.equal(cityFiles.length, 12);
  assert.equal(summary.case_count, 348);
  assert.equal(summary.city_counts.length, 12);
  await assert.rejects(access(new URL("../public/data/transaction-decision/tests/golden-cases.json", import.meta.url)));
});

test("removes starter preview assets and metadata", async () => {
  const [page, layout, packageJson, transactionExplorer] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/knowledge-explorer.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /KnowledgePortal/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(transactionExplorer, /toggleCityPackage/);
  assert.match(transactionExplorer, /aria-expanded/);
  assert.doesNotMatch(transactionExplorer, /selectFilter[\s\S]{0,180}window\.scrollTo/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url)));
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("ships the V3 31-city education knowledge base as lazy city packages", async () => {
  const summary = JSON.parse(await readFile(new URL("../app/generated/education-summary.json", import.meta.url), "utf8"));
  const educationFiles = (await readdir(new URL("../public/data/education", import.meta.url))).filter((name) => name.endsWith(".json"));

  assert.equal(summary.validated, true);
  assert.equal(summary.cities.length, 31);
  assert.equal(educationFiles.length, 31);
  assert.equal(summary.metrics.policyDocuments, 441);
  assert.equal(summary.metrics.policyRules, 22038);
  assert.equal(summary.metrics.schools, 9212);
  assert.equal(summary.contentVersion, "V3");
  assert.equal(summary.release, "edu-content-v3@2026-07-17");
  assert.equal(summary.metrics.catchments, 468);
  assert.equal(summary.metrics.officialCatchments, 457);
  assert.equal(summary.metrics.reviewCatchments, 11);
  assert.equal(summary.metrics.retrievalPackets, 349);
  assert.equal(summary.metrics.scenarioCityCombinations, 217);
  assert.equal(summary.extensionValidation.ok, true);
  assert.equal(summary.freshnessModel.version, "policy-freshness-v1");
  assert.deepEqual(summary.freshnessModel.gradeCounts, { A: 259, B: 97, C: 1, D: 84 });
  assert.equal(Object.values(summary.freshnessModel.gradeCounts).reduce((sum, value) => sum + value, 0), 441);

  const beijingSummary = summary.cities.find((city) => city.name === "北京");
  assert.ok(beijingSummary);
  const beijing = JSON.parse(await readFile(new URL(`../public/data/education/${beijingSummary.code}.json`, import.meta.url), "utf8"));
  assert.equal(beijing.contentVersion, "V3");
  assert.equal(beijing.schemaVersion, 2);
  assert.equal(beijing.policies.length, beijingSummary.metrics.policy_documents);
  assert.equal(beijing.rules.length, beijingSummary.metrics.rules);
  assert.equal(beijing.schools.length, beijingSummary.metrics.schools);
  assert.equal(beijing.catchments.length, 11);
  assert.ok(beijing.catchments.every((item) => item.knowledgeStatus === "needs_review"));
  assert.equal(beijing.retrieval.packets.length, beijingSummary.metrics.review_packets);
  assert.ok(beijing.retrieval.packets.every((item) => item.knowledgeStatus === "review_candidate"));
  assert.match(beijing.policies[0].sourceUrl, /^https?:\/\//);
  assert.ok(beijing.policies.every((policy) => /^[ABCD]$/.test(policy.freshnessGrade)));
  assert.ok(beijing.policies.every((policy) => policy.freshnessReason && policy.lastCheckedAt));
  assert.ok(beijing.policies.every((policy) => policy.freshnessModelVersion === "policy-freshness-v1"));
  assert.ok(beijing.rules.every((rule) => rule.ruleText && rule.sourceLocator));
  assert.ok(beijing.schools.every((school) => school.publicStatusEvidence && school.sourceUrl));

  const wuhanSummary = summary.cities.find((city) => city.name === "武汉");
  const wuhan = JSON.parse(await readFile(new URL(`../public/data/education/${wuhanSummary.code}.json`, import.meta.url), "utf8"));
  assert.equal(wuhan.catchments.length, 457);
  assert.ok(wuhan.catchments.every((item) => item.knowledgeStatus === "verified_official"));
  assert.equal(wuhan.scenarioCoverage.length, wuhanSummary.metrics.scenario_groups);
});
