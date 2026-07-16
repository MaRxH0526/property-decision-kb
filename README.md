# 房产决策知识库

面向购房用户与 AI/Agent 的结构化知识站点，用两个 Tab 区分：

- **交易政策**：全国通则与12个城市的购房资格、产权交易、贷款首付、税率税费、政策版本和官方依据。
- **教育政策**：31城义务教育入学政策、结构化规则、时间线、公办学校、证据链和覆盖缺口。

网页用于浏览与轻量检索知识，不把自身定位为购房计算器。城市知识包采用展开/收起交互；教育明细按城市分片加载，避免一次加载31城全部数据。

## 数据来源

- 交易知识位于 `app/knowledge-data.ts`。
- 教育知识只读导出自用户提供的 `education_kb_project` 两个 SQLite 数据库及其验收报告。
- `scripts/export_education_web.py` 只转换已有数据，不抓取或补充新事实。
- 教育库当前结构版本为 `edu-schema-v2@2026-07-16`。

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
