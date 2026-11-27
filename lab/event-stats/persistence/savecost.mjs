import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { CHROME } from "./ui-driver.mjs";
/** Lab root: reads lab runs (runs/<match>/state) and writes persistence/results (both gitignored). */
const LAB = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const d = JSON.parse(readFileSync(`${LAB}/runs/B/state/final.json`, "utf8"));
const big = d.reduce((a, x) => (x.events?.length ?? 0) > (a.events?.length ?? 0) ? x : a);
const b = await chromium.launch({ executablePath: CHROME });
const p = await (await b.newContext()).newPage();
await p.goto("http://localhost:5199/");
for (const n of [1, 10, 20]) {
  const r = await p.evaluate(({ big, n }) => {
    const K = "probe_cost";
    localStorage.setItem(K, JSON.stringify(Array.from({ length: n }, (_, i) => ({ ...big, id: "m" + i }))));
    const t = [];
    for (let k = 0; k < 15; k++) {
      const t0 = performance.now();
      const arr = JSON.parse(localStorage.getItem(K));
      arr[0] = { ...big, id: "m0", updatedAt: Date.now() };
      localStorage.setItem(K, JSON.stringify(arr));
      t.push(performance.now() - t0);
    }
    localStorage.removeItem(K);
    t.sort((a, b) => a - b);
    return { median: +t[7].toFixed(1), max: +t[14].toFixed(1) };
  }, { big, n });
  console.log(`store of ${n} x 306-event matches: full read-modify-write median ${r.median} ms, max ${r.max} ms`);
}
await b.close();
