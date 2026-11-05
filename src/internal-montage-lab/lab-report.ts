// Montage Lab — plain-text report the tester copies or downloads and sends back.

import type { LabEnvironment } from "./lab-env";
import type { LabRecord } from "./lab-session";

function mb(n: number | null | undefined): string {
  return typeof n === "number" ? `${(n / 1e6).toFixed(1)} MB` : "?";
}

export function buildLabReport(env: LabEnvironment | null, records: LabRecord[], now = new Date()): string {
  const lines: string[] = ["PáircVision Montage Lab — Stage 0 report", `time: ${now.toISOString()}`, ""];
  if (env) {
    lines.push(
      "device/browser:",
      `  ${env.browser}${env.isBrave ? " [Brave detected]" : ""} · Android ${env.android ?? "?"} · cores ${env.cores ?? "?"} · deviceMemory ${env.deviceMemoryGB ?? "?"} GB`,
      `  UA: ${env.userAgent}`,
      `  storage: quota ${mb(env.quota)} · usage ${mb(env.usage)} · persisted ${env.persisted}`,
      "  APIs:",
      ...Object.entries(env.apis).map(([k, v]) => `    ${v ? "yes" : "NO "}  ${k}`),
      "",
    );
  }
  lines.push(`results (${records.length}, newest first):`);
  for (const r of records) {
    lines.push(`- [${new Date(r.at).toISOString()}] ${r.kind}: ${r.summary}`);
    lines.push(`    ${JSON.stringify(r.data)}`);
  }
  return lines.join("\n");
}
