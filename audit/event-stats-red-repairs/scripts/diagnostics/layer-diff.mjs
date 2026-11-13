import { readFileSync, writeFileSync } from "node:fs";
const [a, b, out] = process.argv.slice(2);
const A = JSON.parse(readFileSync(a, "utf8")), B = JSON.parse(readFileSync(b, "utf8"));
const diffs = [];
const walk = (x, y, p) => {
  if (JSON.stringify(x) === JSON.stringify(y)) return;
  if (x && y && typeof x === "object" && typeof y === "object" && !Array.isArray(x) && !Array.isArray(y)) {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${p}.${k}`);
    return;
  }
  if (Array.isArray(x) && Array.isArray(y) && x.length === y.length) { x.forEach((v, i) => walk(v, y[i], `${p}[${i}]`)); return; }
  diffs.push({ path: p, main: x, repair: y });
};
for (const k of Object.keys(A)) walk(A[k], B[k], k);
writeFileSync(out, JSON.stringify(diffs, null, 1));
const group = {};
for (const d of diffs) {
  const [ds, rest] = d.path.split(/\.(.*)/s);
  const sec = rest.replace(/\[\d+\]/g, "[]").split(".").slice(0, 3).join(".");
  (group[sec] ??= new Set()).add(ds);
}
for (const [k, v] of Object.entries(group).sort()) console.log(k.padEnd(62), [...v].join(" "));
console.log("leaf diffs:", diffs.length);
