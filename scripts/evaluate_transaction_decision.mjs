import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const kbRoot = path.join(root, "knowledge/transaction_decision");

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

function valueAt(object, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], object);
}

function isMissing(value) {
  return value === undefined || value === null || value === "unknown";
}

function evaluateCondition(condition, context) {
  const actual = valueAt(context, condition.field);
  if (condition.op === "exists") return !isMissing(actual);
  if (isMissing(actual)) return null;
  switch (condition.op) {
    case "eq": return actual === condition.value;
    case "neq": return actual !== condition.value;
    case "in": return condition.value.includes(actual);
    case "not_in": return !condition.value.includes(actual);
    case "gt": return actual > condition.value;
    case "gte": return actual >= condition.value;
    case "lt": return actual < condition.value;
    case "lte": return actual <= condition.value;
    default: throw new Error(`Unsupported operator: ${condition.op}`);
  }
}

function evaluateExpression(expression, context) {
  if (expression.field) return evaluateCondition(expression, context);
  if (expression.all) {
    const results = expression.all.map((item) => evaluateExpression(item, context));
    if (results.includes(false)) return false;
    return results.includes(null) ? null : true;
  }
  if (expression.any) {
    const results = expression.any.map((item) => evaluateExpression(item, context));
    if (results.includes(true)) return true;
    return results.includes(null) ? null : false;
  }
  if (expression.not) {
    const result = evaluateExpression(expression.not, context);
    return result === null ? null : !result;
  }
  throw new Error(`Invalid expression: ${JSON.stringify(expression)}`);
}

function activeOn(rule, queryDate) {
  return rule.effective_from <= queryDate && (!rule.effective_to || queryDate < rule.effective_to);
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function loadPackages(cityCode) {
  const manifest = await loadJson(path.join(kbRoot, "manifest.json"));
  const cityEntry = manifest.cityPackages.find((item) => item.code === cityCode);
  if (!cityEntry) throw new Error(`Unsupported city_code: ${cityCode}`);
  const [national, city] = await Promise.all([
    loadJson(path.join(kbRoot, "national/tax-rules.json")),
    loadJson(path.join(kbRoot, cityEntry.file)),
  ]);
  return { manifest, national, city };
}

function collectUnknownInputs(rules, context) {
  const fields = [];
  for (const rule of rules) {
    if (evaluateExpression(rule.when, context) !== null) continue;
    for (const field of rule.required_inputs) {
      if (isMissing(valueAt(context, field))) fields.push(field);
    }
  }
  return [...new Set(fields)];
}

function pickRule(rules, context, queryDate) {
  const active = rules
    .filter((item) => activeOn(item, queryDate) && !["conflict", "expired"].includes(item.review_status))
    .sort((a, b) => b.priority - a.priority);
  const matched = active.find((item) => evaluateExpression(item.when, context) === true);
  return { matched, active, missing: matched ? [] : collectUnknownInputs(active, context) };
}

function makeTaxItem(rule, context, city) {
  const taxablePrice = context.prices.taxable_transfer_price;
  const formulaId = rule.result.formula_id;
  let amount = null;
  let taxableBase = null;
  let rate = rule.result.rate;
  const localRate = context.seller.iit_assessed_rate ?? city.tax.assessed_iit.default_rate;

  if (rule.result.status === "exempt" || formulaId === "zero") {
    amount = 0;
    taxableBase = 0;
    rate = 0;
  } else if (formulaId === "base_times_rate") {
    taxableBase = taxablePrice;
    amount = round2(taxableBase * rate);
  } else if (formulaId === "housing_vat_full") {
    taxableBase = round2(taxablePrice / 1.03);
    amount = round2(taxableBase * 0.03);
  } else if (formulaId === "vat_surcharges") {
    const vat = context.calculated.vat;
    const cityRate = context.seller.urban_maintenance_tax_rate;
    const reduction = context.seller.is_vat_small_scale_taxpayer ? 0.5 : 1;
    taxableBase = vat;
    rate = cityRate + 0.03 + 0.02;
    amount = round2(vat * rate * reduction);
  } else if (formulaId === "iit_verified") {
    const incomeExcludingVat = taxablePrice - context.calculated.vat;
    taxableBase = Math.max(0, incomeExcludingVat - context.seller.original_value - context.seller.deductible_taxes - context.seller.reasonable_expenses);
    amount = round2(taxableBase * 0.2);
  } else if (formulaId === "iit_assessed") {
    const incomeExcludingVat = taxablePrice - context.calculated.vat;
    taxableBase = round2(incomeExcludingVat);
    rate = localRate;
    amount = round2(taxableBase * localRate);
  } else {
    throw new Error(`Unsupported formula_id: ${formulaId}`);
  }

  const legalTaxpayer = rule.result.legal_taxpayer;
  const actualBearer = legalTaxpayer === "buyer"
    ? "buyer"
    : legalTaxpayer === "seller"
      ? (context.agreement.buyer_bears_seller_taxes === true ? "buyer" : context.agreement.buyer_bears_seller_taxes === false ? "seller" : null)
      : legalTaxpayer;
  return {
    tax_item: rule.result.tax_item,
    legal_taxpayer: legalTaxpayer,
    actual_bearer: actualBearer,
    status: rule.result.status === "exempt" ? "exempt" : "calculated",
    taxable_base: taxableBase,
    rate,
    amount,
    formula: rule.result.formula,
    rule_ids: [rule.rule_id],
  };
}

function unknownTaxItem(taxItem, legalTaxpayer, rule, missing) {
  return {
    tax_item: taxItem,
    legal_taxpayer: legalTaxpayer,
    actual_bearer: null,
    status: "unknown",
    taxable_base: null,
    rate: null,
    amount: null,
    formula: rule?.result.formula ?? `缺少 ${missing.join("、")}`,
    rule_ids: rule ? [rule.rule_id] : [],
  };
}

function sumOrNull(items, predicate) {
  const selected = items.filter(predicate);
  return selected.some((item) => item.amount === null) ? null : round2(selected.reduce((sum, item) => sum + item.amount, 0));
}

export async function evaluateTransactionDecision(scenario) {
  const { manifest, national, city } = await loadPackages(scenario.city_code);
  const context = structuredClone(scenario);
  context.calculated = { vat: null };
  const missingInputs = [];
  const assumptions = [];
  const calculationTrace = [];
  const evidence = new Set();
  const versions = new Set([manifest.release, national.packageVersion, city.package_version]);

  const scopeRule = national.rules.find((item) => item.decision_type === "scope_route");
  const scopeMissing = scopeRule.required_inputs.filter((field) => isMissing(valueAt(context, field)));
  if (scopeMissing.length) missingInputs.push(...scopeMissing);
  const outOfScope = scopeMissing.length === 0 && evaluateExpression(scopeRule.when, context) === true;

  let purchaseEligibility;
  if (outOfScope) {
    purchaseEligibility = { status: "out_of_scope", reason: scopeRule.result.reason, rule_ids: [scopeRule.rule_id] };
    scopeRule.evidence_ids.forEach((id) => evidence.add(id));
    versions.add(scopeRule.version);
  } else {
    const selection = pickRule(city.purchase_eligibility.rules, context, scenario.query_date);
    if (selection.matched) {
      const selected = selection.matched;
      purchaseEligibility = { status: selected.result.status, reason: selected.result.reason, rule_ids: [selected.rule_id] };
      selected.evidence_ids.forEach((id) => evidence.add(id));
      versions.add(selected.version);
    } else {
      missingInputs.push(...selection.missing);
      purchaseEligibility = {
        status: "unknown",
        reason: selection.missing.length ? "缺少确定购房资格所需的关键输入" : "未命中已审核的现行购房资格规则，需人工核验",
        rule_ids: [],
      };
    }
  }

  const taxItems = [];
  if (!outOfScope) {
    const taxOrder = ["deed_tax", "vat", "vat_surcharges", "individual_income_tax", "stamp_duty", "land_appreciation_tax"];
    const taxRules = national.rules.filter((item) => item.decision_type === "tax");
    for (const taxItem of taxOrder) {
      const rules = taxRules.filter((item) => item.result.tax_item === taxItem);
      if (taxItem === "vat_surcharges" && context.calculated.vat === 0) {
        taxItems.push({ tax_item: taxItem, legal_taxpayer: "seller", actual_bearer: context.agreement.buyer_bears_seller_taxes === true ? "buyer" : context.agreement.buyer_bears_seller_taxes === false ? "seller" : null, status: "not_applicable", taxable_base: 0, rate: 0, amount: 0, formula: "增值税为0时不产生附加税费", rule_ids: [] });
        continue;
      }
      if (taxItem === "vat_surcharges" && context.calculated.vat === null) {
        const missing = ["seller.holding_years", "prices.taxable_transfer_price"].filter((field) => isMissing(valueAt(context, field)));
        missingInputs.push(...missing);
        taxItems.push(unknownTaxItem(taxItem, "seller", rules[0], missing));
        continue;
      }
      const selection = pickRule(rules, context, scenario.query_date);
      if (!selection.matched) {
        const missing = selection.missing;
        missingInputs.push(...missing);
        const fallback = rules[0];
        taxItems.push(unknownTaxItem(taxItem, fallback?.result.legal_taxpayer ?? "unknown", fallback, missing));
        continue;
      }
      const rule = selection.matched;
      const requiredMissing = rule.required_inputs.filter((field) => isMissing(valueAt(context, field)));
      if (taxItem === "individual_income_tax" && rule.result.status !== "exempt" && context.calculated.vat === null) {
        requiredMissing.push("seller.holding_years");
      }
      if (rule.result.formula_id === "iit_assessed" && isMissing(context.seller.iit_assessed_rate) && isMissing(city.tax.assessed_iit.default_rate)) {
        requiredMissing.push("seller.iit_assessed_rate");
      }
      if (requiredMissing.length) {
        missingInputs.push(...requiredMissing);
        taxItems.push(unknownTaxItem(taxItem, rule.result.legal_taxpayer, rule, requiredMissing));
        continue;
      }
      const item = makeTaxItem(rule, context, city);
      taxItems.push(item);
      if (taxItem === "vat") context.calculated.vat = item.amount;
      rule.evidence_ids.forEach((id) => evidence.add(id));
      versions.add(rule.version);
      calculationTrace.push(`${rule.rule_id}: ${rule.result.formula} = ${item.amount.toFixed(2)} 元`);
    }
  }

  const buyerLegalTaxes = sumOrNull(taxItems, (item) => item.legal_taxpayer === "buyer");
  const sellerLegalTaxes = sumOrNull(taxItems, (item) => item.legal_taxpayer === "seller");
  let buyerActualCashTaxes;
  if (scenario.agreement.buyer_bears_seller_taxes === null) {
    buyerActualCashTaxes = null;
    missingInputs.push("agreement.buyer_bears_seller_taxes");
  } else {
    buyerActualCashTaxes = sumOrNull(taxItems, (item) => item.actual_bearer === "buyer");
  }

  if (city.tax.assessed_iit.default_rate !== null) {
    assumptions.push(`${city.city.name}核定征收个人所得税默认率采用已核验的 ${(city.tax.assessed_iit.default_rate * 100).toFixed(2)}%`);
    city.tax.assessed_iit.evidence_ids.forEach((id) => evidence.add(id));
  }
  assumptions.push("精确金额以输入的主管税务机关接受计税价格为基础，未用挂牌价、合同价或银行评估价替代");
  assumptions.push(`满五唯一的唯一住房核验范围为${city.tax.unique_home_verification_scope}`);

  return {
    query_date: scenario.query_date,
    city_code: scenario.city_code,
    purchase_eligibility: purchaseEligibility,
    tax_items: taxItems,
    tax_totals: {
      buyer_legal_taxes: outOfScope ? null : buyerLegalTaxes,
      seller_legal_taxes: outOfScope ? null : sellerLegalTaxes,
      buyer_actual_cash_taxes: outOfScope ? null : buyerActualCashTaxes,
      holding_taxes_excluded: city.tax.holding_tax.status === "separate_annual_tax_route" ? null : 0,
    },
    missing_inputs: [...new Set(missingInputs)],
    assumptions,
    calculation_trace: calculationTrace,
    evidence: [...evidence],
    policy_versions: [...versions],
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2] ? await readFile(path.resolve(process.argv[2]), "utf8") : await readStdin();
  if (!input.trim()) throw new Error("Pass a scenario JSON file or pipe JSON to stdin.");
  const result = await evaluateTransactionDecision(JSON.parse(input));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
