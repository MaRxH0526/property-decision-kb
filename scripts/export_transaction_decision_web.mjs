import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "knowledge/transaction_decision");
const target = path.join(root, "public/data/transaction-decision");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await Promise.all([
  cp(path.join(source, "manifest.json"), path.join(target, "manifest.json")),
  cp(path.join(source, "schemas"), path.join(target, "schemas"), { recursive: true }),
  cp(path.join(source, "national"), path.join(target, "national"), { recursive: true }),
  cp(path.join(source, "cities"), path.join(target, "cities"), { recursive: true }),
]);

const golden = JSON.parse(await readFile(path.join(source, "tests/golden-cases.json"), "utf8"));
const summary = {
  release: golden.release,
  generated_at: golden.generated_at,
  case_count: golden.case_count,
  coverage: golden.coverage,
  city_counts: Object.entries(golden.cases.reduce((counts, item) => {
    counts[item.city_name] = (counts[item.city_name] ?? 0) + 1;
    return counts;
  }, {})).map(([city, cases]) => ({ city, cases })),
  note: "完整黄金场景保留在源码仓库 knowledge/transaction_decision/tests/golden-cases.json；公网仅发布轻量覆盖摘要。",
};
await writeFile(path.join(target, "test-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

console.log(`Exported lightweight transaction decision data to ${target}`);
