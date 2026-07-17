# 房产决策知识库

面向购房用户与 AI/Agent 的结构化知识站点，用两个 Tab 区分：

- **交易政策**：全国通则与12个城市的购房资格、产权交易、贷款首付、税率税费、政策版本和官方依据。
- **教育政策**：31城义务教育入学政策、结构化规则、时间线、公办学校、学校对口小区、轻量证据包和覆盖缺口。

网页用于浏览与轻量检索知识，不把自身定位为购房计算器。城市知识包采用展开/收起交互；教育明细按城市分片加载，避免一次加载31城全部数据。

交易与教育政策共用 `policy-freshness-v1` 时效治理模型：A 当前已核验、B 当前但需关注、C 陈旧待复核、D 失效或历史。教育城市 JSON 中同步输出等级、引用模式、分级原因、发布年龄与最近来源检查时间，供 Agent 强制执行引用门槛。

## 数据来源

- 交易知识位于 `app/knowledge-data.ts`。
- 教育知识唯一来源为 `education_kb_project` V3；V2不再参与导出。
- V3只读导出两个 SQLite 数据库、学校对口表、31城证据包与咨询场景索引。
- `scripts/export_education_web.py` 只转换已有数据，不抓取或补充新事实。
- 教育库当前内容版本为 `edu-content-v3@2026-07-17`，底层数据库 schema 仍为 v2。
- 轻量证据包和低权威来源对口记录均保留候选状态，不直接作为确定性结论。

## 本地运行

```bash
npm install
npm run dev
```

访问 `http://localhost:3000/`。

## 校验

```bash
npm run build
npm test
npm run lint
```

## 静态发布

```bash
# 阿里云 OSS 根域名部署
npm run build:oss

# GitHub Pages 项目子路径部署
NEXT_PUBLIC_BASE_PATH=/property-decision-kb npm run build:pages
```
