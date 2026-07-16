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
  assert.match(html, /2026\.07\.15-r3/);
  assert.match(html, /签合同不等于已经取得房屋产权/);
  assert.match(html, /15% 是全国底线/);
  assert.match(html, /搜索城市、资格、税率、首付或规则 ID/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
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

test("ships the supplied 31-city education knowledge base as lazy city packages", async () => {
  const summary = JSON.parse(await readFile(new URL("../app/generated/education-summary.json", import.meta.url), "utf8"));
  const educationFiles = (await readdir(new URL("../public/data/education", import.meta.url))).filter((name) => name.endsWith(".json"));

  assert.equal(summary.validated, true);
  assert.equal(summary.cities.length, 31);
  assert.equal(educationFiles.length, 31);
  assert.equal(summary.metrics.policyDocuments, 441);
  assert.equal(summary.metrics.policyRules, 22038);
  assert.equal(summary.metrics.schools, 9212);
  assert.equal(summary.release, "edu-schema-v2@2026-07-16");

  const beijingSummary = summary.cities.find((city) => city.name === "北京");
  assert.ok(beijingSummary);
  const beijing = JSON.parse(await readFile(new URL(`../public/data/education/${beijingSummary.code}.json`, import.meta.url), "utf8"));
  assert.equal(beijing.policies.length, beijingSummary.metrics.policy_documents);
  assert.equal(beijing.rules.length, beijingSummary.metrics.rules);
  assert.equal(beijing.schools.length, beijingSummary.metrics.schools);
  assert.match(beijing.policies[0].sourceUrl, /^https?:\/\//);
  assert.ok(beijing.rules.every((rule) => rule.ruleText && rule.sourceLocator));
  assert.ok(beijing.schools.every((school) => school.publicStatusEvidence && school.sourceUrl));
});
