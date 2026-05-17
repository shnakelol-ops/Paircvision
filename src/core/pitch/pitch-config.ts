import { PITCH_STYLE_TOKENS } from "./pitch-style-tokens";
import { BOARD_PITCH_VIEWBOX } from "./pitch-space";

export type PitchSport = "soccer" | "gaelic" | "hurling" | "camogie";

const Lg = PITCH_STYLE_TOKENS.lines.gaelic;

type LineSpec = {
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
};

type RectSpec = {
  kind: "rect";
  x: number;
  y: number;
  w: number;
  h: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
};

type CircleSpec = {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
};

type EllipseSpec = {
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  stroke: string;
  strokeWidth: number;
  fill?: string;
};

type PathSpec = {
  kind: "path";
  d: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
  opacity?: number;
  strokeLinecap?: "round" | "butt";
  strokeDasharray?: string;
  skipLineGlow?: boolean;
};

type EllipseArcSpec = {
  kind: "ellipseArc";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  startAngle: number;
  endAngle: number;
  anticlockwise?: boolean;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  strokeLinecap?: "round" | "butt";
  skipLineGlow?: boolean;
};

type TextSpec = {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  fill: string;
  fontWeight?: string;
  textAnchor?: "start" | "middle" | "end";
  opacity?: number;
};

export type PitchMarking =
  | LineSpec
  | RectSpec
  | CircleSpec
  | EllipseSpec
  | PathSpec
  | EllipseArcSpec
  | TextSpec;

export type PitchConfig = {
  viewBox: { w: number; h: number };
  markings: PitchMarking[];
  inner: { x: number; y: number; w: number; h: number };
};

const rnd3 = (v: number) => Math.round(v * 1000) / 1000;

const soccerMarkings: PitchMarking[] = (() => {
  const wTouch = 0.52;
  const wHalf = 0.6;
  const wCircle = 0.48;
  const wPen = 0.48;
  const wSix = 0.38;
  const wGoalGraphic = 0.42;
  const ix = 2;
  const iy = 2;
  const playW = 156;
  const playH = 96;
  const xRight = ix + playW;
  const yBottom = iy + playH;
  const cx = ix + playW / 2;
  const cy = iy + playH / 2;
  const lenM = 105;
  const widM = 68;

  const xLen = (mFromLeftGoal: number) => ix + (mFromLeftGoal / lenM) * playW;
  const penDepth = (16.5 / lenM) * playW;
  const penHalfH = ((40.32 / 2) / widM) * playH;
  const sixDepth = (5.5 / lenM) * playW;
  const sixHalfH = ((18.32 / 2) / widM) * playH;
  const penY = cy - penHalfH;
  const penH = penHalfH * 2;
  const sixY = cy - sixHalfH;
  const sixH = sixHalfH * 2;

  const penFrontL = ix + penDepth;
  const penFrontR = xRight - penDepth;
  const spotXL = xLen(11);
  const spotXR = xLen(lenM - 11);
  const rxArc = (9.15 / lenM) * playW;
  const ryArc = (9.15 / widM) * playH;
  const rxCentre = rxArc;
  const ryCentre = ryArc;

  const chordDy = (spotX: number, lineX: number): number => {
    const t = ((lineX - spotX) / rxArc) ** 2;
    if (t >= 1) return ryArc * 0.82;
    return ryArc * Math.sqrt(Math.max(0, 1 - t));
  };

  const dyL = chordDy(spotXL, penFrontL);
  const arcLeftD = `M ${rnd3(penFrontL)} ${rnd3(cy - dyL)} A ${rnd3(rxArc)} ${rnd3(ryArc)} 0 0 1 ${rnd3(penFrontL)} ${rnd3(cy + dyL)}`;
  const dyR = chordDy(spotXR, penFrontR);
  const arcRightD = `M ${rnd3(penFrontR)} ${rnd3(cy - dyR)} A ${rnd3(rxArc)} ${rnd3(ryArc)} 0 0 0 ${rnd3(penFrontR)} ${rnd3(cy + dyR)}`;

  const goalMouthH = (7.32 / widM) * playH;
  const gTop = cy - goalMouthH / 2;
  const gBot = cy + goalMouthH / 2;
  const netDepth = 1.55;

  const netFill = "rgba(255,255,255,0.11)";
  const netStroke = "rgba(255,255,255,0.45)";

  return [
    { kind: "rect", x: ix, y: iy, w: playW, h: playH, stroke: Lg.lineGridStrong, strokeWidth: wTouch },
    { kind: "rect", x: ix, y: penY, w: penDepth, h: penH, stroke: Lg.lineGridMid, strokeWidth: wPen },
    { kind: "rect", x: penFrontR, y: penY, w: penDepth, h: penH, stroke: Lg.lineGridMid, strokeWidth: wPen },
    { kind: "rect", x: ix, y: sixY, w: sixDepth, h: sixH, stroke: Lg.lineScoringEnd, strokeWidth: wSix },
    { kind: "rect", x: xRight - sixDepth, y: sixY, w: sixDepth, h: sixH, stroke: Lg.lineScoringEnd, strokeWidth: wSix },
    { kind: "path", d: arcLeftD, stroke: Lg.lineGridMid, strokeWidth: 0.44, strokeLinecap: "round", skipLineGlow: true },
    { kind: "path", d: arcRightD, stroke: Lg.lineGridMid, strokeWidth: 0.44, strokeLinecap: "round", skipLineGlow: true },
    { kind: "circle", cx: spotXL, cy, r: 0.38, fill: Lg.lineGridStrong, stroke: "rgba(0,0,0,0.16)", strokeWidth: 0.06 },
    { kind: "circle", cx: spotXR, cy, r: 0.38, fill: Lg.lineGridStrong, stroke: "rgba(0,0,0,0.16)", strokeWidth: 0.06 },
    { kind: "line", x1: cx, y1: iy, x2: cx, y2: yBottom, stroke: Lg.lineCentre, strokeWidth: wHalf },
    { kind: "ellipse", cx, cy, rx: rxCentre, ry: ryCentre, stroke: Lg.lineGridMid, strokeWidth: wCircle },
    { kind: "circle", cx, cy, r: 0.85, fill: Lg.spot },
    { kind: "rect", x: ix - netDepth, y: gTop, w: netDepth, h: goalMouthH, stroke: netStroke, strokeWidth: 0.22, fill: netFill },
    { kind: "line", x1: ix, y1: gTop, x2: ix, y2: gBot, stroke: "rgba(255,255,255,0.92)", strokeWidth: wGoalGraphic },
    { kind: "line", x1: ix - netDepth * 0.35, y1: gTop, x2: ix, y2: gTop, stroke: "rgba(255,255,255,0.88)", strokeWidth: 0.32 },
    { kind: "line", x1: ix - netDepth * 0.35, y1: gBot, x2: ix, y2: gBot, stroke: "rgba(255,255,255,0.88)", strokeWidth: 0.32 },
    { kind: "rect", x: xRight, y: gTop, w: netDepth, h: goalMouthH, stroke: netStroke, strokeWidth: 0.22, fill: netFill },
    { kind: "line", x1: xRight, y1: gTop, x2: xRight, y2: gBot, stroke: "rgba(255,255,255,0.92)", strokeWidth: wGoalGraphic },
    { kind: "line", x1: xRight + netDepth * 0.35, y1: gTop, x2: xRight, y2: gTop, stroke: "rgba(255,255,255,0.88)", strokeWidth: 0.32 },
    { kind: "line", x1: xRight + netDepth * 0.35, y1: gBot, x2: xRight, y2: gBot, stroke: "rgba(255,255,255,0.88)", strokeWidth: 0.32 },
  ];
})();

const GAELIC_LANDSCAPE_LEN_M = 145;
const GAELIC_LANDSCAPE_WID_M = 90;
const GAELIC_SMALL_DEEP_M = 4.5;
const GAELIC_SMALL_WIDE_M = 14;
const GAELIC_LARGE_DEEP_M = 13;
const GAELIC_LARGE_WIDE_M = 19;
const GAELIC_D_FREE_RADIUS_M = 13;
const GAELIC_TWO_POINT_RADIUS_M = 40;
const GAELIC_PENALTY_SPOT_M = 11;

function buildGaelicFootballLandscapeMarkings(): PitchMarking[] {
  const pitchLeft = 2;
  const pitchTop = 2;
  const pitchWidth = 156;
  const pitchHeight = 96;
  const pitchRight = pitchLeft + pitchWidth;
  const pitchBottom = pitchTop + pitchHeight;
  const leftGoalLineX = pitchLeft;
  const rightGoalLineX = pitchRight;

  const Lm = GAELIC_LANDSCAPE_LEN_M;
  const t13 = 13 / Lm;
  const t20 = 20 / Lm;
  const t45 = 45 / Lm;
  const t65 = 65 / Lm;
  const xAt = (lenFrac: number) => pitchLeft + lenFrac * pitchWidth;

  const dash13 = "4.2 3.6";
  const wTouch = 0.52;
  const wHalf = 0.6;
  const w45 = 0.54;
  const w65 = 0.54;
  const w20 = 0.48;
  const w13 = 0.32;
  const wEnd = 0.46;
  const wEndInner = 0.42;
  const wD = 0.48;
  const w2Point = 0.48;

  const centreY = pitchTop + 0.5 * pitchHeight;

  const x13L = xAt(t13);
  const x13R = xAt(1 - t13);
  const left20mX = xAt(t20);
  const right20mX = xAt(1 - t20);
  const x45L = xAt(t45);
  const x45R = xAt(1 - t45);
  const x65L = xAt(t65);
  const x65R = xAt(1 - t65);
  const xMid = xAt(0.5);

  const smallDeep = (GAELIC_SMALL_DEEP_M / GAELIC_LANDSCAPE_LEN_M) * pitchWidth;
  const smallWide = (GAELIC_SMALL_WIDE_M / GAELIC_LANDSCAPE_WID_M) * pitchHeight;
  const largeDeep = (GAELIC_LARGE_DEEP_M / GAELIC_LANDSCAPE_LEN_M) * pitchWidth;
  const largeWide = (GAELIC_LARGE_WIDE_M / GAELIC_LANDSCAPE_WID_M) * pitchHeight;

  const ySmallTop = centreY - smallWide / 2;
  const yLargeTop = centreY - largeWide / 2;

  const centreStartLen = (8 / GAELIC_LANDSCAPE_WID_M) * pitchHeight;
  const yCentreTop = centreY - centreStartLen / 2;
  const yCentreBottom = centreY + centreStartLen / 2;

  const xPenL = xAt(GAELIC_PENALTY_SPOT_M / GAELIC_LANDSCAPE_LEN_M);
  const xPenR = xAt(1 - GAELIC_PENALTY_SPOT_M / GAELIC_LANDSCAPE_LEN_M);
  const rSpot = 0.36;

  const rxD = (GAELIC_D_FREE_RADIUS_M / GAELIC_LANDSCAPE_LEN_M) * pitchWidth;
  const ryD = (GAELIC_D_FREE_RADIUS_M / GAELIC_LANDSCAPE_WID_M) * pitchHeight;
  const dArcStart = -Math.PI / 2;
  const dArcEnd = Math.PI / 2;

  const rx40 = (GAELIC_TWO_POINT_RADIUS_M / GAELIC_LANDSCAPE_LEN_M) * pitchWidth;
  const ry40 = (GAELIC_TWO_POINT_RADIUS_M / GAELIC_LANDSCAPE_WID_M) * pitchHeight;
  const left20mDx = left20mX - leftGoalLineX;
  const twoPointAnchorCos = Math.max(-1, Math.min(1, left20mDx / rx40));
  const twoPointAnchorAngle = Math.acos(twoPointAnchorCos);

  return [
    { kind: "rect", x: pitchLeft, y: pitchTop, w: pitchWidth, h: pitchHeight, stroke: Lg.lineGridStrong, strokeWidth: wTouch },
    { kind: "line", x1: x13L, y1: pitchTop, x2: x13L, y2: pitchBottom, stroke: Lg.lineGridSoft, strokeWidth: w13, strokeDasharray: dash13 },
    { kind: "line", x1: x13R, y1: pitchTop, x2: x13R, y2: pitchBottom, stroke: Lg.lineGridSoft, strokeWidth: w13, strokeDasharray: dash13 },
    { kind: "line", x1: left20mX, y1: pitchTop, x2: left20mX, y2: pitchBottom, stroke: Lg.lineGridMid, strokeWidth: w20 },
    { kind: "line", x1: right20mX, y1: pitchTop, x2: right20mX, y2: pitchBottom, stroke: Lg.lineGridMid, strokeWidth: w20 },
    { kind: "line", x1: x45L, y1: pitchTop, x2: x45L, y2: pitchBottom, stroke: Lg.lineGridStrong, strokeWidth: w45 },
    { kind: "line", x1: x45R, y1: pitchTop, x2: x45R, y2: pitchBottom, stroke: Lg.lineGridStrong, strokeWidth: w45 },
    { kind: "line", x1: x65L, y1: pitchTop, x2: x65L, y2: pitchBottom, stroke: Lg.lineGridStrong, strokeWidth: w65 },
    { kind: "line", x1: x65R, y1: pitchTop, x2: x65R, y2: pitchBottom, stroke: Lg.lineGridStrong, strokeWidth: w65 },
    { kind: "line", x1: xMid, y1: yCentreTop, x2: xMid, y2: yCentreBottom, stroke: Lg.lineCentre, strokeWidth: wHalf },
    { kind: "circle", cx: xMid, cy: centreY, r: 0.85, fill: Lg.spot },
    { kind: "circle", cx: xPenL, cy: centreY, r: rSpot, fill: Lg.lineGridStrong, stroke: "rgba(0,0,0,0.18)", strokeWidth: 0.06 },
    { kind: "circle", cx: xPenR, cy: centreY, r: rSpot, fill: Lg.lineGridStrong, stroke: "rgba(0,0,0,0.18)", strokeWidth: 0.06 },
    { kind: "rect", x: pitchLeft, y: yLargeTop, w: largeDeep, h: largeWide, stroke: Lg.lineScoringEnd, strokeWidth: wEnd },
    { kind: "rect", x: pitchRight - largeDeep, y: yLargeTop, w: largeDeep, h: largeWide, stroke: Lg.lineScoringEnd, strokeWidth: wEnd },
    { kind: "rect", x: pitchLeft, y: ySmallTop, w: smallDeep, h: smallWide, stroke: Lg.lineScoringEnd, strokeWidth: wEndInner },
    { kind: "rect", x: pitchRight - smallDeep, y: ySmallTop, w: smallDeep, h: smallWide, stroke: Lg.lineScoringEnd, strokeWidth: wEndInner },
    { kind: "ellipseArc", cx: leftGoalLineX, cy: centreY, rx: rx40, ry: ry40, startAngle: -twoPointAnchorAngle, endAngle: twoPointAnchorAngle, stroke: Lg.lineGridStrong, strokeWidth: w2Point, strokeLinecap: "round" },
    { kind: "ellipseArc", cx: rightGoalLineX, cy: centreY, rx: rx40, ry: ry40, startAngle: Math.PI - twoPointAnchorAngle, endAngle: Math.PI + twoPointAnchorAngle, stroke: Lg.lineGridStrong, strokeWidth: w2Point, strokeLinecap: "round" },
    { kind: "ellipseArc", cx: left20mX, cy: centreY, rx: rxD, ry: ryD, startAngle: dArcStart, endAngle: dArcEnd, stroke: Lg.lineGridStrong, strokeWidth: wD, strokeLinecap: "butt" },
    { kind: "ellipseArc", cx: right20mX, cy: centreY, rx: rxD, ry: ryD, startAngle: Math.PI - dArcEnd, endAngle: Math.PI - dArcStart, stroke: Lg.lineGridStrong, strokeWidth: wD, strokeLinecap: "butt" },
  ];
}

const gaelicLandscapeMarkings = buildGaelicFootballLandscapeMarkings();
const hurlingCamogieLandscapeMarkings: PitchMarking[] = (() => {
  const pitchLeft = 2;
  const pitchTop = 2;
  const pitchWidth = 156;
  const pitchHeight = 96;
  const pitchRight = pitchLeft + pitchWidth;
  const pitchBottom = pitchTop + pitchHeight;

  const Lm = GAELIC_LANDSCAPE_LEN_M;
  const t13 = 13 / Lm;
  const t20 = 20 / Lm;
  const t45 = 45 / Lm;
  const t65 = 65 / Lm;
  const xAt = (lenFrac: number) => pitchLeft + lenFrac * pitchWidth;

  const dash13 = "4.2 3.6";
  const wTouch = 0.52;
  const wHalf = 0.6;
  const w45 = 0.54;
  const w65 = 0.54;
  const w20 = 0.48;
  const w13 = 0.32;
  const wEnd = 0.46;
  const wEndInner = 0.42;
  const wD = 0.48;

  const centreY = pitchTop + 0.5 * pitchHeight;

  const x13L = xAt(t13);
  const x13R = xAt(1 - t13);
  const left20mX = xAt(t20);
  const right20mX = xAt(1 - t20);
  const x45L = xAt(t45);
  const x45R = xAt(1 - t45);
  const x65L = xAt(t65);
  const x65R = xAt(1 - t65);
  const xMid = xAt(0.5);

  const smallDeep = (GAELIC_SMALL_DEEP_M / GAELIC_LANDSCAPE_LEN_M) * pitchWidth;
  const smallWide = (GAELIC_SMALL_WIDE_M / GAELIC_LANDSCAPE_WID_M) * pitchHeight;
  const largeDeep = (GAELIC_LARGE_DEEP_M / GAELIC_LANDSCAPE_LEN_M) * pitchWidth;
  const largeWide = (GAELIC_LARGE_WIDE_M / GAELIC_LANDSCAPE_WID_M) * pitchHeight;

  const ySmallTop = centreY - smallWide / 2;
  const yLargeTop = centreY - largeWide / 2;

  const centreStartLen = (8 / GAELIC_LANDSCAPE_WID_M) * pitchHeight;
  const yCentreTop = centreY - centreStartLen / 2;
  const yCentreBottom = centreY + centreStartLen / 2;

  const xPenL = xAt(GAELIC_PENALTY_SPOT_M / GAELIC_LANDSCAPE_LEN_M);
  const xPenR = xAt(1 - GAELIC_PENALTY_SPOT_M / GAELIC_LANDSCAPE_LEN_M);
  const rSpot = 0.36;

  const rxD = (GAELIC_D_FREE_RADIUS_M / GAELIC_LANDSCAPE_LEN_M) * pitchWidth;
  const ryD = (GAELIC_D_FREE_RADIUS_M / GAELIC_LANDSCAPE_WID_M) * pitchHeight;
  const dArcStart = -Math.PI / 2;
  const dArcEnd = Math.PI / 2;

  return [
    { kind: "rect", x: pitchLeft, y: pitchTop, w: pitchWidth, h: pitchHeight, stroke: Lg.lineGridStrong, strokeWidth: wTouch },
    { kind: "line", x1: x13L, y1: pitchTop, x2: x13L, y2: pitchBottom, stroke: Lg.lineGridSoft, strokeWidth: w13, strokeDasharray: dash13 },
    { kind: "line", x1: x13R, y1: pitchTop, x2: x13R, y2: pitchBottom, stroke: Lg.lineGridSoft, strokeWidth: w13, strokeDasharray: dash13 },
    { kind: "line", x1: left20mX, y1: pitchTop, x2: left20mX, y2: pitchBottom, stroke: Lg.lineGridMid, strokeWidth: w20 },
    { kind: "line", x1: right20mX, y1: pitchTop, x2: right20mX, y2: pitchBottom, stroke: Lg.lineGridMid, strokeWidth: w20 },
    { kind: "line", x1: x45L, y1: pitchTop, x2: x45L, y2: pitchBottom, stroke: Lg.lineGridStrong, strokeWidth: w45 },
    { kind: "line", x1: x45R, y1: pitchTop, x2: x45R, y2: pitchBottom, stroke: Lg.lineGridStrong, strokeWidth: w45 },
    { kind: "line", x1: x65L, y1: pitchTop, x2: x65L, y2: pitchBottom, stroke: Lg.lineGridStrong, strokeWidth: w65 },
    { kind: "line", x1: x65R, y1: pitchTop, x2: x65R, y2: pitchBottom, stroke: Lg.lineGridStrong, strokeWidth: w65 },
    { kind: "line", x1: xMid, y1: yCentreTop, x2: xMid, y2: yCentreBottom, stroke: Lg.lineCentre, strokeWidth: wHalf },
    { kind: "circle", cx: xMid, cy: centreY, r: 0.85, fill: Lg.spot },
    { kind: "circle", cx: xPenL, cy: centreY, r: rSpot, fill: Lg.lineGridStrong, stroke: "rgba(0,0,0,0.18)", strokeWidth: 0.06 },
    { kind: "circle", cx: xPenR, cy: centreY, r: rSpot, fill: Lg.lineGridStrong, stroke: "rgba(0,0,0,0.18)", strokeWidth: 0.06 },
    { kind: "rect", x: pitchLeft, y: yLargeTop, w: largeDeep, h: largeWide, stroke: Lg.lineScoringEnd, strokeWidth: wEnd },
    { kind: "rect", x: pitchRight - largeDeep, y: yLargeTop, w: largeDeep, h: largeWide, stroke: Lg.lineScoringEnd, strokeWidth: wEnd },
    { kind: "rect", x: pitchLeft, y: ySmallTop, w: smallDeep, h: smallWide, stroke: Lg.lineScoringEnd, strokeWidth: wEndInner },
    { kind: "rect", x: pitchRight - smallDeep, y: ySmallTop, w: smallDeep, h: smallWide, stroke: Lg.lineScoringEnd, strokeWidth: wEndInner },
    // Hurling/Camogie: no football 2-point arc.
    { kind: "ellipseArc", cx: left20mX, cy: centreY, rx: rxD, ry: ryD, startAngle: dArcStart, endAngle: dArcEnd, stroke: Lg.lineGridStrong, strokeWidth: wD, strokeLinecap: "butt" },
    { kind: "ellipseArc", cx: right20mX, cy: centreY, rx: rxD, ry: ryD, startAngle: Math.PI - dArcEnd, endAngle: Math.PI - dArcStart, stroke: Lg.lineGridStrong, strokeWidth: wD, strokeLinecap: "butt" },
  ];
})();

export const pitchConfig: Record<PitchSport, PitchConfig> = {
  soccer: { viewBox: BOARD_PITCH_VIEWBOX, inner: { x: 2, y: 2, w: 156, h: 96 }, markings: soccerMarkings },
  gaelic: { viewBox: BOARD_PITCH_VIEWBOX, inner: { x: 2, y: 2, w: 156, h: 96 }, markings: gaelicLandscapeMarkings },
  hurling: { viewBox: BOARD_PITCH_VIEWBOX, inner: { x: 2, y: 2, w: 156, h: 96 }, markings: hurlingCamogieLandscapeMarkings },
  camogie: { viewBox: BOARD_PITCH_VIEWBOX, inner: { x: 2, y: 2, w: 156, h: 96 }, markings: hurlingCamogieLandscapeMarkings },
};

export function getPitchConfig(sport: PitchSport): PitchConfig {
  return pitchConfig[sport];
}
