import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateTransactionDecision } from "./evaluate_transaction_decision.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kbRoot = path.join(root, "knowledge/transaction_decision");
const failures = [];
const checks = [];

async function load(relativePath) {
  return JSON.parse(await readFile(path.join(kbRoot, relativePath), "utf8"));
}

function check(condition, message) {
  if (condition) checks.push(message);
  else failures.push(message);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

const manifest = await load("manifest.json");
const national = await load("national/tax-rules.json");
const nationalEvidence = await load("national/evidence.json");
check(manifest.cityPackages.length === 12, "manifest contains 12 city packages");
check(manifest.release === "2026.07.16-decision-r1", "manifest release is fixed");

const globalRuleIds = new Set();
for (const rule of national.rules) {
  check(!globalRuleIds.has(rule.rule_id), `unique national rule id ${rule.rule_id}`);
  globalRuleIds.add(rule.rule_id);
  check(validDate(rule.effective_from), `valid effective_from for ${rule.rule_id}`);
  check(rule.evidence_ids.length > 0, `evidence attached to ${rule.rule_id}`);
}
const nationalEvidenceIds = new Set(nationalEvidence.items.map((item) => item.evidence_id));
for (const rule of national.rules) {
  for (const evidenceId of rule.evidence_ids) check(nationalEvidenceIds.has(evidenceId), `${rule.rule_id} references existing ${evidenceId}`);
}

for (const cityEntry of manifest.cityPackages) {
  await access(path.join(kbRoot, cityEntry.file));
  const city = await load(cityEntry.file);
  check(city.city.code === cityEntry.code, `${cityEntry.name} city code matches manifest`);
  check(city.knowledge_release === manifest.release, `${cityEntry.name} release matches manifest`);
  check(city.purchase_eligibility.rules.length >= 2, `${cityEntry.name} has executable eligibility rules`);
  check(city.tax.inherits === national.packageVersion, `${cityEntry.name} inherits current national tax package`);
  const evidenceIds = new Set(city.evidence.map((item) => item.evidence_id));
  for (const evidence of city.evidence) {
    check(evidence.url.startsWith("https://"), `${cityEntry.name} evidence uses HTTPS: ${evidence.evidence_id}`);
    check(validDate(evidence.effective_from), `${cityEntry.name} evidence has effective date: ${evidence.evidence_id}`);
  }
  for (const rule of city.purchase_eligibility.rules) {
    check(!globalRuleIds.has(rule.rule_id), `unique city rule id ${rule.rule_id}`);
    globalRuleIds.add(rule.rule_id);
    check(validDate(rule.effective_from), `valid effective_from for ${rule.rule_id}`);
    check(["verified", "needs_review"].includes(rule.review_status), `${rule.rule_id} is review-routed`);
    for (const evidenceId of rule.evidence_ids) check(evidenceIds.has(evidenceId), `${rule.rule_id} references existing ${evidenceId}`);
  }
  if (city.tax.assessed_iit.status === "verified") {
    check(typeof city.tax.assessed_iit.default_rate === "number", `${cityEntry.name} verified assessed IIT has numeric rate`);
    check(city.tax.assessed_iit.evidence_ids.length > 0 || cityEntry.code === "310000", `${cityEntry.name} verified assessed IIT has local evidence route`);
  } else {
    check(city.tax.assessed_iit.default_rate === null, `${cityEntry.name} unverified assessed IIT does not hard-code a rate`);
  }
}

const golden = await load("tests/golden-cases.json");
check(golden.case_count === golden.cases.length, "golden case_count matches cases array");
check(golden.cases.length >= 300, "at least 300 materialized golden cases");
check(new Set(golden.cases.map((item) => item.scenario.city_code)).size === 12, "golden cases cover all 12 cities");
check(golden.cases.filter((item) => item.tags.includes("effective_date")).length === 12, "effective-date boundary covered for every city");

let evaluated = 0;
for (const testCase of golden.cases) {
  let result;
  try {
    result = await evaluateTransactionDecision(testCase.scenario);
  } catch (error) {
    failures.push(`${testCase.case_id} evaluator threw: ${error.message}`);
    continue;
  }
  evaluated += 1;
  check(result.purchase_eligibility.status === testCase.expected.purchase_eligibility_status,
    `${testCase.case_id} eligibility ${result.purchase_eligibility.status} == ${testCase.expected.purchase_eligibility_status}`);
  const expectedTaxes = testCase.expected.taxes;
  if (expectedTaxes.skipped) continue;
  const actualByItem = Object.fromEntries(result.tax_items.map((item) => [item.tax_item, item]));
  for (const [taxItem, expectedAmount] of Object.entries(expectedTaxes.items)) {
    const actual = actualByItem[taxItem];
    check(Boolean(actual), `${testCase.case_id} contains ${taxItem}`);
    if (!actual) continue;
    if (expectedAmount === null) check(actual.status === "unknown" && actual.amount === null, `${testCase.case_id} ${taxItem} stays unknown`);
    else check(actual.amount === expectedAmount, `${testCase.case_id} ${taxItem} ${actual.amount} == ${expectedAmount}`);
  }
  for (const missing of expectedTaxes.missing ?? []) check(result.missing_inputs.includes(missing), `${testCase.case_id} reports missing ${missing}`);
  if (expectedTaxes.totals) {
    for (const [field, expectedValue] of Object.entries(expectedTaxes.totals)) {
      check(result.tax_totals[field] === expectedValue, `${testCase.case_id} ${field} ${result.tax_totals[field]} == ${expectedValue}`);
    }
  }
  const sum = result.tax_items.filter((item) => item.actual_bearer === "buyer").map((item) => item.amount);
  if (!sum.includes(null) && result.tax_totals.buyer_actual_cash_taxes !== null) {
    check(round2(sum.reduce((total, amount) => total + amount, 0)) === result.tax_totals.buyer_actual_cash_taxes,
      `${testCase.case_id} buyer cash total reconciles`);
  }
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

if (failures.length) {
  console.error(`Decision knowledge validation failed with ${failures.length} issue(s):`);
  for (const failure of failures.slice(0, 80)) console.error(`- ${failure}`);
  if (failures.length > 80) console.error(`- ... ${failures.length - 80} more`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  release: manifest.release,
  cities: manifest.cityPackages.length,
  rules: globalRuleIds.size,
  golden_cases: golden.cases.length,
  evaluated_cases: evaluated,
  assertions: checks.length,
}, null, 2));
