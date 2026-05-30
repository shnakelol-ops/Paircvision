import type { CSSProperties, PointerEvent } from "react";
import type { ProTaggerSport, ProTaggerAttackDirection } from "./pro-tagger-session";

interface Props {
  sport: ProTaggerSport;
  attackDirection: ProTaggerAttackDirection;
  half: 1 | 2;
  feedbackDot: { nx: number; ny: number } | null;
  interactive: boolean;
  onTap: (nx: number, ny: number) => void;
}

// ── Portrait pitch geometry ────────────────────────────────────────────────
//
// Physical constants are identical to src/core/pitch/pitch-config.ts.
// Axes are rotated 90°: length (145 m) → SVG Y, width (90 m) → SVG X.
// ViewBox 0 0 100 160  (landscape 160×100 rotated).
// Pitch inner: x=2, y=2, w=96, h=156.
//
// Arc sweep flags (SVG Y-down, sweep=1 = clockwise on screen):
//   D arc top   west→east via south (into field) = sweep 1
//   D arc bot   west→east via north (into field) = sweep 0
//   2PT arc top SW→SE via south (into field)     = sweep 0
//   2PT arc bot NW→NE via north (into field)     = sweep 1

const Lm = 145;
const Wm = 90;

const pL = 2;            // pitchLeft
const pT = 2;            // pitchTop
const pW = 96;           // pitchWidth
const pH = 156;          // pitchHeight
const pR = pL + pW;      // 98
const pB = pT + pH;      // 158
const cX = pL + pW / 2;  // 50 — centre X
const cY = pT + pH / 2;  // 80 — centre Y

const yAt = (lf: number) => pT + lf * pH;

// Line Y positions — both sports use the same fractions (mirrors pitch-config.ts)
const y13t = yAt(13 / Lm);
const y13b = pB - (13 / Lm) * pH;
const y20t = yAt(20 / Lm);
const y20b = pB - (20 / Lm) * pH;
const y45t = yAt(45 / Lm);
const y45b = pB - (45 / Lm) * pH;
const y65t = yAt(65 / Lm);
const y65b = pB - (65 / Lm) * pH;

// Goal box dimensions (SVG units)
const smallWide = (14 / Wm) * pW;   // 14.933
const smallDeep = (4.5 / Lm) * pH;  // 4.841
const largeWide = (19 / Wm) * pW;   // 20.267
const largeDeep = (13 / Lm) * pH;   // 13.986
const smallX    = cX - smallWide / 2;
const largeX    = cX - largeWide / 2;

// Goal posts (same mouth width as small box)
const postX1 = smallX;
const postX2  = smallX + smallWide;

// Penalty spots
const penYt = yAt(11 / Lm);
const penYb = pB - (11 / Lm) * pH;

// D arc — centred on 20m line, half-ellipse (west→east via south/north)
const rxD = (13 / Wm) * pW;   // 13.867  width-axis radius
const ryD = (13 / Lm) * pH;   // 13.986  length-axis radius

// Two-point arc — centred on goal line; endpoints land at 20m-line level.
// Formula matches pitch-config.ts: anchorSin = dy/ry → anchorDx = rx*cos.
const rx2   = (40 / Wm) * pW;                              // 42.667
const ry2   = (40 / Lm) * pH;                              // 43.034
const a2sin = (y20t - pT) / ry2;                           // ≈ 0.500
const a2cos = Math.sqrt(Math.max(0, 1 - a2sin * a2sin));   // ≈ 0.866
const a2dx  = rx2 * a2cos;
const arc2x1 = cX - a2dx;   // ≈ 13.044
const arc2x2 = cX + a2dx;   // ≈ 86.956

// Colours — match PITCH_STYLE_TOKENS.lines.gaelic
const C_STRONG = "rgba(255,255,255,0.42)";
const C_MID    = "rgba(255,255,255,0.40)";
const C_SOFT   = "rgba(255,255,255,0.38)";
const C_END    = "rgba(255,255,255,0.40)";
const C_CENTRE = "rgba(255,255,255,0.52)";
const C_SPOT   = "rgba(255,255,255,0.55)";
const DASH13   = "4.2 3.6";

// 3-dp rounding for clean SVG output (mirrors rnd3 in pitch-config.ts)
const n = (v: number) => Math.round(v * 1000) / 1000;

// Pre-built arc path strings
const dArcTop  = `M ${n(cX - rxD)},${n(y20t)} A ${n(rxD)},${n(ryD)} 0 0 1 ${n(cX + rxD)},${n(y20t)}`;
const dArcBot  = `M ${n(cX - rxD)},${n(y20b)} A ${n(rxD)},${n(ryD)} 0 0 0 ${n(cX + rxD)},${n(y20b)}`;
const pt2Top   = `M ${n(arc2x1)},${n(y20t)} A ${n(rx2)},${n(ry2)} 0 0 0 ${n(arc2x2)},${n(y20t)}`;
const pt2Bot   = `M ${n(arc2x1)},${n(y20b)} A ${n(rx2)},${n(ry2)} 0 0 1 ${n(arc2x2)},${n(y20b)}`;

export function ProTaggerPitchView({
  sport,
  attackDirection,
  half,
  feedbackDot,
  interactive,
  onTap,
}: Props) {
  const isHurling = sport === "hurling" || sport === "camogie";

  const attackingDown =
    (half === 1 && attackDirection === "right") ||
    (half === 2 && attackDirection === "left");

  function handlePointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!interactive) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onTap(nx, ny);
  }

  return (
    <svg
      viewBox="0 0 100 160"
      style={svgStyle(interactive)}
      onPointerDown={handlePointerDown}
      aria-label="Pitch — tap to place event"
    >
      {/* Grass */}
      <rect x="0" y="0" width="100" height="160" fill="#166534" />

      {/* Pitch boundary */}
      <rect
        x={pL} y={pT} width={pW} height={pH}
        fill="none" stroke={C_STRONG} strokeWidth="0.52"
      />

      {/* ── Goal posts (outside pitch boundary) ─────────────────────── */}
      {/* Top */}
      <line x1={n(postX1)} y1="0" x2={n(postX1)} y2={pT} stroke="white" strokeWidth="1.0" />
      <line x1={n(postX2)} y1="0" x2={n(postX2)} y2={pT} stroke="white" strokeWidth="1.0" />
      <line x1={n(postX1)} y1="0.3" x2={n(postX2)} y2="0.3" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />
      {/* Bottom */}
      <line x1={n(postX1)} y1={pB} x2={n(postX1)} y2="160" stroke="white" strokeWidth="1.0" />
      <line x1={n(postX2)} y1={pB} x2={n(postX2)} y2="160" stroke="white" strokeWidth="1.0" />
      <line x1={n(postX1)} y1="159.7" x2={n(postX2)} y2="159.7" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4" />

      {/* ── Small goal boxes ─────────────────────────────────────────── */}
      <rect
        x={n(smallX)} y={pT} width={n(smallWide)} height={n(smallDeep)}
        fill="none" stroke={C_END} strokeWidth="0.42"
      />
      <rect
        x={n(smallX)} y={n(pB - smallDeep)} width={n(smallWide)} height={n(smallDeep)}
        fill="none" stroke={C_END} strokeWidth="0.42"
      />

      {/* ── Large rectangles ─────────────────────────────────────────── */}
      <rect
        x={n(largeX)} y={pT} width={n(largeWide)} height={n(largeDeep)}
        fill="none" stroke={C_END} strokeWidth="0.46"
      />
      <rect
        x={n(largeX)} y={n(pB - largeDeep)} width={n(largeWide)} height={n(largeDeep)}
        fill="none" stroke={C_END} strokeWidth="0.46"
      />

      {/* ── D arcs (centred on 20m line, half-ellipse into field) ────── */}
      <path d={dArcTop} fill="none" stroke={C_STRONG} strokeWidth="0.48" />
      <path d={dArcBot} fill="none" stroke={C_STRONG} strokeWidth="0.48" />

      {/* ── Two-point arcs (football / LGFA only) ───────────────────── */}
      {!isHurling && (
        <>
          <path d={pt2Top} fill="none" stroke={C_STRONG} strokeWidth="0.48" strokeLinecap="round" />
          <path d={pt2Bot} fill="none" stroke={C_STRONG} strokeWidth="0.48" strokeLinecap="round" />
        </>
      )}

      {/* ── Horizontal lines (both sports) ──────────────────────────── */}

      {/* 13m lines — dashed */}
      <line x1={pL} y1={n(y13t)} x2={pR} y2={n(y13t)} stroke={C_SOFT} strokeWidth="0.32" strokeDasharray={DASH13} />
      <line x1={pL} y1={n(y13b)} x2={pR} y2={n(y13b)} stroke={C_SOFT} strokeWidth="0.32" strokeDasharray={DASH13} />

      {/* 20m lines */}
      <line x1={pL} y1={n(y20t)} x2={pR} y2={n(y20t)} stroke={C_MID} strokeWidth="0.48" />
      <line x1={pL} y1={n(y20b)} x2={pR} y2={n(y20b)} stroke={C_MID} strokeWidth="0.48" />

      {/* 45m lines */}
      <line x1={pL} y1={n(y45t)} x2={pR} y2={n(y45t)} stroke={C_STRONG} strokeWidth="0.54" />
      <line x1={pL} y1={n(y45b)} x2={pR} y2={n(y45b)} stroke={C_STRONG} strokeWidth="0.54" />

      {/* 65m lines */}
      <line x1={pL} y1={n(y65t)} x2={pR} y2={n(y65t)} stroke={C_STRONG} strokeWidth="0.54" />
      <line x1={pL} y1={n(y65b)} x2={pR} y2={n(y65b)} stroke={C_STRONG} strokeWidth="0.54" />

      {/* Halfway — full-width dashed (portrait legibility, no centre circle in GAA Pixi) */}
      <line x1={pL} y1={cY} x2={pR} y2={cY} stroke={C_CENTRE} strokeWidth="0.6" strokeDasharray="2 2" />

      {/* ── Centre spot ──────────────────────────────────────────────── */}
      <circle cx={cX} cy={cY} r="0.85" fill={C_SPOT} />

      {/* ── Penalty spots ────────────────────────────────────────────── */}
      <circle cx={cX} cy={n(penYt)} r="0.36" fill={C_SPOT} />
      <circle cx={cX} cy={n(penYb)} r="0.36" fill={C_SPOT} />

      {/* ── Attack direction indicator ───────────────────────────────── */}
      <text
        x={cX}
        y={attackingDown ? 142 : 22}
        textAnchor="middle"
        fontSize="3.8"
        fill="rgba(255,255,255,0.80)"
        fontFamily="system-ui, sans-serif"
        fontWeight="600"
      >
        {attackingDown ? "ATK ↓" : "ATK ↑"}
      </text>

      {/* Dim overlay when not interactive */}
      {!interactive && (
        <rect x="0" y="0" width="100" height="160" fill="rgba(0,0,0,0.18)" />
      )}

      {/* Feedback dot */}
      {feedbackDot && (
        <>
          <circle
            cx={feedbackDot.nx * 100}
            cy={feedbackDot.ny * 160}
            r="4"
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="0.6"
          />
          <circle
            cx={feedbackDot.nx * 100}
            cy={feedbackDot.ny * 160}
            r="2"
            fill="white"
          />
        </>
      )}
    </svg>
  );
}

function svgStyle(interactive: boolean): CSSProperties {
  return {
    width: "100%",
    display: "block",
    cursor: interactive ? "crosshair" : "default",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    touchAction: interactive ? "none" : "auto",
  };
}
