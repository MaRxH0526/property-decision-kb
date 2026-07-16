import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "knowledge/transaction_decision/tests/golden-cases.json");
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const cities = [
  ["110000", "北京", "restricted"], ["440300", "深圳", "restricted"], ["440100", "广州", "unrestricted"],
  ["310000", "上海", "restricted"], ["120000", "天津", "unrestricted"], ["420100", "武汉", "unrestricted"],
  ["330100", "杭州", "unrestricted"], ["320500", "苏州", "unrestricted"], ["510100", "成都", "unrestricted"],
  ["500000", "重庆", "unrestricted"], ["610100", "西安", "unrestricted"], ["320100", "南京", "unrestricted"],
];

const beforeEffectiveDate = {
  "110000": "2025-12-25", "440300": "2026-04-29", "440100": "2024-09-29", "310000": "2026-02-25",
  "120000": "2024-10-15", "420100": "2023-09-18", "330100": "2024-05-08", "320500": "2023-12-31",
  "510100": "2024-04-28", "500000": "2024-08-31", "610100": "2024-05-08", "320100": "2023-09-07",
};

function baseScenario(cityCode) {
  return {
    query_date: "2026-07-16",
    city_code: cityCode,
    district_code: null,
    district_name: null,
    street_name: null,
    buyer: {
      subject_type: "natural_person", residency_type: "local_hukou", household_kind: "family", minor_children_count: 1,
      local_work_residence_permit_valid: false, local_residence_permit_valid: false, local_residence_permit_years: 0,
      continuous_social_tax_months: 0, eligible_work_or_study_status: false,
      housing_count_city: 0, housing_count_target_zone: 0, housing_count_deed_tax_family: 0,
    },
    property: {
      transaction_type: "second_hand_sale", usage: "residential", ownership_type: "ordinary_commodity_housing",
      area_sqm: 100, zone: "other", is_high_end_housing: false, is_detached_house: false,
    },
    seller: {
      subject_type: "natural_person", holding_years: 6, family_only_home_in_required_scope: true,
      original_value: 2000000, deductible_taxes: 10000, reasonable_expenses: 50000,
      iit_method: "assessed", iit_assessed_rate: 0.01, is_vat_small_scale_taxpayer: true, urban_maintenance_tax_rate: 0.07,
    },
    prices: { listing_price: 3200000, contract_price: 3000000, taxable_transfer_price: 3000000, bank_appraisal_price: 2800000 },
    agreement: { buyer_bears_seller_taxes: false },
  };
}

const taxVariants = [
  ["唯一住房_140平边界", (s) => { s.property.area_sqm = 140; }],
  ["唯一住房_超过140平", (s) => { s.property.area_sqm = 140.01; }],
  ["第二套_140平边界", (s) => { s.buyer.housing_count_deed_tax_family = 1; s.property.area_sqm = 140; }],
  ["第二套_超过140平", (s) => { s.buyer.housing_count_deed_tax_family = 1; s.property.area_sqm = 140.01; }],
  ["第三套一般契税", (s) => { s.buyer.housing_count_deed_tax_family = 2; }],
  ["持有不足2年_核实个税", (s) => { s.seller.holding_years = 1; s.seller.family_only_home_in_required_scope = false; s.seller.iit_method = "verified"; }],
  ["持有满2年_核定个税", (s) => { s.seller.holding_years = 2; s.seller.family_only_home_in_required_scope = false; }],
  ["持有4年零点99_未满五", (s) => { s.seller.holding_years = 4.99; s.seller.family_only_home_in_required_scope = true; }],
  ["满5年但非唯一", (s) => { s.seller.holding_years = 5; s.seller.family_only_home_in_required_scope = false; }],
  ["缺少税务计税价格", (s) => { s.prices.taxable_transfer_price = null; }],
  ["缺少持有年限", (s) => { s.seller.holding_years = null; s.seller.family_only_home_in_required_scope = false; }],
  ["个税征收方式待确认", (s) => { s.seller.holding_years = 3; s.seller.family_only_home_in_required_scope = false; s.seller.iit_method = "unknown"; }],
  ["买方合同承担卖方税", (s) => { s.seller.holding_years = 1; s.seller.family_only_home_in_required_scope = false; s.seller.iit_method = "assessed"; s.agreement.buyer_bears_seller_taxes = true; }],
  ["不适用小规模减半", (s) => { s.seller.holding_years = 1; s.seller.family_only_home_in_required_scope = false; s.seller.is_vat_small_scale_taxpayer = false; }],
];

function eligibilityTemplates(cityCode) {
  const common = [
    ["境外个人转专门核验", "conditional", (s) => { s.buyer.residency_type = "foreign_national"; }],
    ["未知户籍信息", "unknown", (s) => { s.buyer.residency_type = "unknown"; }],
    ["政策性住房超出普通规则", "out_of_scope", (s) => { s.property.ownership_type = "policy_housing"; }],
  ];
  if (cityCode === "110000") return [
    ["京籍五环内未达上限", "eligible", (s) => { s.property.zone = "inside_fifth_ring"; s.buyer.housing_count_target_zone = 1; }],
    ["京籍五环内达到两套", "ineligible", (s) => { s.property.zone = "inside_fifth_ring"; s.buyer.housing_count_target_zone = 2; }],
    ["京籍多子女五环内第三套", "eligible", (s) => { s.property.zone = "inside_fifth_ring"; s.buyer.minor_children_count = 2; s.buyer.housing_count_target_zone = 2; }],
    ["京籍多子女五环内达到三套", "ineligible", (s) => { s.property.zone = "inside_fifth_ring"; s.buyer.minor_children_count = 2; s.buyer.housing_count_target_zone = 3; }],
    ["京籍五环外不限套数", "eligible", (s) => { s.property.zone = "outside_fifth_ring"; s.buyer.housing_count_target_zone = 8; }],
    ["非京籍五环内满两年且无房", "eligible", (s) => { s.property.zone = "inside_fifth_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 24; }],
    ["非京籍五环内差一个月", "ineligible", (s) => { s.property.zone = "inside_fifth_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 23; }],
    ["非京籍五环内已有一套", "ineligible", (s) => { s.property.zone = "inside_fifth_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 24; s.buyer.housing_count_target_zone = 1; }],
    ["非京籍多子女五环内第二套", "eligible", (s) => { s.property.zone = "inside_fifth_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 24; s.buyer.minor_children_count = 2; s.buyer.housing_count_target_zone = 1; }],
    ["非京籍五环外满一年", "eligible", (s) => { s.property.zone = "outside_fifth_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 12; }],
    ["非京籍五环外差一个月", "ineligible", (s) => { s.property.zone = "outside_fifth_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 11; }],
    ["缺少五环位置", "unknown", (s) => { s.property.zone = null; }],
    ...common,
  ];
  if (cityCode === "440300") return [
    ["深户核心区第三套", "eligible", (s) => { s.property.zone = "shenzhen_core"; s.buyer.housing_count_target_zone = 2; }],
    ["深户核心区达到三套", "ineligible", (s) => { s.property.zone = "shenzhen_core"; s.buyer.housing_count_target_zone = 3; }],
    ["深户放宽区不限套数", "eligible", (s) => { s.property.zone = "shenzhen_relaxed"; s.buyer.housing_count_target_zone = 8; }],
    ["非深户放宽区第二套", "eligible", (s) => { s.property.zone = "shenzhen_relaxed"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.housing_count_target_zone = 1; }],
    ["非深户放宽区达到两套", "ineligible", (s) => { s.property.zone = "shenzhen_relaxed"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.housing_count_target_zone = 2; }],
    ["盐田大鹏不审核", "eligible", (s) => { s.property.zone = "shenzhen_no_review"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.housing_count_target_zone = 8; }],
    ["非深户满一年核心区第二套", "eligible", (s) => { s.property.zone = "shenzhen_core"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 12; s.buyer.housing_count_target_zone = 1; }],
    ["非深户满一年核心区达到两套", "ineligible", (s) => { s.property.zone = "shenzhen_core"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 12; s.buyer.housing_count_target_zone = 2; }],
    ["居住证路径核心区首套", "eligible", (s) => { s.property.zone = "shenzhen_core"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.local_residence_permit_valid = true; }],
    ["居住证路径核心区已有一套", "ineligible", (s) => { s.property.zone = "shenzhen_core"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.local_residence_permit_valid = true; s.buyer.housing_count_target_zone = 1; }],
    ["无社保无居住证不能买核心区", "ineligible", (s) => { s.property.zone = "shenzhen_core"; s.buyer.residency_type = "nonlocal_hukou"; }],
    ["缺少深圳区域", "unknown", (s) => { s.property.zone = null; }],
    ...common,
  ];
  if (cityCode === "310000") return [
    ["沪籍外环内第二套", "eligible", (s) => { s.property.zone = "inside_shanghai_outer_ring"; s.buyer.housing_count_target_zone = 1; }],
    ["沪籍外环内达到两套", "ineligible", (s) => { s.property.zone = "inside_shanghai_outer_ring"; s.buyer.housing_count_target_zone = 2; }],
    ["沪籍外环外不限套数", "eligible", (s) => { s.property.zone = "outside_shanghai_outer_ring"; s.buyer.housing_count_target_zone = 8; }],
    ["非沪籍满一年外环外", "eligible", (s) => { s.property.zone = "outside_shanghai_outer_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 12; }],
    ["非沪籍满三年外环内第二套", "eligible", (s) => { s.property.zone = "inside_shanghai_outer_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 36; s.buyer.housing_count_target_zone = 1; }],
    ["非沪籍满三年外环内达到两套", "ineligible", (s) => { s.property.zone = "inside_shanghai_outer_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 36; s.buyer.housing_count_target_zone = 2; }],
    ["非沪籍满一年外环内首套", "eligible", (s) => { s.property.zone = "inside_shanghai_outer_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 12; }],
    ["非沪籍满一年外环内已有一套", "ineligible", (s) => { s.property.zone = "inside_shanghai_outer_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 12; s.buyer.housing_count_target_zone = 1; }],
    ["居住证满五年全市首套", "eligible", (s) => { s.property.zone = "inside_shanghai_outer_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.local_residence_permit_years = 5; }],
    ["居住证满五年全市已有一套", "ineligible", (s) => { s.property.zone = "inside_shanghai_outer_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.local_residence_permit_years = 5; s.buyer.housing_count_target_zone = 1; }],
    ["非沪籍未满一年且居住证未满五年", "ineligible", (s) => { s.property.zone = "outside_shanghai_outer_ring"; s.buyer.residency_type = "nonlocal_hukou"; s.buyer.continuous_social_tax_months = 11; s.buyer.local_residence_permit_years = 4.99; }],
    ["缺少外环位置", "unknown", (s) => { s.property.zone = null; }],
    ...common,
  ];
  return [
    ["本地户籍普通商品住房", "eligible", () => {}],
    ["非本地户籍普通商品住房", "eligible", (s) => { s.buyer.residency_type = "nonlocal_hukou"; }],
    ...common,
  ];
}

function expectedTaxes(scenario) {
  if (scenario.property.ownership_type !== "ordinary_commodity_housing") return { skipped: true };
  const base = scenario.prices.taxable_transfer_price;
  const count = scenario.buyer.housing_count_deed_tax_family;
  const area = scenario.property.area_sqm;
  const items = {};
  const missing = [];
  if (base === null) {
    items.deed_tax = null;
    items.vat = scenario.seller.holding_years >= 2 ? 0 : null;
    items.vat_surcharges = items.vat === 0 ? 0 : null;
    items.individual_income_tax = scenario.seller.holding_years >= 5 && scenario.seller.family_only_home_in_required_scope ? 0 : null;
    missing.push("prices.taxable_transfer_price");
    return { items, missing };
  }
  const deedRate = count >= 2 ? 0.03 : count === 0 ? (area <= 140 ? 0.01 : 0.015) : (area <= 140 ? 0.01 : 0.02);
  items.deed_tax = round2(base * deedRate);
  const holding = scenario.seller.holding_years;
  if (holding === null) {
    items.vat = null; items.vat_surcharges = null; items.individual_income_tax = null;
    missing.push("seller.holding_years");
    return { items, missing };
  }
  const vat = holding < 2 ? round2(base / 1.03 * 0.03) : 0;
  items.vat = vat;
  items.vat_surcharges = vat === 0 ? 0 : round2(vat * (scenario.seller.urban_maintenance_tax_rate + 0.05) * (scenario.seller.is_vat_small_scale_taxpayer ? 0.5 : 1));
  if (holding >= 5 && scenario.seller.family_only_home_in_required_scope) {
    items.individual_income_tax = 0;
  } else if (scenario.seller.iit_method === "verified") {
    const taxableIncome = Math.max(0, base - vat - scenario.seller.original_value - scenario.seller.deductible_taxes - scenario.seller.reasonable_expenses);
    items.individual_income_tax = round2(taxableIncome * 0.2);
  } else if (scenario.seller.iit_method === "assessed") {
    items.individual_income_tax = round2((base - vat) * scenario.seller.iit_assessed_rate);
  } else {
    items.individual_income_tax = null;
    missing.push("seller.iit_method");
  }
  const seller = [items.vat, items.vat_surcharges, items.individual_income_tax];
  const sellerTotal = seller.includes(null) ? null : round2(seller.reduce((sum, value) => sum + value, 0));
  const buyerCash = scenario.agreement.buyer_bears_seller_taxes ? (sellerTotal === null ? null : round2(items.deed_tax + sellerTotal)) : items.deed_tax;
  return { items, totals: { buyer_legal_taxes: items.deed_tax, seller_legal_taxes: sellerTotal, buyer_actual_cash_taxes: buyerCash }, missing };
}

const cases = [];
for (const [cityCode, cityName] of cities) {
  const eligibility = eligibilityTemplates(cityCode);
  for (let index = 0; index < 28; index += 1) {
    const scenario = baseScenario(cityCode);
    const [eligibilityName, eligibilityStatus, applyEligibility] = eligibility[index % eligibility.length];
    const [taxName, applyTax] = taxVariants[index % taxVariants.length];
    applyEligibility(scenario);
    applyTax(scenario);
    cases.push({
      case_id: `${cityCode}-${String(index + 1).padStart(3, "0")}`,
      city_name: cityName,
      title: `${eligibilityName}｜${taxName}`,
      tags: ["eligibility", "tax", index % taxVariants.length < 5 ? "threshold" : "calculation"],
      scenario,
      expected: {
        purchase_eligibility_status: eligibilityStatus,
        taxes: expectedTaxes(scenario),
      },
    });
  }
  const historicalScenario = baseScenario(cityCode);
  historicalScenario.query_date = beforeEffectiveDate[cityCode];
  cases.push({
    case_id: `${cityCode}-HIST-001`,
    city_name: cityName,
    title: "现行城市规则生效前不反向套用",
    tags: ["effective_date", "history", "unknown"],
    scenario: historicalScenario,
    expected: { purchase_eligibility_status: "unknown", taxes: { skipped: true } },
  });
}

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  release: "2026.07.16-decision-r1",
  generated_at: "2026-07-16",
  case_count: cases.length,
  coverage: { cities: cities.length, cases_per_city: 29, includes: ["positive", "negative", "threshold_equal", "threshold_adjacent", "missing_input", "out_of_scope", "effective_date_before"] },
  cases,
}, null, 2)}\n`, "utf8");

console.log(`Generated ${cases.length} golden cases at ${output}`);
