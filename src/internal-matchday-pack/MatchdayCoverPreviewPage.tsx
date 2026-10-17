// DEVELOPER-ONLY preview of the Matchday Cover renderer
// (/internal/matchday-cover-preview). Registered in main.tsx behind
// import.meta.env.DEV and lazy-loaded, so neither this page nor the
// renderer ships in production builds. Not the Matchday Pack editor —
// that is PR 3.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { loadAvailableKits, loadCoverJersey, resolveCoverJersey, type CoverJerseySource } from "./matchday-cover-assets";
import { COVER_SCENARIOS } from "./matchday-cover-fixtures";
import { COVER_HEIGHT, COVER_WIDTH, coverCanvasToPngBlob, renderMatchdayCoverCanvas } from "./matchday-cover-renderer";

type Status = { phase: "rendering" } | { phase: "ready"; note: string } | { phase: "error"; message: string };

function describe(source: CoverJerseySource): string {
  if (source.kind === "none") return "club-colour jersey";
  return source.kitId;
}

export default function MatchdayCoverPreviewPage() {
  const [scenarioKey, setScenarioKey] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("scenario");
    return COVER_SCENARIOS.some((s) => s.key === q) ? q! : COVER_SCENARIOS[0].key;
  });
  const [status, setStatus] = useState<Status>({ phase: "rendering" });
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scenario = COVER_SCENARIOS.find((s) => s.key === scenarioKey) ?? COVER_SCENARIOS[0];

  useEffect(() => {
    let cancelled = false;
    setStatus({ phase: "rendering" });
    (async () => {
      const kits = loadAvailableKits();
      const homeSource = resolveCoverJersey(scenario.pack.home, kits);
      const standIn = scenario.awayStandInKitId ? kits.find((k) => k.id === scenario.awayStandInKitId) : undefined;
      const awaySource: CoverJerseySource = standIn
        ? standIn.source === "preset"
          ? { kind: "preset", kitId: standIn.id, src: standIn.src! }
          : { kind: "user", kitId: standIn.id }
        : resolveCoverJersey(scenario.pack.away, kits);
      const [homeJersey, awayJersey] = await Promise.all([loadCoverJersey(homeSource), loadCoverJersey(awaySource)]);
      const canvas = await renderMatchdayCoverCanvas(scenario.pack, { homeJersey, awayJersey });
      if (cancelled) return;
      if (!canvas) {
        setStatus({ phase: "error", message: "Canvas 2D unavailable" });
        return;
      }
      canvas.setAttribute("data-testid", "matchday-cover-canvas");
      Object.assign(canvas.style, { width: "100%", height: "auto", display: "block", borderRadius: "6px" });
      hostRef.current?.replaceChildren(canvas);
      canvasRef.current = canvas;
      setStatus({
        phase: "ready",
        note: `Home: ${describe(homeSource)} · Away: ${standIn ? `${standIn.id} (STAND-IN)` : describe(awaySource)}`,
      });
    })().catch((err: unknown) => {
      if (!cancelled) setStatus({ phase: "error", message: String(err) });
    });
    return () => {
      cancelled = true;
    };
  }, [scenario]);

  const download = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await coverCanvasToPngBlob(canvas);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matchday-cover-${scenario.key}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  };

  return (
    <div style={S.shell}>
      <div style={S.bar}>
        <strong style={S.title}>Matchday Cover — dev preview</strong>
        <span style={S.dim}>
          {COVER_WIDTH}×{COVER_HEIGHT}
        </span>
      </div>
      <div style={S.scenarios}>
        {COVER_SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setScenarioKey(s.key)}
            style={s.key === scenario.key ? { ...S.chip, ...S.chipOn } : S.chip}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div ref={hostRef} style={S.frame} />
      <div style={S.foot}>
        <span data-testid="matchday-cover-status" data-phase={status.phase} style={S.dim}>
          {status.phase === "rendering" ? "Rendering…" : status.phase === "ready" ? status.note : status.message}
        </span>
        <button type="button" style={S.chip} onClick={() => void download()} disabled={status.phase !== "ready"}>
          Download PNG
        </button>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  shell: {
    minHeight: "100dvh",
    background: "#0b0f16",
    color: "#dce8f4",
    fontFamily: "system-ui, sans-serif",
    padding: "12px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
    boxSizing: "border-box",
  },
  bar: { display: "flex", justifyContent: "space-between", alignItems: "baseline", maxWidth: 540, margin: "0 auto 10px" },
  title: { fontSize: 14 },
  dim: { fontSize: 12, color: "#7a8ea3" },
  scenarios: { display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 540, margin: "0 auto 12px" },
  chip: {
    background: "transparent",
    border: "1px solid #24364a",
    borderRadius: 999,
    color: "#a9bccf",
    fontSize: 12,
    padding: "5px 10px",
    cursor: "pointer",
  },
  chipOn: { background: "#16283b", borderColor: "#e8c06a", color: "#ffffff" },
  frame: { maxWidth: 540, margin: "0 auto", aspectRatio: `${COVER_WIDTH} / ${COVER_HEIGHT}`, background: "#05080e" },
  foot: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, maxWidth: 540, margin: "10px auto 0" },
};
