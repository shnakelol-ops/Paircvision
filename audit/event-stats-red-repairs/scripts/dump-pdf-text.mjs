// Writes a human-readable line-per-text dump for each captured PDF.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
const dir = process.argv[2];
mkdirSync(`${dir}/pdf-text-readable`, { recursive: true });
for (const f of readdirSync(`${dir}/pdf-text`).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(`${dir}/pdf-text/${f}`, "utf8"));
  const out = [];
  d.pages.forEach((p, i) => {
    out.push(`\n===== PAGE ${i + 1} (${p.w}x${p.h}) =====`);
    const rows = [...p.texts].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const t of rows) out.push(`${String(Math.round(t.x)).padStart(5)} ${String(Math.round(t.y)).padStart(5)}  ${t.t}`);
  });
  writeFileSync(`${dir}/pdf-text-readable/${f.replace(".json", ".txt")}`, out.join("\n"));
}
