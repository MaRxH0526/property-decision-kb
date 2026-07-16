import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "knowledge/transaction_decision/cities");
const release = "2026.07.16-decision-r1";

const c = (field, op, value) => value === undefined ? { field, op } : { field, op, value };
const all = (...items) => ({ all: items });
const any = (...items) => ({ any: items });
const localEquivalent = any(
  c("buyer.residency_type", "eq", "local_hukou"),
  c("buyer.local_work_residence_permit_valid", "eq", true),
);
const nonlocal = c("buyer.residency_type", "eq", "nonlocal_hukou");
const mainlandResidency = c("buyer.residency_type", "in", ["local_hukou", "nonlocal_hukou"]);
const overseasResidency = c("buyer.residency_type", "in", ["hk_macao_taiwan_overseas_chinese", "foreign_national"]);

function rule({ id, cityCode, evidenceId, description, priority, required, when, status, reason, effectiveFrom, reviewStatus = "verified" }) {
  return {
    rule_id: id,
    jurisdiction: cityCode,
    decision_type: "purchase_eligibility",
    description,
    priority,
    required_inputs: required,
    when,
    result: { status, reason },
    effective_from: effectiveFrom,
    effective_to: null,
    evidence_ids: [evidenceId],
    version: `${id}@${effectiveFrom}.1`,
    supersedes: [],
    review_status: reviewStatus,
  };
}

function overseasRule(city) {
  return rule({
    id: `${city.prefix}-ELIG-OVERSEAS-ROUTE`,
    cityCode: city.code,
    evidenceId: city.evidence[0].evidence_id,
    description: "境外个人及港澳台侨购房进入专门核验路径",
    priority: 900,
    required: ["buyer.residency_type"],
    when: overseasResidency,
    status: "conditional",
    reason: "需核验境内工作或学习、居留、自用目的及当地不动产登记材料，不能套用居民家庭规则",
    effectiveFrom: city.effectiveFrom,
    reviewStatus: "needs_review",
  });
}

function unrestrictedRules(city) {
  const evidenceId = city.evidence[0].evidence_id;
  return [
    overseasRule(city),
    rule({
      id: `${city.prefix}-ELIG-001`, cityCode: city.code, evidenceId,
      description: "境内居民购买普通二手商品住房不再进行普遍限购资格审核",
      priority: 500,
      required: ["buyer.residency_type"],
      when: mainlandResidency,
      status: "eligible",
      reason: "现行政策已取消普通商品住房普遍限购；本结论不代表房屋可交易性或贷款获批",
      effectiveFrom: city.effectiveFrom,
    }),
  ];
}

function beijingRules(city) {
  const evidenceId = city.evidence[0].evidence_id;
  const zone = "property.zone";
  const count = "buyer.housing_count_target_zone";
  const children = "buyer.minor_children_count";
  const social = "buyer.continuous_social_tax_months";
  return [
    overseasRule(city),
    rule({ id: "BJ-ELIG-OUT-LOCAL", cityCode: city.code, evidenceId, description: "京籍等同家庭五环外不限套数", priority: 800,
      required: [zone, "buyer.residency_type"], when: all(c(zone, "eq", "outside_fifth_ring"), localEquivalent), status: "eligible", reason: "京籍及持有效北京工作居住证家庭购买五环外普通商品住房不限套数", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-LOCAL-MULTI-YES", cityCode: city.code, evidenceId, description: "京籍多子女家庭五环内最多三套", priority: 790,
      required: [zone, "buyer.residency_type", children, count], when: all(c(zone, "eq", "inside_fifth_ring"), localEquivalent, c(children, "gte", 2), c(count, "lt", 3)), status: "eligible", reason: "有两个及以上未成年子女的京籍等同家庭，五环内可在一般上限基础上增购一套", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-LOCAL-MULTI-NO", cityCode: city.code, evidenceId, description: "京籍多子女家庭五环内已达三套", priority: 785,
      required: [zone, "buyer.residency_type", children, count], when: all(c(zone, "eq", "inside_fifth_ring"), localEquivalent, c(children, "gte", 2), c(count, "gte", 3)), status: "ineligible", reason: "五环内住房套数已达到多子女家庭三套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-LOCAL-YES", cityCode: city.code, evidenceId, description: "京籍一般家庭五环内最多两套", priority: 780,
      required: [zone, "buyer.residency_type", children, count], when: all(c(zone, "eq", "inside_fifth_ring"), localEquivalent, c(children, "lt", 2), c(count, "lt", 2)), status: "eligible", reason: "京籍等同家庭五环内住房套数未达到两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-LOCAL-NO", cityCode: city.code, evidenceId, description: "京籍一般家庭五环内已达两套", priority: 775,
      required: [zone, "buyer.residency_type", children, count], when: all(c(zone, "eq", "inside_fifth_ring"), localEquivalent, c(children, "lt", 2), c(count, "gte", 2)), status: "ineligible", reason: "五环内住房套数已达到一般家庭两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-OUT-NONLOCAL-YES", cityCode: city.code, evidenceId, description: "非京籍五环外需连续一年社保或个税", priority: 760,
      required: [zone, "buyer.residency_type", social], when: all(c(zone, "eq", "outside_fifth_ring"), nonlocal, c(social, "gte", 12)), status: "eligible", reason: "非京籍家庭连续缴纳社保或个税满一年，可购买五环外普通商品住房且不限套数", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-OUT-NONLOCAL-NO", cityCode: city.code, evidenceId, description: "非京籍五环外缴纳不足一年", priority: 755,
      required: [zone, "buyer.residency_type", social], when: all(c(zone, "eq", "outside_fifth_ring"), nonlocal, c(social, "lt", 12)), status: "ineligible", reason: "五环外购房所需连续社保或个税未满一年", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-NONLOCAL-MULTI-YES", cityCode: city.code, evidenceId, description: "非京籍多子女家庭五环内最多两套", priority: 750,
      required: [zone, "buyer.residency_type", social, children, count], when: all(c(zone, "eq", "inside_fifth_ring"), nonlocal, c(social, "gte", 24), c(children, "gte", 2), c(count, "lt", 2)), status: "eligible", reason: "连续缴纳满两年且有两个及以上未成年子女，五环内住房套数未达两套", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-NONLOCAL-MULTI-NO", cityCode: city.code, evidenceId, description: "非京籍多子女家庭五环内已达两套", priority: 745,
      required: [zone, "buyer.residency_type", social, children, count], when: all(c(zone, "eq", "inside_fifth_ring"), nonlocal, c(social, "gte", 24), c(children, "gte", 2), c(count, "gte", 2)), status: "ineligible", reason: "五环内住房套数已达到非京籍多子女家庭两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-NONLOCAL-YES", cityCode: city.code, evidenceId, description: "非京籍一般家庭五环内最多一套", priority: 740,
      required: [zone, "buyer.residency_type", social, children, count], when: all(c(zone, "eq", "inside_fifth_ring"), nonlocal, c(social, "gte", 24), c(children, "lt", 2), c(count, "lt", 1)), status: "eligible", reason: "连续缴纳满两年且五环内无房，可购买一套", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-NONLOCAL-COUNT-NO", cityCode: city.code, evidenceId, description: "非京籍一般家庭五环内已有一套", priority: 735,
      required: [zone, "buyer.residency_type", social, children, count], when: all(c(zone, "eq", "inside_fifth_ring"), nonlocal, c(social, "gte", 24), c(children, "lt", 2), c(count, "gte", 1)), status: "ineligible", reason: "五环内住房套数已达到非京籍一般家庭一套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "BJ-ELIG-IN-NONLOCAL-SOCIAL-NO", cityCode: city.code, evidenceId, description: "非京籍五环内缴纳不足两年", priority: 730,
      required: [zone, "buyer.residency_type", social], when: all(c(zone, "eq", "inside_fifth_ring"), nonlocal, c(social, "lt", 24)), status: "ineligible", reason: "五环内购房所需连续社保或个税未满两年", effectiveFrom: city.effectiveFrom }),
  ];
}

function shenzhenRules(city) {
  const evidenceId = city.evidence[0].evidence_id;
  const zone = "property.zone";
  const count = "buyer.housing_count_target_zone";
  const social = "buyer.continuous_social_tax_months";
  const permit = "buyer.local_residence_permit_valid";
  return [
    overseasRule(city),
    rule({ id: "SZ-ELIG-NO-REVIEW", cityCode: city.code, evidenceId, description: "盐田和大鹏不审核居民购房资格", priority: 850, required: [zone, "buyer.residency_type"], when: all(c(zone, "eq", "shenzhen_no_review"), mainlandResidency), status: "eligible", reason: "盐田区、大鹏新区普通商品住房不审核居民购房资格和套数", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-RELAXED-LOCAL", cityCode: city.code, evidenceId, description: "深户家庭放宽区不限套数", priority: 840, required: [zone, "buyer.residency_type"], when: all(c(zone, "eq", "shenzhen_relaxed"), c("buyer.residency_type", "eq", "local_hukou")), status: "eligible", reason: "深户家庭在放宽区购买普通商品住房不限套数", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-RELAXED-NONLOCAL-YES", cityCode: city.code, evidenceId, description: "非深户放宽区最多两套", priority: 835, required: [zone, "buyer.residency_type", count], when: all(c(zone, "eq", "shenzhen_relaxed"), nonlocal, c(count, "lt", 2)), status: "eligible", reason: "非深户家庭在放宽区的住房套数未达到两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-RELAXED-NONLOCAL-NO", cityCode: city.code, evidenceId, description: "非深户放宽区已达两套", priority: 830, required: [zone, "buyer.residency_type", count], when: all(c(zone, "eq", "shenzhen_relaxed"), nonlocal, c(count, "gte", 2)), status: "ineligible", reason: "非深户家庭在放宽区的住房套数已达到两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-CORE-LOCAL-YES", cityCode: city.code, evidenceId, description: "深户核心区最多三套", priority: 820, required: [zone, "buyer.residency_type", count], when: all(c(zone, "eq", "shenzhen_core"), c("buyer.residency_type", "eq", "local_hukou"), c(count, "lt", 3)), status: "eligible", reason: "深户家庭在核心区住房套数未达到三套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-CORE-LOCAL-NO", cityCode: city.code, evidenceId, description: "深户核心区已达三套", priority: 815, required: [zone, "buyer.residency_type", count], when: all(c(zone, "eq", "shenzhen_core"), c("buyer.residency_type", "eq", "local_hukou"), c(count, "gte", 3)), status: "ineligible", reason: "深户家庭在核心区住房套数已达到三套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-CORE-NONLOCAL-SOCIAL-YES", cityCode: city.code, evidenceId, description: "非深户满一年核心区最多两套", priority: 810, required: [zone, "buyer.residency_type", social, count], when: all(c(zone, "eq", "shenzhen_core"), nonlocal, c(social, "gte", 12), c(count, "lt", 2)), status: "eligible", reason: "非深户家庭连续社保或个税满一年且核心区住房套数未达两套", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-CORE-NONLOCAL-SOCIAL-NO", cityCode: city.code, evidenceId, description: "非深户满一年核心区已达两套", priority: 805, required: [zone, "buyer.residency_type", social, count], when: all(c(zone, "eq", "shenzhen_core"), nonlocal, c(social, "gte", 12), c(count, "gte", 2)), status: "ineligible", reason: "非深户满一年家庭在核心区已达到两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-CORE-PERMIT-YES", cityCode: city.code, evidenceId, description: "非深户未满一年但有居住证核心区最多一套", priority: 800, required: [zone, "buyer.residency_type", social, permit, count], when: all(c(zone, "eq", "shenzhen_core"), nonlocal, c(social, "lt", 12), c(permit, "eq", true), c(count, "lt", 1)), status: "eligible", reason: "持有效深圳经济特区居住证且核心区无房，可购买一套", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-CORE-PERMIT-NO", cityCode: city.code, evidenceId, description: "非深户居住证路径核心区已有一套", priority: 795, required: [zone, "buyer.residency_type", social, permit, count], when: all(c(zone, "eq", "shenzhen_core"), nonlocal, c(social, "lt", 12), c(permit, "eq", true), c(count, "gte", 1)), status: "ineligible", reason: "居住证路径在核心区已达到一套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SZ-ELIG-CORE-NONLOCAL-NO", cityCode: city.code, evidenceId, description: "非深户未满一年且无有效居住证不能买核心区", priority: 790, required: [zone, "buyer.residency_type", social, permit], when: all(c(zone, "eq", "shenzhen_core"), nonlocal, c(social, "lt", 12), c(permit, "eq", false)), status: "ineligible", reason: "连续社保或个税未满一年且无有效深圳经济特区居住证", effectiveFrom: city.effectiveFrom }),
  ];
}

function shanghaiRules(city) {
  const evidenceId = city.evidence[0].evidence_id;
  const zone = "property.zone";
  const count = "buyer.housing_count_target_zone";
  const social = "buyer.continuous_social_tax_months";
  const permitYears = "buyer.local_residence_permit_years";
  return [
    overseasRule(city),
    rule({ id: "SH-ELIG-OUT-LOCAL", cityCode: city.code, evidenceId, description: "沪籍外环外不限套数", priority: 850, required: [zone, "buyer.residency_type"], when: all(c(zone, "eq", "outside_shanghai_outer_ring"), c("buyer.residency_type", "eq", "local_hukou")), status: "eligible", reason: "沪籍居民家庭或成年单身人士购买外环外住房不限套数", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-IN-LOCAL-YES", cityCode: city.code, evidenceId, description: "沪籍外环内最多两套", priority: 845, required: [zone, "buyer.residency_type", count], when: all(c(zone, "eq", "inside_shanghai_outer_ring"), c("buyer.residency_type", "eq", "local_hukou"), c(count, "lt", 2)), status: "eligible", reason: "沪籍家庭外环内住房套数未达到两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-IN-LOCAL-NO", cityCode: city.code, evidenceId, description: "沪籍外环内已达两套", priority: 840, required: [zone, "buyer.residency_type", count], when: all(c(zone, "eq", "inside_shanghai_outer_ring"), c("buyer.residency_type", "eq", "local_hukou"), c(count, "gte", 2)), status: "ineligible", reason: "沪籍家庭外环内住房套数已达到两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-IN-NONLOCAL-3Y-YES", cityCode: city.code, evidenceId, description: "非沪籍满三年外环内最多两套", priority: 835, required: [zone, "buyer.residency_type", social, count], when: all(c(zone, "eq", "inside_shanghai_outer_ring"), nonlocal, c(social, "gte", 36), c(count, "lt", 2)), status: "eligible", reason: "非沪籍连续社保或个税满三年且外环内住房套数未达两套", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-IN-NONLOCAL-3Y-NO", cityCode: city.code, evidenceId, description: "非沪籍满三年外环内已达两套", priority: 830, required: [zone, "buyer.residency_type", social, count], when: all(c(zone, "eq", "inside_shanghai_outer_ring"), nonlocal, c(social, "gte", 36), c(count, "gte", 2)), status: "ineligible", reason: "非沪籍满三年路径已达到外环内两套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-IN-NONLOCAL-1Y-YES", cityCode: city.code, evidenceId, description: "非沪籍满一年不足三年外环内最多一套", priority: 825, required: [zone, "buyer.residency_type", social, count], when: all(c(zone, "eq", "inside_shanghai_outer_ring"), nonlocal, c(social, "gte", 12), c(social, "lt", 36), c(count, "lt", 1)), status: "eligible", reason: "非沪籍连续社保或个税满一年不足三年且外环内无房", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-IN-NONLOCAL-1Y-NO", cityCode: city.code, evidenceId, description: "非沪籍满一年不足三年外环内已有一套", priority: 820, required: [zone, "buyer.residency_type", social, count], when: all(c(zone, "eq", "inside_shanghai_outer_ring"), nonlocal, c(social, "gte", 12), c(social, "lt", 36), c(count, "gte", 1)), status: "ineligible", reason: "非沪籍满一年不足三年路径已达到外环内一套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-OUT-NONLOCAL-YES", cityCode: city.code, evidenceId, description: "非沪籍满一年外环外不限套数", priority: 815, required: [zone, "buyer.residency_type", social], when: all(c(zone, "eq", "outside_shanghai_outer_ring"), nonlocal, c(social, "gte", 12)), status: "eligible", reason: "非沪籍连续社保或个税满一年，购买外环外住房不限套数", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-PERMIT5-YES", cityCode: city.code, evidenceId, description: "非沪籍居住证满五年全市最多一套", priority: 810, required: ["buyer.residency_type", permitYears, count], when: all(nonlocal, c(permitYears, "gte", 5), c(count, "lt", 1)), status: "eligible", reason: "上海居住证满五年可在全市购买一套住房且不要求社保或个税", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-PERMIT5-NO", cityCode: city.code, evidenceId, description: "居住证满五年路径全市已有一套", priority: 805, required: ["buyer.residency_type", permitYears, count], when: all(nonlocal, c(permitYears, "gte", 5), c(count, "gte", 1)), status: "ineligible", reason: "居住证满五年路径已达到全市一套上限", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-OUT-NONLOCAL-NO", cityCode: city.code, evidenceId, description: "非沪籍未满一年不能按一般路径购买", priority: 800, required: [zone, "buyer.residency_type", social, permitYears], when: all(c(zone, "eq", "outside_shanghai_outer_ring"), nonlocal, c(social, "lt", 12), c(permitYears, "lt", 5)), status: "ineligible", reason: "连续社保或个税未满一年，且上海居住证未满五年", effectiveFrom: city.effectiveFrom }),
    rule({ id: "SH-ELIG-IN-NONLOCAL-SOCIAL-NO", cityCode: city.code, evidenceId, description: "非沪籍未满一年不能买外环内", priority: 795, required: [zone, "buyer.residency_type", social, permitYears], when: all(c(zone, "eq", "inside_shanghai_outer_ring"), nonlocal, c(social, "lt", 12), c(permitYears, "lt", 5)), status: "ineligible", reason: "连续社保或个税未满一年，且上海居住证未满五年", effectiveFrom: city.effectiveFrom }),
  ];
}

const cityDefinitions = [
  {
    code: "110000", slug: "beijing", name: "北京", prefix: "BJ", effectiveFrom: "2025-12-26", model: "beijing",
    evidence: [
      { evidence_id: "BJ-EVID-ELIG-2025", title: "北京市住房城乡建设委等关于进一步优化调整本市房地产相关政策的通知", url: "https://www.beijing.gov.cn/gate/big5/www.beijing.gov.cn/zhengce/zhengcefagui/202512/t20251225_4361661.html", authority: "北京市人民政府", clause_summary: "五环内外、京籍等同家庭、非京籍社保个税年限和多子女增购规则", effective_from: "2025-12-26", review_status: "verified" },
      { evidence_id: "BJ-EVID-ELIG-GUIDE", title: "北京市购房资格核验页面", url: "https://zjw.beijing.gov.cn/bjjs/fdcjy/gfzg87/index.shtml", authority: "北京市住房和城乡建设委员会", clause_summary: "购房资格核验主体、材料和特殊人群办事口径", effective_from: "2025-12-26", review_status: "verified" },
    ],
  },
  {
    code: "440300", slug: "shenzhen", name: "深圳", prefix: "SZ", effectiveFrom: "2026-04-30", model: "shenzhen",
    evidence: [
      { evidence_id: "SZ-EVID-ELIG-2026-86", title: "深建字〔2026〕86号", url: "https://zjj.sz.gov.cn/xxgk/tzgg/content/post_12759895.html", authority: "深圳市住房和建设局", clause_summary: "核心区家庭增购一套、非深户居住证路径和现行住房套数上限", effective_from: "2026-04-30", review_status: "verified" },
      { evidence_id: "SZ-EVID-ZONE-2025", title: "深圳市分区优化房地产市场政策", url: "https://www.sz.gov.cn/cn/xxgk/zfxxgj/zwdt/content/post_12365285.html", authority: "深圳市人民政府", clause_summary: "核心区、放宽区、盐田大鹏不审核区的地域划分", effective_from: "2025-09-06", review_status: "verified" },
    ],
  },
  {
    code: "440100", slug: "guangzhou", name: "广州", prefix: "GZ", effectiveFrom: "2024-09-30", model: "unrestricted",
    evidence: [{ evidence_id: "GZ-EVID-ELIG-2024", title: "广州市人民政府办公厅关于调整房地产市场平稳健康发展措施的通知", url: "https://www.gz.gov.cn/zwgk/fggw/sfbgtwj/content/post_9896008.html", authority: "广州市人民政府", clause_summary: "取消居民家庭购买住房的各项限购政策", effective_from: "2024-09-30", review_status: "verified" }],
  },
  {
    code: "310000", slug: "shanghai", name: "上海", prefix: "SH", effectiveFrom: "2026-02-26", model: "shanghai",
    evidence: [
      { evidence_id: "SH-EVID-ELIG-2026", title: "关于进一步优化调整本市房地产政策的通知", url: "https://www.shanghai.gov.cn/nw31406/20260227/961ca351f504470f90ff4d3d001bb613.html", authority: "上海市人民政府", clause_summary: "外环内外、沪籍和非沪籍社保个税年限、居住证满五年购房规则", effective_from: "2026-02-26", review_status: "verified" },
      { evidence_id: "SH-EVID-TAX-GE2", title: "个人转让购买满2年住房涉税事项", url: "https://shanghai.chinatax.gov.cn/tax/xwdt/ztzl/grsx/fwjy/csfclsx/202411/t474237.html", authority: "国家税务总局上海市税务局", clause_summary: "满2年增值税免征、个税核实20%及核定1%", effective_from: "2024-12-01", review_status: "verified" },
    ],
  },
  {
    code: "120000", slug: "tianjin", name: "天津", prefix: "TJ", effectiveFrom: "2024-10-16", model: "unrestricted",
    evidence: [{ evidence_id: "TJ-EVID-ELIG-2024", title: "天津取消住房限制性措施政策解读", url: "https://www.tj.gov.cn/zwgk/zcjd/202410/t20241016_6754085.html", authority: "天津市人民政府", clause_summary: "本市与非本市居民购买新建和二手住房不再提交资格证明", effective_from: "2024-10-16", review_status: "verified" }],
  },
  {
    code: "420100", slug: "wuhan", name: "武汉", prefix: "WH", effectiveFrom: "2023-09-19", model: "unrestricted",
    evidence: [{ evidence_id: "WH-EVID-ELIG-2023", title: "关于进一步促进我市房地产市场平稳健康发展的通知", url: "https://zgj.wuhan.gov.cn/zwdt/tzgg/202309/t20230928_2273274.shtml", authority: "武汉市住房保障和房屋管理局", clause_summary: "取消二环线以内住房限购，居民家庭不再受购房资格限制", effective_from: "2023-09-19", review_status: "verified" }],
  },
  {
    code: "330100", slug: "hangzhou", name: "杭州", prefix: "HZ", effectiveFrom: "2024-05-09", model: "unrestricted",
    evidence: [{ evidence_id: "HZ-EVID-ELIG-2024", title: "杭州全面取消住房限购政策", url: "https://www.hzarchives.org.cn/info/12166", authority: "杭州市档案馆政策发布存档", clause_summary: "在杭州市范围内购买住房不再审核购房资格", effective_from: "2024-05-09", review_status: "verified" }],
  },
  {
    code: "320500", slug: "suzhou", name: "苏州", prefix: "SU", effectiveFrom: "2024-01-01", model: "unrestricted",
    evidence: [{ evidence_id: "SU-EVID-ELIG-CURRENT", title: "苏州住房政策回顾与现行口径", url: "https://www.suzhou.gov.cn/2025ndzt/fjxsd/202601/37a3fd39b7464851b0ecc266a9fea2d8.shtml", authority: "苏州市人民政府", clause_summary: "苏州已逐步全面取消住房限购和限售政策", effective_from: "2024-01-01", review_status: "verified" }],
  },
  {
    code: "510100", slug: "chengdu", name: "成都", prefix: "CD", effectiveFrom: "2024-04-29", model: "unrestricted",
    evidence: [{ evidence_id: "CD-EVID-ELIG-2024", title: "成都取消住房交易限购政策", url: "https://jst.sc.gov.cn/scjst/cjfdcscpwjkfz/2024/4/29/bf2d4d6577f94b15ac7a04feda6f0a31.shtml", authority: "四川省住房和城乡建设厅", clause_summary: "全市范围内住房交易不再审核购房资格", effective_from: "2024-04-29", review_status: "verified" }],
  },
  {
    code: "500000", slug: "chongqing", name: "重庆", prefix: "CQ", effectiveFrom: "2024-09-01", model: "unrestricted",
    evidence: [
      { evidence_id: "CQ-EVID-MARKET-2024", title: "重庆调整优化房地产交易政策", url: "https://cq.gov.cn/ywdt/bmts/202409/t20240902_13583768.html", authority: "重庆市人民政府", clause_summary: "普通商品住房交易按区县认定信贷套数，取得产权证后可交易；特殊保障住房另行审核", effective_from: "2024-09-01", review_status: "verified" },
      { evidence_id: "CQ-EVID-PROPERTY-TAX-2025", title: "重庆市个人住房房产税试点政策", url: "https://www.cq.gov.cn/zwgk/zfxxgkml/szfwj/xzgfxwj/szfbgt/202505/t20250527_14659500_app.html", authority: "重庆市人民政府", clause_summary: "高档住房和独栋商品住宅个人住房房产税的征税对象、税率和免税面积", effective_from: "2025-01-01", review_status: "verified" },
    ],
  },
  {
    code: "610100", slug: "xian", name: "西安", prefix: "XA", effectiveFrom: "2024-05-09", model: "unrestricted",
    evidence: [{ evidence_id: "XA-EVID-ELIG-2024", title: "西安全面取消住房限购措施", url: "https://big5.cctv.com/gate/big5/jingji.cctv.com/2024/05/09/ARTIvqXhD0sagPIMLGI3Yau5240509.shtml", authority: "央视网转引西安市住房和城乡建设局", clause_summary: "居民家庭购买新房和二手房不再审核购房资格", effective_from: "2024-05-09", review_status: "verified" }],
  },
  {
    code: "320100", slug: "nanjing", name: "南京", prefix: "NJ", effectiveFrom: "2023-09-08", model: "unrestricted",
    evidence: [{ evidence_id: "NJ-EVID-ELIG-2023", title: "南京全市取消普通住房购房证明", url: "https://fcj.nanjing.gov.cn/dtxx/mtdt/202309/t20230908_4005817.html", authority: "南京市住房保障和房产局", clause_summary: "玄武等四区取消购房证明后，全市购买商品住房不再需要购房证明", effective_from: "2023-09-08", review_status: "verified" }],
  },
];

const taxConfigByCity = {
  "110000": { unique_home_scope: "北京市", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required" },
  "440300": { unique_home_scope: "广东省", iit_assessed_rate: 0.01, iit_rate_status: "verified", iit_evidence: { evidence_id: "GD-EVID-IIT-ASSESS", title: "广东省个人转让二手房个人所得税核定征收率", url: "https://guangdong.chinatax.gov.cn/gdsw/sffggzs/2018-07/05/content_6ba6344d1cbf401599b81c5b7791d268.shtml", authority: "国家税务总局广东省税务局", clause_summary: "住房转让收入按5%核定应纳税所得额并按20%税率计算，折合收入1%", effective_from: "2018-07-01", review_status: "verified" } },
  "440100": { unique_home_scope: "广东省", iit_assessed_rate: 0.01, iit_rate_status: "verified", iit_evidence: { evidence_id: "GD-EVID-IIT-ASSESS", title: "广东省个人转让二手房个人所得税核定征收率", url: "https://guangdong.chinatax.gov.cn/gdsw/sffggzs/2018-07/05/content_6ba6344d1cbf401599b81c5b7791d268.shtml", authority: "国家税务总局广东省税务局", clause_summary: "住房转让收入按5%核定应纳税所得额并按20%税率计算，折合收入1%", effective_from: "2018-07-01", review_status: "verified" } },
  "310000": { unique_home_scope: "上海市", iit_assessed_rate: 0.01, iit_rate_status: "verified", holding_tax_route: "shanghai_personal_housing_property_tax" },
  "120000": { unique_home_scope: "天津市", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required" },
  "420100": { unique_home_scope: "湖北省", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required" },
  "330100": { unique_home_scope: "浙江省", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required" },
  "320500": { unique_home_scope: "江苏省", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required" },
  "510100": { unique_home_scope: "四川省", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required" },
  "500000": { unique_home_scope: "重庆市", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required", holding_tax_route: "chongqing_personal_housing_property_tax" },
  "610100": { unique_home_scope: "陕西省", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required" },
  "320100": { unique_home_scope: "江苏省", iit_assessed_rate: null, iit_rate_status: "authority_confirmation_required" },
};

function holdingTax(city) {
  if (city.code === "310000") {
    return {
      status: "separate_annual_tax_route",
      included_in_closing_tax_total: false,
      exact_amount_status: "requires_dedicated_household_area_and_exemption_inputs",
      required_inputs: ["acquisition_date", "household_members", "household_owned_area_sqm", "newly_acquired_taxable_area_sqm", "applicable_exemptions"],
      reason: "上海个人住房房产税属于持有环节；当前交易场景 Schema 不足以确定年度金额，必须单独评估。",
      evidence_ids: ["SH-EVID-ELIG-2026"],
    };
  }
  if (city.code === "500000") {
    return {
      status: "separate_annual_tax_route",
      included_in_closing_tax_total: false,
      exact_amount_status: "requires_taxable_housing_confirmation",
      trigger: "高档住房或独栋商品住宅等法定征税对象",
      required_inputs: ["property.is_high_end_housing", "property.is_detached_house", "tax_authority_confirmed_taxable_value", "tax_free_area_sqm", "applicable_rate"],
      reason: "重庆个人住房房产税属于持有环节，须先由主管部门确认征税对象、免税面积和适用税率。",
      evidence_ids: ["CQ-EVID-PROPERTY-TAX-2025"],
    };
  }
  return { status: "not_configured_for_ordinary_resale", included_in_closing_tax_total: false };
}

await mkdir(outputDir, { recursive: true });
for (const city of cityDefinitions) {
  const tax = taxConfigByCity[city.code];
  const evidence = [...city.evidence];
  if (tax.iit_evidence && !evidence.some((item) => item.evidence_id === tax.iit_evidence.evidence_id)) evidence.push(tax.iit_evidence);
  const eligibilityRules = city.model === "beijing" ? beijingRules(city)
    : city.model === "shenzhen" ? shenzhenRules(city)
      : city.model === "shanghai" ? shanghaiRules(city)
        : unrestrictedRules(city);
  const payload = {
    package_version: `${city.prefix.toLowerCase()}@${city.effectiveFrom}.decision.1`,
    knowledge_release: release,
    as_of_date: "2026-07-16",
    city: { code: city.code, name: city.name },
    scope: {
      subject: "mainland_natural_person_household",
      property: "ordinary_second_hand_commodity_residential_housing",
      special_routes: ["hk_macao_taiwan_overseas_chinese", "foreign_national", "policy_housing"],
    },
    evidence,
    purchase_eligibility: {
      decision_model: city.model,
      rules: eligibilityRules.sort((a, b) => b.priority - a.priority),
      unknown_policy: "任一命中规则的 required_inputs 缺失，或不存在完整匹配规则时返回 unknown 并列出缺失字段。",
    },
    tax: {
      inherits: "cn-tax@2026-07-16.1",
      unique_home_verification_scope: tax.unique_home_scope,
      assessed_iit: {
        default_rate: tax.iit_assessed_rate,
        status: tax.iit_rate_status,
        evidence_ids: tax.iit_evidence ? [tax.iit_evidence.evidence_id] : [],
        missing_behavior: tax.iit_assessed_rate === null ? "必须输入经主管税务机关确认的 seller.iit_assessed_rate，否则个税金额为 unknown" : "未显式输入时可采用本包已核验默认值",
      },
      vat_surcharge: {
        small_scale_reduction_factor: 0.5,
        status: "subject_confirmation_required",
        missing_behavior: "必须确认卖方是否适用增值税小规模纳税人六税两费减半政策及城建税税率",
      },
      holding_tax: holdingTax(city),
    },
    boundaries: [
      "购房资格不等于房屋具备转让条件，也不等于银行同意贷款。",
      "计税价格必须使用主管税务机关接受的 taxable_transfer_price。",
      "政策性住房、共有产权、房改房、保障性住房等不适用普通商品住房规则。",
      "执行器按 query_date 选择有效规则；政策冲突或证据待复核时返回 unknown/conditional。",
    ],
  };
  const filename = `${city.code}-${city.slug}.json`;
  await writeFile(path.join(outputDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

console.log(`Generated ${cityDefinitions.length} city decision packages in ${outputDir}`);
