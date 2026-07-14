export type CityKey = "beijing" | "shenzhen" | "guangzhou" | "common";

export type KnowledgeSource = {
  title: string;
  url: string;
};

export type KnowledgeTable = {
  headers: string[];
  rows: string[][];
};

export type KnowledgeSection = {
  id: string;
  city: CityKey;
  category: string;
  title: string;
  summary: string;
  details?: string[];
  table?: KnowledgeTable;
  formula?: string[];
  note?: string;
  sources?: KnowledgeSource[];
  keywords?: string[];
};

export const knowledgeMeta = {
  title: "城市二手房交易知识库",
  release: "2026.07.14-r1",
  schemaVersion: "1.1.0",
  asOfDate: "2026-07-14",
  monitoringStatus: "baseline_pending",
  monitoredSources: 13,
  goldenCases: 11,
};

export const cities = [
  {
    key: "beijing" as const,
    name: "北京",
    code: "110000",
    version: "bj@2025-12-24.1",
    effectiveFrom: "2025-12-24",
    status: "五环内限购 · 五环外放宽",
    keyInput: "五环内 / 五环外",
    commercialDown: "首套 15% · 二套 20%",
    providentDown: "首套 20% · 二套 25%",
    accent: "#8f5d3b",
  },
  {
    key: "shenzhen" as const,
    name: "深圳",
    code: "440300",
    version: "sz@2026-04-30.1",
    effectiveFrom: "2026-04-30",
    status: "核心区限购 · 分区判断",
    keyInput: "区 + 宝安街道",
    commercialDown: "首套 15% · 二套 20%",
    providentDown: "首套 20% · 二套 20%",
    accent: "#376f63",
  },
  {
    key: "guangzhou" as const,
    name: "广州",
    code: "440100",
    version: "gz@2024-09-30.1",
    effectiveFrom: "2024-09-30",
    status: "居民住房限购已取消",
    keyInput: "住房套数仍影响税贷",
    commercialDown: "首套 15% · 二套 15%",
    providentDown: "首套 20% · 二套 20%",
    accent: "#536a9f",
  },
];

const nationalTaxSources: KnowledgeSource[] = [
  {
    title: "财政部等三部门：房地产市场税收政策公告",
    url: "https://szs.mof.gov.cn/zhengcefabu/202411/t20241113_3947450.htm",
  },
  {
    title: "财政部、税务总局：个人销售住房增值税政策",
    url: "https://fgk.chinatax.gov.cn/zcfgk/c102416/c5246356/content.html",
  },
];

export const sections: KnowledgeSection[] = [
  {
    id: "bj-eligibility",
    city: "beijing",
    category: "购房资格",
    title: "北京商品住房资格决策",
    summary: "北京仍需购房资格核验。先判断五环位置，再判断户籍、家庭住房套数、连续社保或个税年限及多子女情况。",
    table: {
      headers: ["买方类型", "五环内", "五环外", "规则 ID"],
      rows: [
        ["京籍家庭", "最多 2 套", "不限套数", "BJ-ELIG-001"],
        ["京籍成年单身", "按京籍家庭执行", "不限套数", "BJ-ELIG-002"],
        ["京籍二孩及以上家庭", "基础上增加 1 套", "不限套数", "BJ-ELIG-003"],
        ["非京籍家庭/成年单身", "五环内无房且社保/个税 ≥2 年，可购 1 套", "社保/个税 ≥1 年，不限套数", "BJ-ELIG-004"],
        ["非京籍二孩及以上家庭", "基础上增加 1 套", "满足基础年限后不限套数", "BJ-ELIG-005"],
        ["港澳台侨家庭", "北京无房且境内工作、学习和居留，可购 1 套自住", "同左", "BJ-ELIG-006"],
        ["符合条件外籍家庭", "北京无房，可购 1 套自住", "同左", "BJ-ELIG-007"],
      ],
    },
    details: [
      "京籍包括本市户籍、驻京部队现役军人和现役武警，以及持有效北京市工作居住证的家庭。",
      "家庭成员通常包括夫妻双方及未成年子女；购房资格通过不代表具体房屋一定可以过户。",
      "查询 2025-08-09 至 2025-12-23 的历史交易，应切换到 bj@2025-08-09.1。",
    ],
    note: "北京住建委页面可能同时残留历史条件，现行判断以当前汇总段和有效规范性文件为准。",
    sources: [
      {
        title: "北京市住建委购房资格核验页面",
        url: "https://zjw.beijing.gov.cn/bjjs/fdcjy/gfzg87/index.shtml",
      },
      {
        title: "京建发〔2025〕565号",
        url: "https://www.beijing.gov.cn/gate/big5/www.beijing.gov.cn/zhengce/zhengcefagui/202512/t20251225_4361661.html",
      },
    ],
    keywords: ["京籍", "非京籍", "五环", "工作居住证", "二孩", "社保", "个税"],
  },
  {
    id: "bj-transfer",
    city: "beijing",
    category: "房屋可交易性",
    title: "北京标的房屋转让核验",
    summary: "购房资格和房屋可交易性是两道独立判断。产权、查封、抵押、共有关系或房屋性质不清时，统一返回 conditional。",
    details: [
      "核验产权证、权利人、共有权人同意、查封和异议登记。",
      "央产房、经济适用房、共有产权住房、限价房、人才房等特殊产权必须转专项规则。",
      "住宅平房也需要购房资格核验；赠与、继承和共有份额转让适用不同资格规则。",
    ],
    note: "BJ-TRANSFER-001：普通商品住房只有完成登记条件核验后，才能从 conditional 转为 eligible。",
    sources: [
      {
        title: "北京市住建委购房资格与常见问答",
        url: "https://zjw.beijing.gov.cn/bjjs/fdcjy/gfzg87/index.shtml",
      },
    ],
    keywords: ["央产房", "经济适用房", "共有产权", "查封", "抵押", "住宅平房"],
  },
  {
    id: "bj-financing",
    city: "beijing",
    category: "贷款与首付",
    title: "北京商业贷款与公积金",
    summary: "政策最低首付不等于最终首付。合同价、银行评估价、授信额度、房龄和借款人收入都会改变实际资金需求。",
    table: {
      headers: ["项目", "现行口径", "规则 ID"],
      rows: [
        ["商贷首套最低首付", "15%", "BJ-LOAN-COM-001"],
        ["商贷二套最低首付", "20%", "BJ-LOAN-COM-002"],
        ["公积金首套最低首付", "20%", "BJ-LOAN-PF-001"],
        ["公积金二套最低首付", "25%", "BJ-LOAN-PF-002"],
        ["公积金首套基础最高额度", "120 万元", "BJ-LOAN-PF-003"],
        ["公积金二套基础最高额度", "100 万元", "BJ-LOAN-PF-004"],
        ["缴存年限对应额度", "每缴存 1 年可贷 15 万元", "BJ-LOAN-PF-005"],
        ["公积金利率", "首套 2.1%/2.6%；二套 2.525%/3.075%", "BJ-LOAN-PF-006"],
      ],
    },
    details: [
      "商业贷款利率定价不再区分首套、二套，但首付和授信认定仍然存在。",
      "二手房公积金贷款受抵押物价值、房龄、借款人年龄和月还款比例限制。",
    ],
    sources: [
      {
        title: "北京住房公积金贷款业务问答",
        url: "https://gjj.beijing.gov.cn/web/zwfw5/1747335/1747338/743726795/index.html",
      },
      {
        title: "京建发〔2024〕400号",
        url: "https://www.beijing.gov.cn/gate/big5/www.beijing.gov.cn/zhengce/zhengcefagui/202501/t20250109_3984746.html",
      },
    ],
    keywords: ["首付", "商贷", "公积金", "贷款额度", "月供", "评估价"],
  },
  {
    id: "bj-tax",
    city: "beijing",
    category: "税率税费",
    title: "北京买卖双方税费",
    summary: "买方主要为契税；卖方主要判断增值税和个人所得税。法定纳税人与合同约定的实际承担人必须分开。",
    table: {
      headers: ["税种", "法定纳税人", "现行判断", "规则 ID"],
      rows: [
        ["契税", "买方", "唯一/二套 ≤140㎡ 为 1%；唯一 >140㎡ 为 1.5%；二套 >140㎡ 为 2%；其他一般 3%", "BJ-TAX-DEED-001"],
        ["增值税", "卖方", "取得不足 2 年按 3% 征收率；满 2 年免征", "BJ-TAX-VAT-001"],
        ["个人所得税", "卖方", "核实征收为应纳税所得额 ×20%；满五唯一免征", "BJ-TAX-IIT-001"],
        ["增值税附加", "卖方", "仅在产生增值税时计算，以申报系统为准", "BJ-TAX-SUR-001"],
      ],
    },
    note: "不知道计税价格时只能给税率和公式；不知道卖方原值时，不得统一按成交价 1% 估算个税。",
    sources: nationalTaxSources,
    keywords: ["契税", "增值税", "个税", "满二", "满五唯一", "140平方米"],
  },
  {
    id: "bj-inputs",
    city: "beijing",
    category: "必填信息",
    title: "北京最少需要追问什么",
    summary: "关键输入缺失时，Agent 应追问而不是输出虚假精确结论。",
    details: [
      "房屋位于五环内还是五环外。",
      "买方户籍/工作居住证、家庭结构、家庭住房套数、连续社保或个税月数。",
      "房屋性质、产权状态、建筑面积、合同价、计税价和银行评估价。",
      "卖方取得日期、是否满二、是否满五唯一、原值与合法扣除凭证。",
      "贷款方式、银行实际批贷额度、中介费用和税费承担约定。",
    ],
    keywords: ["缺失输入", "追问", "五环", "原值", "评估价"],
  },
  {
    id: "sz-zones",
    city: "shenzhen",
    category: "区域分类",
    title: "深圳必须先确定区域",
    summary: "深圳不能只输入城市名。宝安区还必须精确到是否属于新安街道。",
    table: {
      headers: ["区域类型", "范围", "代码"],
      rows: [
        ["核心区", "福田区、南山区、宝安区新安街道", "core"],
        ["放宽区", "罗湖、宝安除新安、龙岗、龙华、坪山、光明", "relaxed"],
        ["无资格审核区", "盐田区、大鹏新区", "no_review"],
      ],
    },
    note: "只知道房屋在宝安区时，购房资格应返回 unknown 并追问街道。",
    sources: [
      {
        title: "深圳 2025 年分区优化政策",
        url: "https://www.sz.gov.cn/cn/xxgk/zfxxgj/zwdt/content/post_12365285.html",
      },
    ],
    keywords: ["福田", "南山", "新安街道", "盐田", "大鹏", "宝安"],
  },
  {
    id: "sz-eligibility",
    city: "shenzhen",
    category: "购房资格",
    title: "深圳商品住房资格决策",
    summary: "2026-04-30 起，符合条件家庭在核心区增加一套指标；有效深圳经济特区居住证可为部分非深户家庭提供核心区一套资格。",
    table: {
      headers: ["买方家庭", "核心区", "放宽区", "盐田/大鹏", "规则 ID"],
      rows: [
        ["深户家庭", "最多 3 套", "不限套数", "不审核、不限套数", "SZ-ELIG-001"],
        ["非深户，社保/个税 ≥1 年", "最多 2 套", "不限套数", "不审核、不限套数", "SZ-ELIG-002"],
        ["非深户，未满 1 年但有有效居住证", "最多 1 套", "最多 2 套", "不审核、不限套数", "SZ-ELIG-003"],
        ["非深户，未满 1 年且无有效居住证", "不可购买", "最多 2 套", "不审核、不限套数", "SZ-ELIG-004"],
      ],
    },
    details: [
      "成年单身人士按居民家庭执行。",
      "核心区 3 套/2 套是 2025 年基础上限与 2026 年增购 1 套政策的合并结果。",
      "查询 2025-09-06 至 2026-04-29 时，应使用 sz@2025-09-06.1。",
    ],
    sources: [
      {
        title: "深建字〔2026〕86号",
        url: "https://zjj.sz.gov.cn/szszfhjsjwzgkml/szszfhjsjwzgkml/seztfw/zfly/wyk/content/post_12759900.html",
      },
      {
        title: "深圳 2025 年分区优化政策",
        url: "https://www.sz.gov.cn/cn/xxgk/zfxxgj/zwdt/content/post_12365285.html",
      },
    ],
    keywords: ["深户", "非深户", "居住证", "社保", "核心区", "限购"],
  },
  {
    id: "sz-transfer",
    city: "shenzhen",
    category: "房屋可交易性",
    title: "深圳普通商品住房转让",
    summary: "商品住房和商务公寓的一般转让限制已经取消，但特殊产权房不能直接套用。",
    details: [
      "普通商品住房仍需核验产权登记、查封、抵押、共有关系、租赁和用途。",
      "安居型商品房、人才住房、共有产权住房和其他保障性住房返回 conditional。",
      "未取得完整产权或补缴价款、补缴税费条件不清时必须专项核验。",
    ],
    note: "SZ-TRANSFER-001：取消一般转让限制不等于所有深圳房屋均可自由出售。",
    sources: [
      {
        title: "深圳优化房地产市场政策措施",
        url: "https://www.sz.gov.cn/cn/xxgk/zfxxgj/zwdt/content/post_11580619.html",
      },
    ],
    keywords: ["转让限制", "安居房", "人才房", "共有产权", "商务公寓"],
  },
  {
    id: "sz-financing",
    city: "shenzhen",
    category: "贷款与首付",
    title: "深圳商业贷款与公积金",
    summary: "商贷首套/二套最低首付为 15%/20%；公积金首套和二套均为 20%，2026 年提高基础额度并增加多类上浮。",
    table: {
      headers: ["项目", "现行口径", "规则 ID"],
      rows: [
        ["商贷首套最低首付", "15%", "SZ-LOAN-COM-001"],
        ["商贷二套最低首付", "20%", "SZ-LOAN-COM-002"],
        ["公积金首套/二套最低首付", "20% / 20%", "SZ-LOAN-PF-001/002"],
        ["保障性住房最低首付", "15%", "SZ-LOAN-PF-003"],
        ["单人基础最高额度", "70 万元", "SZ-LOAN-PF-004"],
        ["共同申请基础最高额度", "130 万元", "SZ-LOAN-PF-005"],
      ],
    },
    details: [
      "购买首套住房额度可上浮 60%；初婚初育 +50%；二孩及以上 +70%；保障性住房 +40%。",
      "初婚初育和二孩及以上同时满足时只选择 50% 或 70%，不叠加。",
      "实际贷款额仍由公积金中心和银行根据账户、收入、征信和抵押物确定。",
    ],
    sources: [
      {
        title: "深建字〔2026〕86号",
        url: "https://zjj.sz.gov.cn/szszfhjsjwzgkml/szszfhjsjwzgkml/seztfw/zfly/wyk/content/post_12759900.html",
      },
      {
        title: "深圳公积金贷款管理补充规定",
        url: "https://zjj.sz.gov.cn/csml/zcfg/xxgk/yshjgg/content/post_12126441.html",
      },
    ],
    keywords: ["首付", "公积金", "上浮", "多子女", "初婚初育", "贷款额度"],
  },
  {
    id: "sz-tax",
    city: "shenzhen",
    category: "税率税费",
    title: "深圳买卖双方税费",
    summary: "深圳与北京、广州适用同一套全国住房契税优惠和 2026 年住房销售增值税规则。",
    table: {
      headers: ["税种", "法定纳税人", "现行判断", "规则 ID"],
      rows: [
        ["契税", "买方", "唯一/二套 ≤140㎡ 为 1%；唯一 >140㎡ 为 1.5%；二套 >140㎡ 为 2%；其他一般 3%", "SZ-TAX-DEED-001"],
        ["增值税", "卖方", "不足 2 年按 3% 征收率；满 2 年免征", "SZ-TAX-VAT-001"],
        ["个人所得税", "卖方", "所得额 ×20%；满五唯一免征；核定口径由深圳税务确认", "SZ-TAX-IIT-001"],
      ],
    },
    note: "合同可以约定买方代付卖方税费，但法定纳税人不会因此改变。",
    sources: nationalTaxSources,
    keywords: ["契税", "个税", "增值税", "满五唯一", "计税价"],
  },
  {
    id: "sz-inputs",
    city: "shenzhen",
    category: "必填信息",
    title: "深圳最少需要追问什么",
    summary: "深圳区域差异明显，缺少区或街道时最容易误判资格。",
    details: [
      "房屋所在区；宝安区必须继续确认是否为新安街道。",
      "深户/非深户、连续社保或个税月数、有效深圳经济特区居住证。",
      "家庭在深圳不同政策区域的住房套数。",
      "房屋产权性质、面积、三种价格、卖方持有年限及满五唯一情况。",
      "贷款方式、实际获批额度和税费承担约定。",
    ],
    keywords: ["宝安", "新安街道", "居住证", "缺失输入", "追问"],
  },
  {
    id: "gz-eligibility",
    city: "guangzhou",
    category: "购房资格",
    title: "广州居民住房限购已取消",
    summary: "自 2024-09-30 起，自然人居民家庭购买广州商品住房，不再按户籍、社保或家庭住房套数限制购买数量。",
    details: [
      "普通商品住房的购房资格一般可返回 eligible。",
      "企业购房、境外机构、政策性住房资格和非住宅用途不在这条确定性规则内。",
      "家庭住房套数仍然影响契税、商业贷款和公积金认定，不能省略。",
    ],
    note: "GZ-ELIG-001@2024-09-30.1：取消限购不等于取消税贷中的首套、二套认定。",
    sources: [
      {
        title: "广州市政府取消住房限购政策",
        url: "https://www.gz.gov.cn/zwgk/fggw/sfbgtwj/content/post_9896008.html",
      },
    ],
    keywords: ["取消限购", "广州户籍", "社保", "住房套数"],
  },
  {
    id: "gz-transfer",
    city: "guangzhou",
    category: "房屋可交易性",
    title: "广州不再审核取得产权证时间",
    summary: "自 2024-05-29 起，居民家庭转让名下住房不再审核取得不动产权证时间。税务上的满二、满五仍需单独判断。",
    details: [
      "继续核验产权证、权利人、共有权、查封、异议登记、抵押权和租赁。",
      "政策性住房的上市条件不能套用普通商品住房规则。",
      "转让不审核持证时间，不代表卖方自动免征增值税或个人所得税。",
    ],
    note: "GZ-TRANSFER-001@2024-05-29.1：转让资格条件和税收持有年限必须分开。",
    sources: [
      {
        title: "广州进一步促进房地产市场平稳健康发展通知",
        url: "https://www.gz.gov.cn/zwgk/fggw/sfbgtwj/content/post_9674048.html",
      },
    ],
    keywords: ["取得产权证", "拿证时间", "满二", "满五", "转让"],
  },
  {
    id: "gz-financing",
    city: "guangzhou",
    category: "贷款与首付",
    title: "广州商业贷款与公积金",
    summary: "广州商贷首套和二套政策最低首付均为 15%；公积金首套和二套均为 20%。",
    table: {
      headers: ["项目", "现行口径", "规则 ID"],
      rows: [
        ["商贷首套最低首付", "15%", "GZ-LOAN-COM-001"],
        ["商贷二套最低首付", "15%", "GZ-LOAN-COM-002"],
        ["公积金首套/二套最低首付", "20% / 20%", "GZ-LOAN-PF-001/002"],
        ["保障性住房最低首付", "15%", "GZ-LOAN-PF-003"],
        ["一人申请最高额度", "80 万元", "GZ-LOAN-PF-004"],
        ["两人及以上最高额度", "160 万元", "GZ-LOAN-PF-005"],
        ["多子女家庭", "最高额度上浮 40%", "GZ-LOAN-PF-006"],
        ["公积金利率", "首套 2.1%/2.6%；二套 2.525%/3.075%", "GZ-LOAN-PF-007"],
      ],
    },
    details: [
      "组合贷款必须同时满足商业贷款和公积金贷款条件。",
      "银行可根据征信、收入、负债、房龄和评估价值提高实际首付或拒绝贷款。",
    ],
    sources: [
      {
        title: "广州商业性住房贷款政策说明",
        url: "https://sw.gz.gov.cn/xxgk/jyta/content/post_10452546.html",
      },
      {
        title: "广州住房公积金贷款政策通知",
        url: "https://www.gz.gov.cn/gfxwj/sbmgfxwj/gzzfgjjglzx/content/post_9994206.html",
      },
    ],
    keywords: ["首付", "商贷", "公积金", "多子女", "组合贷"],
  },
  {
    id: "gz-tax",
    city: "guangzhou",
    category: "税率税费",
    title: "广州买卖双方税费",
    summary: "广州已取消普通住宅与非普通住宅标准；自然人住房交易仍按家庭套数、面积、持有年限和原值资料计算。",
    table: {
      headers: ["税种", "法定纳税人", "现行判断", "规则 ID"],
      rows: [
        ["契税", "买方", "唯一/二套 ≤140㎡ 为 1%；唯一 >140㎡ 为 1.5%；二套 >140㎡ 为 2%；其他一般 3%", "GZ-TAX-DEED-001"],
        ["增值税", "卖方", "不足 2 年按 3% 征收率；满 2 年免征", "GZ-TAX-VAT-001"],
        ["个人所得税", "卖方", "所得额 ×20%；满五唯一免征；核定口径由广州税务确认", "GZ-TAX-IIT-001"],
      ],
    },
    sources: [
      ...nationalTaxSources,
      {
        title: "广州税务 2026 年涉税不动产交易适用税费表",
        url: "https://guangdong.chinatax.gov.cn/gdsw/gzsw_xzfw/2026-04/20/content_a232b5691511474898f7b15f1cd36485.shtml",
      },
    ],
    keywords: ["普通住宅", "非普通住宅", "契税", "满二", "满五唯一"],
  },
  {
    id: "gz-inputs",
    city: "guangzhou",
    category: "必填信息",
    title: "广州最少需要追问什么",
    summary: "广州无需为限购追问户籍和社保，但税费、贷款和房屋转让仍需要完整事实。",
    details: [
      "家庭住房套数、房屋产权性质和建筑面积。",
      "合同价、税务计税价格和银行评估价。",
      "卖方取得日期、是否满二、是否满五唯一、原值和扣除凭证。",
      "贷款方式、银行实际批准额度、中介报价和税费承担约定。",
    ],
    keywords: ["缺失输入", "追问", "户籍", "社保", "住房套数"],
  },
  {
    id: "common-tax",
    city: "common",
    category: "全国共同规则",
    title: "三城市共同税收阈值",
    summary: "北京、深圳、广州的住房契税优惠、2026 年增值税规则和满五唯一免个税原则相同。",
    table: {
      headers: ["项目", "条件", "税率/结果", "规则版本"],
      rows: [
        ["契税", "家庭唯一住房，面积 ≤140㎡", "1%", "NAT-TAX-DEED-001@2024-12-01.1"],
        ["契税", "家庭唯一住房，面积 >140㎡", "1.5%", "NAT-TAX-DEED-001@2024-12-01.1"],
        ["契税", "家庭第二套，面积 ≤140㎡", "1%", "NAT-TAX-DEED-001@2024-12-01.1"],
        ["契税", "家庭第二套，面积 >140㎡", "2%", "NAT-TAX-DEED-001@2024-12-01.1"],
        ["契税", "不符合以上优惠", "所在地一般税率 3%", "NAT-TAX-DEED-001@2024-12-01.1"],
        ["增值税", "卖方取得不足 2 年", "3% 征收率", "NAT-TAX-VAT-001@2026-01-01.1"],
        ["增值税", "卖方取得满 2 年", "免征", "NAT-TAX-VAT-001@2026-01-01.1"],
        ["个人所得税", "自用满 5 年且家庭唯一生活用房", "免征", "NAT-TAX-IIT-001@current.1"],
      ],
    },
    details: [
      "契税的家庭套数认定不能用贷款首套、二套认定替代。",
      "增值税含税价换算和附加税额以当地税务申报系统为准。",
      "无法提供原值凭证时，由主管税务机关决定核定口径，不应跨城市统一硬编码 1%。",
    ],
    sources: nationalTaxSources,
    keywords: ["140㎡", "契税", "增值税", "满五唯一", "法定纳税人"],
  },
  {
    id: "common-cost",
    city: "common",
    category: "资金计算",
    title: "首付、现金需求与取得成本",
    summary: "合同价、计税价格和银行评估价必须分开。政策最低首付只是下限，不是银行最终批贷结果。",
    formula: [
      "政策最低首付 = 银行认可的贷款价值 × 政策最低首付比例",
      "实际首付 = 合同房价 − 实际获批贷款额",
      "交易时现金需求 = 实际首付 + 买方税费 + 代卖方承担税费 + 服务费及其他现金支出",
      "取得总成本 = 合同房价 + 全部非房价成本",
      "卖方核实征收个税 =（转让收入 − 房屋原值 − 税金 − 合理费用）× 20%",
    ],
    details: [
      "卖方税费只有合同明确约定由买方承担时，才加入买方现金需求。",
      "中介费、评估费和登记类费用使用实际报价，不静态写死。",
    ],
    keywords: ["现金需求", "取得成本", "合同价", "计税价", "银行评估价", "实际首付"],
  },
  {
    id: "common-examples",
    city: "common",
    category: "可复算示例",
    title: "两组资金结果对比",
    summary: "示例用于验收规则计算。所有金额均假设计税价和银行认可价值等于合同价，且银行按政策最低比例足额批贷。",
    table: {
      headers: ["场景", "北京", "深圳", "广州"],
      rows: [
        ["500万、100㎡、家庭唯一、卖方满五唯一、商贷首套", "最低现金 80万 + 未知费用", "最低现金 80万 + 未知费用", "最低现金 80万 + 未知费用"],
        ["800万、150㎡、家庭第二套、卖方满二不满五、各自承担法定税", "最低现金 176万 + 未知费用", "最低现金 176万 + 未知费用", "最低现金 136万 + 未知费用"],
        ["第二场景买方代付卖方 56万个税", "232万 + 未知费用", "232万 + 未知费用", "192万 + 未知费用"],
      ],
    },
    details: [
      "第一场景：契税 5 万，三城商贷首套最低首付均为 75 万。",
      "第二场景：契税 16 万；北京、深圳商贷二套最低首付 160 万，广州为 120 万。",
      "卖方个税 56 万只在合同约定买方代付时进入买方现金需求。",
    ],
    note: "具体房源仍需产权核验、银行授信和税务系统确认，因此可交易性与贷款资格保留 conditional。",
    keywords: ["500万", "800万", "80万", "176万", "136万", "示例"],
  },
  {
    id: "common-versions",
    city: "common",
    category: "政策版本",
    title: "政策演变与历史日期查询",
    summary: "知识库同时保存政策有效时间和知识记录时间。规则条件变化时新增版本，旧版本不可覆盖。",
    table: {
      headers: ["范围", "历史版本", "当前版本", "切换日期"],
      rows: [
        ["北京", "bj@2025-08-09.1", "bj@2025-12-24.1", "2025-12-24"],
        ["深圳", "sz@2025-09-06.1", "sz@2026-04-30.1", "2026-04-30"],
        ["广州", "gz@2024-05-29.1", "gz@2024-09-30.1", "2024-09-30"],
        ["全国住房增值税", "更早版本未物化", "NAT-TAX-VAT-001@2026-01-01.1", "2026-01-01"],
      ],
    },
    details: [
      "历史查询采用 effective_from ≤ query_date < effective_to。",
      "查询日期早于已登记覆盖范围时返回 unknown，不用现行规则倒推。",
      "一次发布使用 kb_release 整体回滚；当前发布为 2026.07.14-r1。",
    ],
    keywords: ["版本", "历史政策", "effective_from", "回滚", "政策演变"],
  },
  {
    id: "common-monitoring",
    city: "common",
    category: "实时更新",
    title: "官方来源监测与审核发布",
    summary: "知识库采用近实时监测而不是未经审核的自动改规则：P0 来源每 6 小时检查，P1 来源每 24 小时检查。",
    table: {
      headers: ["状态", "含义", "Agent 行为"],
      rows: [
        ["fresh", "来源在时效目标内且内容未变化", "正常执行已发布规则"],
        ["stale", "超过 24 小时未核验", "显示新鲜度警告"],
        ["changed_pending_review", "官方页面指纹发生变化", "受影响主题返回 unknown/needs_review"],
        ["error", "来源检查失败", "保留审计信息并提示人工核验"],
        ["baseline_pending", "监测尚未建立完整远端基线", "不得宣称实时已核验"],
      ],
    },
    details: [
      "监测器对官方页面规范化可见文本计算 SHA-256，变化进入人工审核队列。",
      "完成条款影响分析、规则更新、黄金用例和人工审核后，才生成新发布版本。",
      "当前接入 13 个官方入口；后台定时调度尚未启用。",
    ],
    note: "高风险政策知识不自动发布，是为了避免官网布局变化、旧文案残留或解释文件更新造成错误结论。",
    keywords: ["实时更新", "监测", "6小时", "24小时", "pending_review", "新鲜度"],
  },
];

export const cityNames: Record<CityKey, string> = {
  beijing: "北京",
  shenzhen: "深圳",
  guangzhou: "广州",
  common: "公共规则",
};
