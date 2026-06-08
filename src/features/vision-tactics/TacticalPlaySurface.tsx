import { useEffect, useRef, useState, type CSSProperties } from "react";

import OrientationGate, { usePortraitOrientation } from "../../components/OrientationGate";
import VisionStadiumBackground from "../../components/VisionStadiumBackground";
import { useCanvasRecorder } from "../shared/useCanvasRecorder";
import { createMovementCanvasShell } from "../../movement-board/shell/createMovementCanvasShell";
import type {
  BallType,
  MovementBoardMode,
  MovementBoardRoute,
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementConcept,
  MovementPlaybackSpeed,
  MovementRouteEditState,
  PremiumPlayerTokenColor,
  TacticalPassEvent,
  TacticalShotEvent,
  TokenRendererName,
  TokenSize,
} from "../../movement-board/shell/types";
import { TACTICAL_TEMPLATES, applyTemplatePositions, type TacticalTemplate, type TacticalTemplateCategory } from "./tacticalTemplates";
import {
  deleteScenario,
  duplicateScenario,
  listScenarios,
  renameScenario,
  saveScenario,
  type TacticalScenario,
} from "./tacticalPlayStorage";
import type { TacticalUnit } from "./tacticalUnitTypes";
import { buildMemberRoutes } from "./tacticalUnitHelpers";
import type { NormalizedPoint } from "../../movement-board/coordinates/normalization";

const SETUP_CATEGORIES: Array<{ id: TacticalTemplateCategory; label: string }> = [
  { id: "KICKOUT", label: "Kickout" },
  { id: "ATTACK", label: "Attack" },
  { id: "DEFENCE", label: "Defence" },
  { id: "PRESS", label: "Press" },
];

const _CAN_DVW = typeof window !== "undefined" && typeof window.CSS !== "undefined" && window.CSS.supports("width: 100dvw");
const _VW = _CAN_DVW ? "100dvw" : "100vw";
const TP_HEIGHT_VAR = "--tp-app-height";
const TP_H = `var(${TP_HEIGHT_VAR}, 100dvh)`;
const TP_CONTENT_WIDTH = `min(calc(${_VW} - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)), calc((${TP_H} - 10px) * 1.6), 1360px)`;

function getTPViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  const vp = window.visualViewport;
  const vpH = vp && Number.isFinite(vp.height) ? Math.round(vp.height) : 0;
  return Math.max(0, vpH || (Number.isFinite(window.innerHeight) ? Math.round(window.innerHeight) : 0));
}

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: TP_H,
  minHeight: TP_H,
  margin: 0,
  background: "radial-gradient(ellipse at 50% 50%, #0f1e35 0%, #080f1d 55%, #040b16 100%)",
  paddingTop: "max(4px, calc(env(safe-area-inset-top, 0px) + 2px))",
  paddingRight: "max(4px, calc(env(safe-area-inset-right, 0px) + 2px))",
  paddingBottom: "max(4px, calc(env(safe-area-inset-bottom, 0px) + 2px))",
  paddingLeft: "max(4px, calc(env(safe-area-inset-left, 0px) + 2px))",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const CONTENT_STYLE: CSSProperties = {
  width: TP_CONTENT_WIDTH,
  maxWidth: "calc(100vw - 24px)",
  aspectRatio: "16 / 10",
  maxHeight: `calc(${TP_H} - 10px)`,
  boxSizing: "border-box",
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "stretch",
};

const PITCH_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 50px 110px rgba(0, 0, 0, 0.55), 0 18px 45px rgba(0, 0, 0, 0.35)",
  background: "#0c1829",
};

const INFO_PILL_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(10px, calc(env(safe-area-inset-top, 0px) + 8px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 12,
  color: "#e8f0ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.02em",
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(6, 12, 26, 0.82)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const BACK_BUTTON_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  top: "max(10px, calc(env(safe-area-inset-top, 0px) + 8px))",
  zIndex: 13,
  height: "34px",
  minWidth: "58px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.22)",
  background: "rgba(6, 12, 26, 0.82)",
  color: "#e8f0ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  padding: "0 12px",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
};

const CTRL_BUBBLE_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
  zIndex: 22,
  height: "38px",
  minWidth: "68px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(6, 14, 30, 0.72)",
  color: "#eef4ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0 14px",
  cursor: "pointer",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 28px rgba(0, 4, 14, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
};

const SETUP_BUBBLE_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  bottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
  zIndex: 22,
  height: "38px",
  minWidth: "68px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(6, 14, 30, 0.72)",
  color: "#eef4ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0 14px",
  cursor: "pointer",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 28px rgba(0, 4, 14, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
};

const SETUP_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  width: "max-content",
  maxWidth: "min(520px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  display: "grid",
  gap: "3px",
};

const SETUP_SECTION_LABEL_STYLE: CSSProperties = {
  fontSize: "8px",
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "rgba(180, 210, 255, 0.40)",
  padding: "0 6px",
  pointerEvents: "none",
  userSelect: "none",
};

const PV_BADGE_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(12px, calc(env(safe-area-inset-left, 0px) + 10px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  height: "22px",
  minWidth: "32px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.16)",
  background: "rgba(6, 14, 30, 0.58)",
  color: "rgba(220, 235, 255, 0.88)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const PV_WATERMARK_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(14px, calc(env(safe-area-inset-right, 0px) + 12px))",
  bottom: "max(14px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
  zIndex: 20,
  color: "rgba(180, 210, 255, 0.28)",
  fontSize: "9px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  fontFamily: "Inter, system-ui, sans-serif",
  pointerEvents: "none",
  userSelect: "none",
};

const CONTROL_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  width: "max-content",
  maxWidth: "min(520px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  display: "grid",
  gap: "3px",
};

const PANEL_ROW_STYLE: CSSProperties = {
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.18)",
  background: "rgba(6, 14, 30, 0.72)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 10px 24px rgba(0, 4, 14, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
  padding: "2px",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "2px",
  flexWrap: "nowrap",
  overflowX: "auto",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

const MODE_BUTTON_STYLE: CSSProperties = {
  minWidth: "52px",
  height: "28px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.18)",
  background: "rgba(8, 18, 38, 0.72)",
  color: "rgba(220, 235, 255, 0.88)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 640,
  letterSpacing: "0.12px",
  textTransform: "uppercase",
  padding: "0 9px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.10)",
};

const MODE_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...MODE_BUTTON_STYLE,
  border: "1px solid rgba(124, 255, 114, 0.56)",
  background: "linear-gradient(180deg, rgba(34, 112, 66, 0.82) 0%, rgba(14, 42, 27, 0.94) 100%)",
  color: "#f4fff6",
  boxShadow: "0 0 0 1px rgba(124, 255, 114, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
};

const SEG_ITEM_STYLE: CSSProperties = {
  ...MODE_BUTTON_STYLE,
  flex: "1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const SEG_ITEM_ACTIVE_STYLE: CSSProperties = {
  ...MODE_BUTTON_STYLE,
  flex: "1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(124, 255, 114, 0.56)",
  background: "linear-gradient(180deg, rgba(34, 112, 66, 0.82) 0%, rgba(14, 42, 27, 0.94) 100%)",
  color: "#f4fff6",
  boxShadow: "0 0 0 1px rgba(124, 255, 114, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
};

const TOOL_BUTTON_STYLE: CSSProperties = {
  height: "31px",
  minWidth: "68px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.22)",
  background: "rgba(10, 18, 38, 0.72)",
  color: "rgba(220, 235, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 600,
  letterSpacing: "0.1px",
  padding: "0 10px",
  cursor: "pointer",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 6px 18px rgba(0, 4, 14, 0.36), inset 0 1px 2px rgba(255, 255, 255, 0.14)",
};

const TOOL_ACTIVE_STYLE: CSSProperties = {
  ...TOOL_BUTTON_STYLE,
  border: "1px solid rgba(124, 255, 114, 0.58)",
  background: "rgba(22, 67, 44, 0.78)",
  color: "#f4fff6",
};

const TOOL_DISABLED_STYLE: CSSProperties = {
  ...TOOL_BUTTON_STYLE,
  opacity: 0.45,
  boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.08)",
  cursor: "not-allowed",
};

const COLLAPSE_BUTTON_STYLE: CSSProperties = {
  ...TOOL_BUTTON_STYLE,
  minWidth: "62px",
};

const PLAYBACK_SIDE_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  bottom: "max(84px, calc(env(safe-area-inset-bottom, 0px) + 82px))",
  zIndex: 21,
  display: "grid",
  gap: "3px",
};

const PLAYBACK_SIDE_BUTTON_STYLE: CSSProperties = {
  ...TOOL_BUTTON_STYLE,
  minWidth: "76px",
  height: "29px",
  padding: "0 8px",
};

const HINT_PILL_STYLE: CSSProperties = {
  position: "fixed",
  bottom: "max(54px, calc(env(safe-area-inset-bottom, 0px) + 52px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 20,
  color: "rgba(198, 228, 210, 0.44)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 500,
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  userSelect: "none",
};

const TOKEN_COLOR_BG: Record<PremiumPlayerTokenColor, string> = {
  blue:   "rgba(37, 99, 235, 0.78)",
  red:    "rgba(220, 38, 38, 0.78)",
  yellow: "rgba(242, 201, 76, 0.88)",
  black:  "rgba(17, 24, 39, 0.90)",
  green:  "rgba(22, 163, 74, 0.78)",
  orange: "rgba(234, 88, 12, 0.78)",
  purple: "rgba(124, 58, 237, 0.78)",
  white:  "rgba(241, 245, 249, 0.88)",
};

const TOKEN_COLOR_BORDER: Record<PremiumPlayerTokenColor, string> = {
  blue:   "rgba(147, 197, 253, 0.60)",
  red:    "rgba(252, 165, 165, 0.60)",
  yellow: "rgba(253, 224, 71, 0.60)",
  black:  "rgba(107, 114, 128, 0.40)",
  green:  "rgba(74, 222, 128, 0.60)",
  orange: "rgba(251, 146, 60, 0.60)",
  purple: "rgba(167, 139, 250, 0.60)",
  white:  "rgba(203, 213, 225, 0.60)",
};

const SEQ_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  width: "max-content",
  maxWidth: "min(420px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  display: "grid",
  gap: "3px",
};

const SEQ_CHIP_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  height: "22px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(8, 18, 40, 0.72)",
  color: "rgba(200, 230, 255, 0.88)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  padding: "0 8px",
  whiteSpace: "nowrap",
};

const SCENARIO_INPUT_STYLE: CSSProperties = {
  height: "31px",
  minWidth: "120px",
  maxWidth: "160px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.22)",
  background: "rgba(8, 18, 38, 0.72)",
  color: "rgba(220, 235, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 500,
  padding: "0 10px",
  outline: "none",
};

const PLAYS_BUBBLE_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 22,
  height: "38px",
  minWidth: "64px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(6, 14, 30, 0.72)",
  color: "#eef4ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0 14px",
  cursor: "pointer",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 28px rgba(0, 4, 14, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
};

const PLAYS_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(68px, calc(env(safe-area-inset-right, 0px) + 66px))",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 21,
  width: "min(292px, calc(100vw - 94px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  maxHeight: "72vh",
  overflowY: "auto",
  background: "rgba(4, 10, 22, 0.96)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(180, 210, 255, 0.13)",
  borderRadius: "12px",
  boxShadow: "0 14px 36px rgba(0, 0, 0, 0.62), 0 4px 12px rgba(0, 0, 0, 0.38)",
  padding: "10px",
  display: "grid",
  gap: "6px",
};

const PLAYS_SCENARIO_NAME_STYLE: CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: "10px",
  fontWeight: 600,
  color: "rgba(200, 230, 255, 0.80)",
  fontFamily: "Inter, system-ui, sans-serif",
  letterSpacing: "0.01em",
  minWidth: 0,
};

const PLAYS_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  minWidth: 0,
};

const PLAYS_ACTION_BTN: CSSProperties = {
  flexShrink: 0,
  height: "26px",
  minWidth: "0",
  borderRadius: "7px",
  border: "1px solid rgba(180, 210, 255, 0.16)",
  background: "rgba(10, 22, 48, 0.72)",
  color: "rgba(200, 225, 255, 0.82)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  padding: "0 8px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  textTransform: "uppercase",
};

const PLAYS_INPUT_STYLE: CSSProperties = {
  flex: 1,
  height: "30px",
  minWidth: 0,
  borderRadius: "8px",
  border: "1px solid rgba(180, 210, 255, 0.22)",
  background: "rgba(8, 18, 38, 0.80)",
  color: "rgba(220, 235, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 500,
  padding: "0 10px",
  outline: "none",
};

const RECORD_COUNTDOWN_STYLE: CSSProperties = {
  position: "fixed",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  zIndex: 30,
  fontSize: "100px",
  fontWeight: 900,
  color: "rgba(255, 255, 255, 0.94)",
  fontFamily: "Inter, system-ui, sans-serif",
  textShadow: "0 4px 32px rgba(0, 0, 0, 0.90)",
  pointerEvents: "none",
  userSelect: "none",
  lineHeight: 1,
};

const RECORD_DOT_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(14px, calc(env(safe-area-inset-top, 0px) + 12px))",
  right: "max(14px, calc(env(safe-area-inset-right, 0px) + 12px))",
  zIndex: 25,
  width: "10px",
  height: "10px",
  borderRadius: "50%",
  background: "#ff3030",
  boxShadow: "0 0 8px 2px rgba(255, 48, 48, 0.70)",
  pointerEvents: "none",
  animation: "tp-rec-pulse 1.1s ease-in-out infinite",
};

const MOVEMENT_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  transform: "translateX(-50%)",
  bottom: "max(58px, calc(env(safe-area-inset-bottom, 0px) + 56px))",
  zIndex: 23,
  width: "min(480px, calc(100vw - 176px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  background: "rgba(4, 10, 22, 0.96)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(180, 210, 255, 0.13)",
  borderRadius: "12px",
  boxShadow: "0 14px 36px rgba(0, 0, 0, 0.62), 0 4px 12px rgba(0, 0, 0, 0.38)",
  padding: "8px 10px",
  display: "grid",
  gap: "5px",
};

const MP_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const MP_TITLE_STYLE: CSSProperties = {
  color: "rgba(180, 210, 255, 0.42)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "8px",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  userSelect: "none",
};

const MP_CLOSE_STYLE: CSSProperties = {
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  border: "1px solid rgba(180, 210, 255, 0.15)",
  background: "rgba(10, 20, 42, 0.60)",
  color: "rgba(180, 210, 255, 0.50)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "14px",
  fontWeight: 300,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: "1",
  padding: "0",
  flexShrink: 0,
};

const MP_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "3px",
  alignItems: "center",
};

const MP_ROW_LABEL: CSSProperties = {
  color: "rgba(180, 210, 255, 0.28)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "8px",
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  userSelect: "none",
  flexShrink: 0,
  marginRight: "2px",
};

const MP_CHIP: CSSProperties = {
  height: "26px",
  minWidth: "0",
  borderRadius: "7px",
  border: "1px solid rgba(180, 210, 255, 0.13)",
  background: "rgba(12, 22, 48, 0.75)",
  color: "rgba(200, 225, 255, 0.78)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  padding: "0 9px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const MP_CHIP_ACTIVE: CSSProperties = {
  ...MP_CHIP,
  border: "1px solid rgba(124, 255, 114, 0.54)",
  background: "rgba(18, 58, 36, 0.90)",
  color: "#d2ffce",
};

const MP_CHIP_SECONDARY: CSSProperties = {
  ...MP_CHIP,
  color: "rgba(180, 210, 255, 0.44)",
  border: "1px solid rgba(180, 210, 255, 0.09)",
};

const MP_PLAYER_CHIP: CSSProperties = {
  height: "28px",
  minWidth: "0",
  borderRadius: "8px",
  border: "1px solid rgba(180, 210, 255, 0.13)",
  background: "rgba(12, 22, 48, 0.75)",
  color: "rgba(200, 225, 255, 0.85)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  padding: "0 10px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
};

const MP_PLAYER_CHIP_ACTIVE: CSSProperties = {
  ...MP_PLAYER_CHIP,
  border: "1px solid rgba(124, 255, 114, 0.54)",
  background: "rgba(18, 58, 36, 0.90)",
  color: "#d2ffce",
};

const MP_DONE: CSSProperties = {
  height: "28px",
  minWidth: "68px",
  borderRadius: "7px",
  border: "1px solid rgba(124, 255, 114, 0.34)",
  background: "rgba(16, 52, 32, 0.90)",
  color: "#c4ffbf",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.05em",
  padding: "0 14px",
  cursor: "pointer",
};

const CONCEPT_LABELS: Record<MovementConcept, string> = {
  "support-run": "Support Run",
  "overlap": "Overlap",
  "shadow-run": "Shadow Run",
  "rotation": "Rotation",
  "custom": "Custom Run",
};

const CONCEPT_OPTIONS: Array<{ id: MovementConcept | null; label: string }> = [
  { id: null, label: "—" },
  { id: "support-run", label: "Support" },
  { id: "overlap", label: "Overlap" },
  { id: "shadow-run", label: "Shadow" },
  { id: "rotation", label: "Rotation" },
  { id: "custom", label: "Custom" },
];

const DELAY_PRESETS_MS = [0, 1000, 2000, 3000, 4000];

const TOKEN_COLOR_IS_LIGHT = new Set<PremiumPlayerTokenColor>(["yellow", "white"]);

const ALL_TOKEN_COLORS: PremiumPlayerTokenColor[] = [
  "blue", "red", "green", "yellow", "orange", "purple", "black", "white",
];

const TP_SPEED_OPTIONS: ReadonlyArray<{ multiplier: number; label: string }> = [
  { multiplier: 0.15, label: "0.15×" },
  { multiplier: 0.25, label: "0.25×" },
  { multiplier: 0.5,  label: "0.5×"  },
  { multiplier: 0.75, label: "0.75×" },
  { multiplier: 1.0,  label: "1×"    },
  { multiplier: 1.25, label: "1.25×" },
  { multiplier: 1.5,  label: "1.5×"  },
];
const TP_DEFAULT_SPEED_MULTIPLIER = 1.0;
const TP_ENUM_TO_MULTIPLIER: Record<string, number> = {
  slow: 0.5,
  normal: 1.0,
  fast: 1.25,
};

function multiplierToPlaybackSpeed(n: number): "slow" | "normal" | "fast" {
  if (n < 0.85) return "slow";
  if (n > 1.15) return "fast";
  return "normal";
}

const TP_SPEED_BAR_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr auto",
  alignItems: "center",
  gap: "5px",
  height: "30px",
  padding: "0 8px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.22)",
  background: "rgba(6, 14, 30, 0.72)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 6px 18px rgba(0, 0, 0, 0.36)",
  flex: "0 0 auto",
};
const TP_SPEED_LABEL_STYLE: CSSProperties = {
  color: "rgba(200, 230, 255, 0.50)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "8px",
  fontWeight: 700,
  letterSpacing: "0.18px",
  userSelect: "none",
};
const TP_SPEED_VALUE_STYLE: CSSProperties = {
  color: "rgba(220, 240, 255, 0.92)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.12px",
  textAlign: "right",
  userSelect: "none",
  minWidth: "32px",
};

export default function TacticalPlaySurface() {
  type MovementMenuMode = "move" | "route" | "play";

  const toShellMode = (menuMode: MovementMenuMode): MovementBoardMode =>
    menuMode === "route"
      ? "route"
      : menuMode === "play"
        ? "play"
        : "setup";

  const toMenuMode = (shellMode: MovementBoardMode): MovementMenuMode =>
    shellMode === "route" ? "route" : shellMode === "play" ? "play" : "move";

  const isPortrait = usePortraitOrientation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<MovementCanvasShellHandle | null>(null);
  const [menuMode, setMenuMode] = useState<MovementMenuMode>("move");
  const [playbackSpeedMultiplier, setPlaybackSpeedMultiplier] = useState<number>(TP_DEFAULT_SPEED_MULTIPLIER);
  const [selectedToken, setSelectedToken] = useState<MovementBoardToken | null>(null);
  const [routeCount, setRouteCount] = useState(0);
  const [routeEditState, setRouteEditState] = useState<MovementRouteEditState>({
    waypointCount: 0,
    selectedWaypointIndex: null,
    canRemoveSelectedWaypoint: false,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [ballCarrierId, setBallCarrierId] = useState<string | null>(null);
  const [ballOnPitch, setBallOnPitch] = useState(false);
  type BallMenuStep = "root" | "football-size" | "sliotar-size" | "existing";
  const [ballMenuStep, setBallMenuStep] = useState<BallMenuStep | null>(null);
  const [appViewportHeight, setAppViewportHeight] = useState(() => getTPViewportHeight());
  const [startFlash, setStartFlash] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [activeSetupCategory, setActiveSetupCategory] = useState<TacticalTemplateCategory | null>(null);
  const [tokenSize, setTokenSizeState] = useState<TokenSize>("medium");
  const [tokenRenderer, setTokenRendererState] = useState<TokenRendererName>("pixi");
  const [primaryColor, setPrimaryColorState] = useState<PremiumPlayerTokenColor>("blue");
  const [secondaryColor, setSecondaryColorState] = useState<PremiumPlayerTokenColor>("red");
  const [routes, setRoutes] = useState<MovementBoardRoute[]>([]);
  const [tokenNumberById, setTokenNumberById] = useState<Record<string, number>>({});
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [scenarios, setScenarios] = useState<TacticalScenario[]>([]);
  const [scenarioNameDraft, setScenarioNameDraft] = useState("");
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movementsSelectedPlayerId, setMovementsSelectedPlayerId] = useState<string | null>(null);
  const [passEvents, setPassEvents] = useState<TacticalPassEvent[]>([]);
  const [passesOpen, setPassesOpen] = useState(false);
  const [passFromId, setPassFromId] = useState<string | null>(null);
  const [passToId, setPassToId] = useState<string | null>(null);
  const [passTimingMs, setPassTimingMs] = useState<number>(0);
  const [passTriggerId, setPassTriggerId] = useState<string | null>(null);
  const [shootDelayMs, setShootDelayMs] = useState<number>(0);
  const [shotOpen, setShotOpen] = useState(false);
  const [shotEvents, setShotEvents] = useState<TacticalShotEvent[]>([]);
  const [scenarioRenameId, setScenarioRenameId] = useState<string | null>(null);
  const [scenarioRenameDraft, setScenarioRenameDraft] = useState("");
  const [playsOpen, setPlaysOpen] = useState(false);
  const [playsNameDraft, setPlaysNameDraft] = useState("");
  const [units, setUnits] = useState<TacticalUnit[]>([]);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [unitNameDraft, setUnitNameDraft] = useState("");
  const [unitEditingId, setUnitEditingId] = useState<string | null>(null);
  const [unitDrawingId, setUnitDrawingId] = useState<string | null>(null);
  const {
    recordPhase, setRecordPhase,
    recordDuration, setRecordDuration,
    recordCountdown,
    recordBlob,
    canRecord,
    startCountdown,
    dismissRecord,
    shareClip,
  } = useCanvasRecorder({
    getCanvas: () => shellRef.current?.getCanvas() ?? null,
    onBeforeCountdown: () => setPlaysOpen(false),
    onComplete: () => setPlaysOpen(true),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId = 0;
    let timeoutId: number | null = null;
    const clearScheduled = () => {
      if (timeoutId != null) { window.clearTimeout(timeoutId); timeoutId = null; }
      if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    };
    const syncHeight = () => {
      rafId = 0;
      const next = getTPViewportHeight();
      setAppViewportHeight((prev) => Math.abs(prev - next) <= 1 ? prev : next);
    };
    const schedule = (defer: boolean) => {
      clearScheduled();
      if (defer) { timeoutId = window.setTimeout(() => { rafId = window.requestAnimationFrame(syncHeight); }, 180); return; }
      rafId = window.requestAnimationFrame(syncHeight);
    };
    schedule(false);
    const vp = window.visualViewport;
    const onResize = () => schedule(false);
    const onOrient = () => schedule(true);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrient);
    vp?.addEventListener("resize", onResize);
    vp?.addEventListener("scroll", onResize);
    return () => {
      clearScheduled();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrient);
      vp?.removeEventListener("resize", onResize);
      vp?.removeEventListener("scroll", onResize);
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let destroyShell: (() => void) | null = null;
    let mountFrameA = 0;
    let mountFrameB = 0;
    let resizeFrameA = 0;
    let resizeFrameB = 0;

    const mountShell = () => {
      void createMovementCanvasShell(host, {
        mode: toShellMode(menuMode),
        dragEnabled: !isPortrait,
        onTokenMove: (token) => {
          setSelectedToken((previous) => (previous?.id === token.id ? token : previous));
        },
        onSelectedTokenChange: (token) => {
          setSelectedToken(token);
        },
        onRoutesChange: (nextRoutes) => {
          setRouteCount(nextRoutes.length);
          setRoutes(nextRoutes);
        },
        onPlaybackStateChange: (state) => {
          setIsPlaying(state.isPlaying);
          setIsPaused(state.isPaused);
        },
        onRouteEditStateChange: (state) => {
          setRouteEditState(state);
        },
        onBallStateChange: (state) => {
          setBallCarrierId(state.carrierId ?? null);
          setBallOnPitch(!!(state.carrierId || state.position));
        },
        onPassEventsChange: (events) => {
          setPassEvents([...events]);
        },
      }).then((shell) => {
        if (disposed) {
          shell.destroy();
          return;
        }
        shellRef.current = shell;
        setMenuMode(toMenuMode(shell.getMode()));
        shell.setSpeedMultiplier(TP_DEFAULT_SPEED_MULTIPLIER);
        shell.setTokenRenderer("pixi");
        setTokenSizeState(shell.getTokenSize());
        const initialRoutes = shell.getRoutes();
        setRouteCount(initialRoutes.length);
        setRoutes(initialRoutes);
        const nums: Record<string, number> = {};
        for (const t of shell.getTokens()) nums[t.id] = t.number;
        setTokenNumberById(nums);
        const selected = shell.getSelectedToken();
        setSelectedToken(selected);
        setRouteEditState(shell.getRouteEditState());
        const playbackState = shell.getPlaybackState();
        setIsPlaying(playbackState.isPlaying);
        setIsPaused(playbackState.isPaused);
        const initialBallState = shell.getBallState();
        setBallCarrierId(initialBallState.carrierId ?? null);
        setBallOnPitch(!!(initialBallState.carrierId || initialBallState.position));
        shell.setDragEnabled(!isPortrait);
        setScenarios(listScenarios());
        setPassEvents(shell.getPassEvents());
        destroyShell = shell.destroy;
      });
    };

    const scheduleReflow = () => {
      window.cancelAnimationFrame(resizeFrameA);
      window.cancelAnimationFrame(resizeFrameB);
      resizeFrameA = window.requestAnimationFrame(() => {
        resizeFrameB = window.requestAnimationFrame(() => {
          if (disposed) return;
          shellRef.current?.reflow();
        });
      });
    };

    window.addEventListener("resize", scheduleReflow);

    mountFrameA = window.requestAnimationFrame(() => {
      mountFrameB = window.requestAnimationFrame(() => {
        if (disposed) return;
        mountShell();
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", scheduleReflow);
      window.cancelAnimationFrame(mountFrameA);
      window.cancelAnimationFrame(mountFrameB);
      window.cancelAnimationFrame(resizeFrameA);
      window.cancelAnimationFrame(resizeFrameB);
      shellRef.current = null;
      destroyShell?.();
    };
  }, []);

  useEffect(() => {
    shellRef.current?.setDragEnabled(!isPortrait);
  }, [isPortrait]);

  useEffect(() => {
    shellRef.current?.setMode(toShellMode(menuMode));
  }, [menuMode]);

  useEffect(() => {
    shellRef.current?.setSpeedMultiplier(playbackSpeedMultiplier);
  }, [playbackSpeedMultiplier]);

  useEffect(() => {
    if (isPlaying) {
      setIsControlsOpen(false);
      setSetupOpen(false);
      setBallMenuStep(null);
      setMovementsOpen(false);
      setPassesOpen(false);
      setPlaysOpen(false);
      setUnitsOpen(false);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isControlsOpen) {
      setBallMenuStep(null);
    }
  }, [isControlsOpen]);

  const selectedRoute = routes.find((r) => r.playerId === selectedToken?.id) ?? null;
  const selectedRouteConcept = selectedRoute?.concept ?? null;

  type SeqItem =
    | { kind: "route"; route: MovementBoardRoute }
    | { kind: "pass"; pass: TacticalPassEvent };

  const sortedItems: SeqItem[] = [
    ...routes.map((r): SeqItem => ({ kind: "route", route: r })),
    ...passEvents.map((p): SeqItem => ({ kind: "pass", pass: p })),
  ].sort((a, b) => {
    const aTriggered = a.kind === "route" ? a.route.triggeredBy : a.pass.triggeredBy;
    const bTriggered = b.kind === "route" ? b.route.triggeredBy : b.pass.triggeredBy;
    const aDelay = a.kind === "route" ? (a.route.delayMs ?? 0) : (a.pass.delayMs ?? 0);
    const bDelay = b.kind === "route" ? (b.route.delayMs ?? 0) : (b.pass.delayMs ?? 0);
    const aOrd = aTriggered != null ? Infinity : aDelay;
    const bOrd = bTriggered != null ? Infinity : bDelay;
    return aOrd - bOrd;
  });

  const movementsRoute = movementsSelectedPlayerId
    ? routes.find((r) => r.playerId === movementsSelectedPlayerId) ?? null
    : null;
  const movementsRouteConcept = movementsRoute?.concept ?? null;
  const movementsRouteDelay = movementsRoute?.delayMs ?? null;
  const movementsRouteTrigger = movementsRoute?.triggeredBy ?? null;
  const movementsRoutedPlayers = routes
    .map((r) => ({ playerId: r.playerId, number: tokenNumberById[r.playerId] ?? 0 }))
    .sort((a, b) => a.number - b.number);
  const movementsOtherPlayers = routes
    .filter((r) => r.playerId !== movementsSelectedPlayerId)
    .map((r) => ({ playerId: r.playerId, number: tokenNumberById[r.playerId] ?? 0 }))
    .sort((a, b) => a.number - b.number);

  const modeLabelByMenu: Record<MovementMenuMode, string> = {
    move: "Move",
    route: "Route",
    play: "Play",
  };

  const selectedHasBall = selectedToken != null && selectedToken.id === ballCarrierId;
  const conceptSuffix = selectedRouteConcept ? ` · ${CONCEPT_LABELS[selectedRouteConcept]}` : "";
  const coachInfoLabel = selectedToken
    ? `P${selectedToken.number}${selectedHasBall ? " · Ball" : ""}${conceptSuffix} · Moves ${routeCount}`
    : ballCarrierId
      ? `Ball Assigned · Moves ${routeCount}`
      : ballOnPitch
        ? `Ball on Pitch · Moves ${routeCount}`
        : `${modeLabelByMenu[menuMode]} · Moves ${routeCount}`;

  const onPlayRoutesPress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    setIsControlsOpen(false);
    shell.playAll();
    setMenuMode("play");
  };

  const onPauseResumePress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (isPlaying) {
      shell.pausePlayback();
      return;
    }
    if (isPaused) {
      shell.resumePlayback();
      return;
    }
    shell.playAll();
  };

  const onPausePress = () => {
    if (!isPlaying) return;
    shellRef.current?.pausePlayback();
  };

  const onPlayResumePress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (isPaused) {
      shell.resumePlayback();
      return;
    }
    if (!isPlaying) {
      shell.playAll();
    }
  };

  const cycleSelectedEntity = (direction: "prev" | "next") => {
    const shell = shellRef.current;
    if (!shell) return;
    const tokens = shell.getTokens();
    if (tokens.length <= 0) return;
    const selectedId = shell.getSelectedToken()?.id ?? null;
    const selectedIndex = tokens.findIndex((token) => token.id === selectedId);
    const baseIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const delta = direction === "next" ? 1 : -1;
    const nextIndex = (baseIndex + delta + tokens.length) % tokens.length;
    const nextToken = tokens[nextIndex];
    if (!nextToken) return;
    shell.setSelectedToken(nextToken.id);
  };

  const resetBoard = () => {
    shellRef.current?.reset();
  };

  const onSetStart = () => {
    shellRef.current?.setStartPositions();
    setStartFlash(true);
    setTimeout(() => { setStartFlash(false); }, 700);
  };

  const clearRoute = () => {
    shellRef.current?.clearSelectedRoute();
  };

  const clearAll = () => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setRoutes([]);
    shell.setPassEvents([]);
    setPassEvents([]);
    for (const shot of shell.getShotEvents()) shell.removeShotEvent(shot.id);
    setShotEvents([]);
    setUnitDrawingId(null);
    setMovementsSelectedPlayerId(null);
    setPassFromId(null);
    setPassToId(null);
    setPassTriggerId(null);
  };

  const giveSelectedPlayerBall = () => {
    const shell = shellRef.current;
    const token = selectedToken;
    if (!shell || !token) return;
    shell.giveBall(token.id);
  };

  const onBallButtonPress = () => {
    if (ballOnPitch) {
      setBallMenuStep((prev) => (prev === "existing" ? null : "existing"));
    } else {
      setBallMenuStep((prev) => (prev === null ? "root" : null));
    }
  };

  const onSetupPress = () => {
    setIsControlsOpen(false);
    setSetupOpen((prev) => !prev);
    setPlaysOpen(false);
  };

  const onSetTokenSize = (size: TokenSize) => {
    shellRef.current?.setTokenSize(size);
    setTokenSizeState(size);
  };

  const onSetTokenRenderer = (name: TokenRendererName) => {
    shellRef.current?.setTokenRenderer(name);
    setTokenRendererState(name);
  };

  const onLoadTemplate = (template: TacticalTemplate) => {
    const shell = shellRef.current;
    if (!shell) return;
    for (const token of shell.getTokens()) {
      shell.setSelectedToken(token.id);
      shell.clearSelectedRoute();
    }
    shell.setSelectedToken(null);
    shell.setTokens(applyTemplatePositions(shell.getTokens(), template));
    if (template.routes) {
      const tokens = shell.getTokens();
      const routes = template.routes.flatMap((r) => {
        const token = tokens.find((t) => t.number === r.jerseyNumber);
        return token ? [{ playerId: token.id, points: r.points }] : [];
      });
      shell.setRoutes(routes);
    }
    shell.setStartPositions();
    setSetupOpen(false);
  };

  const onSetPrimaryColor = (color: PremiumPlayerTokenColor) => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setTokens(shell.getTokens().map((t) => ({ ...t, color })));
    setPrimaryColorState(color);
  };

  const onSetSecondaryColor = (color: PremiumPlayerTokenColor) => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setTokens(shell.getTokens().map((t) => ({ ...t, secondaryColor: color })));
    setSecondaryColorState(color);
  };

  const onSelectBallType = (ballType: BallType) => {
    shellRef.current?.placeBall(ballType);
    setBallMenuStep(null);
  };

  const onFreeBall = () => {
    shellRef.current?.freeBall();
    setBallMenuStep(null);
  };

  const onRemoveBall = () => {
    shellRef.current?.removeBall();
    setBallMenuStep(null);
  };

  const goBack = () => {
    if (typeof window === "undefined") return;
    const referrer = document.referrer;
    const hasSameOriginReferrer = (() => {
      if (!referrer) return false;
      try {
        return new URL(referrer).origin === window.location.origin;
      } catch {
        return false;
      }
    })();
    if (hasSameOriginReferrer || window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/vision-tactics");
  };

  const onMovementsSetConcept = (concept: MovementConcept | null) => {
    const shell = shellRef.current;
    if (!shell || !movementsSelectedPlayerId) return;
    shell.setRouteMeta(movementsSelectedPlayerId, { concept: concept ?? undefined });
  };

  const onMovementsSetDelay = (delayMs: number) => {
    const shell = shellRef.current;
    if (!shell || !movementsSelectedPlayerId) return;
    shell.setRouteMeta(movementsSelectedPlayerId, { delayMs, triggeredBy: undefined });
  };

  const onMovementsSetTrigger = (triggeredBy: string | null) => {
    const shell = shellRef.current;
    if (!shell || !movementsSelectedPlayerId) return;
    shell.setRouteMeta(movementsSelectedPlayerId, { triggeredBy: triggeredBy ?? undefined, delayMs: undefined });
  };

  const onAddPass = () => {
    const shell = shellRef.current;
    if (!shell || !passFromId || !passToId || passFromId === passToId) return;
    const event: TacticalPassEvent = {
      id: `pass-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fromPlayerId: passFromId,
      toPlayerId: passToId,
      ...(passTriggerId != null
        ? { triggeredBy: passTriggerId }
        : { delayMs: passTimingMs }),
    };
    shell.addPassEvent(event);
    setPassFromId(passToId);
    setPassToId(null);
  };

  const onRemovePass = (id: string) => {
    shellRef.current?.removePassEvent(id);
  };

  const onSaveScenario = () => {
    const shell = shellRef.current;
    if (!shell) return;
    saveScenario(
      scenarioNameDraft.trim() || "Scenario",
      shell.getTokens(),
      shell.getRoutes(),
      shell.getBallState(),
      shell.getPassEvents(),
      shell.getShotEvents(),
      multiplierToPlaybackSpeed(playbackSpeedMultiplier),
      units,
    );
    setScenarios(listScenarios());
    setScenarioNameDraft("");
  };

  const onLoadScenario = (scenario: TacticalScenario) => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setTokens(scenario.tokens);
    shell.setRoutes(scenario.routes);
    if (scenario.ballState.carrierId) {
      shell.giveBall(scenario.ballState.carrierId);
    } else if (scenario.ballState.position) {
      shell.placeBall(scenario.ballState.ballType ?? "footballSmall", scenario.ballState.position);
    } else {
      shell.removeBall();
    }
    shell.setPassEvents(scenario.passEvents ?? []);
    setPassEvents(scenario.passEvents ?? []);
    for (const existing of shell.getShotEvents()) {
      shell.removeShotEvent(existing.id);
    }
    const loadedShots = scenario.shotEvents ?? [];
    for (const shot of loadedShots) {
      shell.addShotEvent(shot);
    }
    setShotEvents(loadedShots);
    const speedMultiplier = TP_ENUM_TO_MULTIPLIER[scenario.playbackSpeed ?? "normal"] ?? TP_DEFAULT_SPEED_MULTIPLIER;
    setPlaybackSpeedMultiplier(speedMultiplier);
    shell.setSpeedMultiplier(speedMultiplier);
    shell.setStartPositions();
    setUnits(scenario.units ?? []);
    setScenariosOpen(false);
    setScenarioRenameId(null);
  };

  const onDeleteScenario = (id: string) => {
    deleteScenario(id);
    setScenarios(listScenarios());
  };

  const onDuplicateScenario = (id: string) => {
    duplicateScenario(id);
    setScenarios(listScenarios());
  };

  const onRenameScenario = (id: string, name: string) => {
    renameScenario(id, name);
    setScenarios(listScenarios());
  };

  const onSavePlays = () => {
    const shell = shellRef.current;
    if (!shell) return;
    saveScenario(
      playsNameDraft.trim() || "My Play",
      shell.getTokens(),
      shell.getRoutes(),
      shell.getBallState(),
      shell.getPassEvents(),
      shell.getShotEvents(),
      multiplierToPlaybackSpeed(playbackSpeedMultiplier),
      units,
    );
    setScenarios(listScenarios());
    setPlaysNameDraft("");
  };

  const onCreateUnit = () => {
    const name = unitNameDraft.trim();
    if (!name) return;
    const newUnit: TacticalUnit = {
      id: `unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      memberIds: [],
    };
    setUnits((prev) => [...prev, newUnit]);
    setUnitNameDraft("");
    setUnitEditingId(newUnit.id);
  };

  const onDeleteUnit = (id: string) => {
    setUnits((prev) => prev.filter((u) => u.id !== id));
    if (unitEditingId === id) setUnitEditingId(null);
    if (unitDrawingId === id) setUnitDrawingId(null);
  };

  const onToggleUnitMember = (unitId: string, playerId: string) => {
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        const isMember = u.memberIds.includes(playerId);
        return {
          ...u,
          memberIds: isMember
            ? u.memberIds.filter((mid) => mid !== playerId)
            : [...u.memberIds, playerId],
        };
      }),
    );
  };

  const onApplyUnitRoute = () => {
    const shell = shellRef.current;
    const unit = units.find((u) => u.id === unitDrawingId);
    if (!shell || !unit || !selectedToken) return;
    const leaderRoute = shell.getRoutes().find((r) => r.playerId === selectedToken.id);
    if (!leaderRoute || leaderRoute.points.length < 2) return;
    const tokenPositions = new Map<string, NormalizedPoint>(
      shell.getTokens().map((t) => [t.id, t.position]),
    );
    const memberRoutes = buildMemberRoutes(leaderRoute.points, unit, selectedToken.id, tokenPositions);
    const unitMemberIds = new Set(unit.memberIds);
    const existingRoutes = shell.getRoutes().filter((r) => !unitMemberIds.has(r.playerId));
    shell.setRoutes([...existingRoutes, ...memberRoutes]);
    setUnitDrawingId(null);
  };

  const onAddPlayer = () => {
    const shell = shellRef.current;
    if (!shell) return;
    const tokens = shell.getTokens();
    const maxNumber = tokens.reduce((m, t) => Math.max(m, t.number), 0);
    const nextNumber = maxNumber + 1;
    const newToken: MovementBoardToken = {
      id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      number: nextNumber,
      color: "red",
      position: { x: 50, y: 50 },
    };
    shell.setTokens([...tokens, newToken]);
    setTokenNumberById((prev) => ({ ...prev, [newToken.id]: nextNumber }));
  };

  const onRemoveSelectedPlayer = () => {
    const shell = shellRef.current;
    if (!shell || !selectedToken) return;
    const removedId = selectedToken.id;
    const remaining = shell.getTokens().filter((t) => t.id !== removedId);
    shell.setTokens(remaining);
    // Clean pass events referencing removed player
    const nextPassEvents = shell.getPassEvents().filter(
      (p) => p.fromPlayerId !== removedId && p.toPlayerId !== removedId,
    );
    shell.setPassEvents(nextPassEvents);
    setPassEvents([...nextPassEvents]);
    // Clean shot events referencing removed player
    for (const shot of shell.getShotEvents()) {
      if (shot.shooterId === removedId) shell.removeShotEvent(shot.id);
    }
    setShotEvents((prev) => prev.filter((s) => s.shooterId !== removedId));
    // Clean unit memberships
    setUnits((prev) => prev.map((u) => ({ ...u, memberIds: u.memberIds.filter((mid) => mid !== removedId) })));
    // Clean pass/trigger UI state
    if (passFromId === removedId) setPassFromId(null);
    if (passToId === removedId) setPassToId(null);
    if (passTriggerId === removedId) setPassTriggerId(null);
    if (movementsSelectedPlayerId === removedId) setMovementsSelectedPlayerId(null);
    setTokenNumberById((prev) => { const next = { ...prev }; delete next[removedId]; return next; });
  };

  const modeIsPlaybackLocked = isPlaying || isPaused;
  const clearRouteDisabled = menuMode !== "route" || routeEditState.waypointCount < 2 || isPlaying;
  const removePointDisabled = menuMode !== "route" || !routeEditState.canRemoveSelectedWaypoint || isPlaying;
  const playRoutesDisabled = isPortrait || isPlaying || isPaused;
  const pauseResumeDisabled = isPortrait;
  const playbackFloatingVisible = isPlaying || isPaused;

  const speedIndex = Math.max(0, TP_SPEED_OPTIONS.findIndex((o) => o.multiplier === playbackSpeedMultiplier));
  const speedLabel = TP_SPEED_OPTIONS[speedIndex]?.label ?? "1×";
  const speedFillPct = (speedIndex / Math.max(1, TP_SPEED_OPTIONS.length - 1)) * 100;
  const SpeedBar = (
    <div style={TP_SPEED_BAR_STYLE}>
      <span style={TP_SPEED_LABEL_STYLE}>SPD</span>
      <input
        type="range"
        className="tp-speed-range"
        min={0}
        max={TP_SPEED_OPTIONS.length - 1}
        step={1}
        value={speedIndex}
        aria-label="Playback speed"
        style={{ width: "100%", minWidth: 0, "--tp-speed-track": `linear-gradient(90deg, rgba(34,197,94,0.95) 0%, rgba(34,197,94,0.95) ${speedFillPct}%, rgba(200,230,255,0.35) ${speedFillPct}%, rgba(200,230,255,0.35) 100%)` } as CSSProperties}
        onChange={(e) => {
          const idx = Math.max(0, Math.min(TP_SPEED_OPTIONS.length - 1, Number.parseInt(e.target.value, 10)));
          const next = TP_SPEED_OPTIONS[idx]?.multiplier;
          if (next != null) setPlaybackSpeedMultiplier(next);
        }}
      />
      <span style={TP_SPEED_VALUE_STYLE}>{speedLabel}</span>
    </div>
  );

  // Portrait: anchor PLAYS to bottom-right stack (above Setup), not pitch-center right.
  const playsButtonStyle: CSSProperties = isPortrait
    ? { ...PLAYS_BUBBLE_STYLE, top: "auto", bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))", transform: "none" }
    : PLAYS_BUBBLE_STYLE;
  const playsPanelStyle: CSSProperties = isPortrait
    ? { ...PLAYS_PANEL_STYLE, top: "auto", bottom: "max(102px, calc(env(safe-area-inset-bottom, 0px) + 100px))", transform: "none", right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))", maxHeight: "55vh" }
    : PLAYS_PANEL_STYLE;

  const rootStyle: CSSProperties = {
    ...ROOT_STYLE,
    [TP_HEIGHT_VAR]: `${Math.max(0, Math.floor(appViewportHeight))}px`,
  } as CSSProperties;

  return (
    <OrientationGate modeLabel="Tactical Play">
      <style>{`@keyframes tp-rec-pulse{0%,100%{opacity:1}50%{opacity:0.30}}input.tp-speed-range{-webkit-appearance:none;appearance:none;background:var(--tp-speed-track);height:3px;border-radius:3px;outline:none;cursor:pointer}input.tp-speed-range::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:#fff;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.50)}input.tp-speed-range::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:#fff;cursor:pointer;border:none;box-shadow:0 1px 4px rgba(0,0,0,.50)}`}</style>
      <div style={rootStyle}>
        <VisionStadiumBackground variant="board" />
        <div style={CONTENT_STYLE}>
          <div ref={hostRef} style={PITCH_STYLE} />
        </div>

        <button type="button" style={BACK_BUTTON_STYLE} onClick={goBack}>
          Vision Tactics
        </button>

        <div style={INFO_PILL_STYLE}>{coachInfoLabel}</div>

        <div style={PV_BADGE_STYLE}>PV</div>
        <div style={PV_WATERMARK_STYLE}>PáircVision</div>
        <button
          type="button"
          style={CTRL_BUBBLE_STYLE}
          onClick={() => { setIsControlsOpen((prev) => !prev); setSetupOpen(false); setSequenceOpen(false); setScenariosOpen(false); setMovementsOpen(false); setPassesOpen(false); setPlaysOpen(false); }}
        >
          CTRL
        </button>
        <button
          type="button"
          style={setupOpen
            ? { ...SETUP_BUBBLE_STYLE, border: "1px solid rgba(124, 255, 114, 0.40)", background: "rgba(14, 32, 22, 0.82)" }
            : SETUP_BUBBLE_STYLE}
          disabled={modeIsPlaybackLocked}
          onClick={onSetupPress}
        >
          Setup
        </button>

        {/* Countdown overlay */}
        {recordPhase === "countdown" ? (
          <div style={RECORD_COUNTDOWN_STYLE}>{recordCountdown}</div>
        ) : null}

        {/* Red recording dot */}
        {recordPhase === "recording" ? (
          <div style={RECORD_DOT_STYLE} />
        ) : null}

        {!isControlsOpen && !setupOpen && !isPlaying && !isPaused ? (
          <div style={HINT_PILL_STYLE}>Move players → Set Start → Draw Movements → Play</div>
        ) : null}

        {sequenceOpen && !isControlsOpen && sortedItems.length > 0 ? (
          <div style={SEQ_PANEL_STYLE}>
            <div style={PANEL_ROW_STYLE}>
              <span style={SETUP_SECTION_LABEL_STYLE}>Sequence</span>
              {sortedItems.map((item, idx) => {
                if (item.kind === "route") {
                  const r = item.route;
                  const num = tokenNumberById[r.playerId] ?? "?";
                  const conceptText = r.concept ? CONCEPT_LABELS[r.concept] : "Run";
                  let timingText = "";
                  if (r.triggeredBy) {
                    const trigNum = tokenNumberById[r.triggeredBy] ?? "?";
                    timingText = `after P${trigNum}`;
                  } else if (r.delayMs != null && r.delayMs > 0) {
                    timingText = `${(r.delayMs / 1000).toFixed(1)}s`;
                  } else {
                    timingText = "0s";
                  }
                  return (
                    <span key={r.playerId} style={SEQ_CHIP_STYLE}>
                      <span style={{ opacity: 0.50 }}>{idx + 1}.</span>
                      <span>P{num}</span>
                      <span style={{ opacity: 0.65 }}>{conceptText}</span>
                      <span style={{ opacity: 0.45 }}>{timingText}</span>
                    </span>
                  );
                }
                const p = item.pass;
                const fromNum = tokenNumberById[p.fromPlayerId] ?? "?";
                const toNum = tokenNumberById[p.toPlayerId] ?? "?";
                let timingText = "";
                if (p.triggeredBy) {
                  const trigNum = tokenNumberById[p.triggeredBy] ?? "?";
                  timingText = `after P${trigNum}`;
                } else if (p.delayMs != null && p.delayMs > 0) {
                  timingText = `${(p.delayMs / 1000).toFixed(1)}s`;
                } else {
                  timingText = "0s";
                }
                return (
                  <span key={p.id} style={{ ...SEQ_CHIP_STYLE, border: "1px solid rgba(255, 210, 80, 0.30)", color: "rgba(255, 230, 140, 0.88)" }}>
                    <span style={{ opacity: 0.50 }}>{idx + 1}.</span>
                    <span>P{fromNum}→P{toNum}</span>
                    <span style={{ opacity: 0.45 }}>{timingText}</span>
                  </span>
                );
              })}
              <button type="button" style={{ ...COLLAPSE_BUTTON_STYLE, minWidth: "44px" }} onClick={() => setSequenceOpen(false)}>
                ×
              </button>
            </div>
          </div>
        ) : null}

        {isControlsOpen ? (
          <div style={CONTROL_PANEL_STYLE}>
            {/* Segmented mode pill — Move | Route | Ball */}
            <div style={PANEL_ROW_STYLE}>
              <button
                type="button"
                style={menuMode === "move" ? SEG_ITEM_ACTIVE_STYLE : SEG_ITEM_STYLE}
                disabled={modeIsPlaybackLocked}
                onClick={() => setMenuMode("move")}
              >
                Move
              </button>
              <button
                type="button"
                style={menuMode === "route" ? SEG_ITEM_ACTIVE_STYLE : SEG_ITEM_STYLE}
                disabled={modeIsPlaybackLocked}
                onClick={() => setMenuMode("route")}
              >
                Route
              </button>
              <button
                type="button"
                style={ballOnPitch ? SEG_ITEM_ACTIVE_STYLE : SEG_ITEM_STYLE}
                disabled={modeIsPlaybackLocked}
                onClick={onBallButtonPress}
              >
                Ball
              </button>
            </div>

            {/* Primary actions row */}
            <div style={PANEL_ROW_STYLE}>
              <button
                type="button"
                style={menuMode === "move" && !modeIsPlaybackLocked ? (startFlash ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE) : TOOL_DISABLED_STYLE}
                disabled={menuMode !== "move" || modeIsPlaybackLocked}
                onClick={onSetStart}
              >
                Set Start
              </button>
              <button type="button" style={TOOL_BUTTON_STYLE} onClick={resetBoard}>
                Reset
              </button>
              {!modeIsPlaybackLocked ? (
                <button type="button" style={TOOL_BUTTON_STYLE} onClick={onAddPlayer}>
                  + Player
                </button>
              ) : null}
              <button
                type="button"
                style={unitsOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                disabled={modeIsPlaybackLocked}
                onClick={() => { setUnitsOpen((prev) => !prev); setMovementsOpen(false); setPassesOpen(false); setIsControlsOpen(false); }}
              >
                Move As One
              </button>
              <button
                type="button"
                style={movementsOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                onClick={() => { setMovementsOpen((prev) => !prev); setPassesOpen(false); setUnitsOpen(false); setIsControlsOpen(false); }}
              >
                Movements
              </button>
              <button
                type="button"
                style={sequenceOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                onClick={() => setSequenceOpen((prev) => !prev)}
              >
                Sequence
              </button>
              <button
                type="button"
                style={passesOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                onClick={() => { setPassesOpen((prev) => !prev); setMovementsOpen(false); setIsControlsOpen(false); }}
              >
                Passes
              </button>
              <button
                type="button"
                style={isPlaying || (routes.length === 0 && passEvents.length === 0 && shotEvents.length === 0) ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                onClick={clearAll}
                disabled={isPlaying || (routes.length === 0 && passEvents.length === 0 && shotEvents.length === 0)}
              >
                Clear All
              </button>
              <button type="button" style={COLLAPSE_BUTTON_STYLE} onClick={() => setIsControlsOpen(false)}>
                Hide
              </button>
            </div>

            {sequenceOpen && sortedItems.length > 0 ? (
              <div style={PANEL_ROW_STYLE}>
                <span style={SETUP_SECTION_LABEL_STYLE}>Sequence</span>
                {sortedItems.map((item, idx) => {
                  if (item.kind === "route") {
                    const r = item.route;
                    const num = tokenNumberById[r.playerId] ?? "?";
                    const conceptText = r.concept ? CONCEPT_LABELS[r.concept] : "Run";
                    let timingText = "";
                    if (r.triggeredBy) {
                      const trigNum = tokenNumberById[r.triggeredBy] ?? "?";
                      timingText = `after P${trigNum}`;
                    } else if (r.delayMs != null && r.delayMs > 0) {
                      timingText = `${(r.delayMs / 1000).toFixed(1)}s`;
                    } else {
                      timingText = "0s";
                    }
                    return (
                      <span key={r.playerId} style={SEQ_CHIP_STYLE}>
                        <span style={{ opacity: 0.50 }}>{idx + 1}.</span>
                        P{num} {conceptText}
                        <span style={{ opacity: 0.45 }}>{timingText}</span>
                      </span>
                    );
                  }
                  const p = item.pass;
                  const fromNum = tokenNumberById[p.fromPlayerId] ?? "?";
                  const toNum = tokenNumberById[p.toPlayerId] ?? "?";
                  let timingText = "";
                  if (p.triggeredBy) {
                    const trigNum = tokenNumberById[p.triggeredBy] ?? "?";
                    timingText = `after P${trigNum}`;
                  } else if (p.delayMs != null && p.delayMs > 0) {
                    timingText = `${(p.delayMs / 1000).toFixed(1)}s`;
                  } else {
                    timingText = "0s";
                  }
                  return (
                    <span key={p.id} style={{ ...SEQ_CHIP_STYLE, border: "1px solid rgba(255, 210, 80, 0.30)", color: "rgba(255, 230, 140, 0.88)" }}>
                      <span style={{ opacity: 0.50 }}>{idx + 1}.</span>
                      P{fromNum}→P{toNum}
                      <span style={{ opacity: 0.45 }}>{timingText}</span>
                    </span>
                  );
                })}
              </div>
            ) : null}

            {ballMenuStep !== null ? (
              <div style={PANEL_ROW_STYLE}>
                {ballMenuStep === "root" ? (
                  <>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => setBallMenuStep("football-size")}>
                      ⚽ Football
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => setBallMenuStep("sliotar-size")}>
                      🥎 Sliotar
                    </button>
                  </>
                ) : null}
                {ballMenuStep === "football-size" ? (
                  <>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => setBallMenuStep("root")}>
                      ← Back
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onSelectBallType("footballSmall")}>
                      ⚽ Small
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onSelectBallType("footballMedium")}>
                      ⚽ Medium
                    </button>
                  </>
                ) : null}
                {ballMenuStep === "sliotar-size" ? (
                  <>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => setBallMenuStep("root")}>
                      ← Back
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onSelectBallType("sliotarSmall")}>
                      🥎 Small
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onSelectBallType("sliotarMedium")}>
                      🥎 Medium
                    </button>
                  </>
                ) : null}
                {ballMenuStep === "existing" ? (
                  <>
                    {ballCarrierId ? (
                      <button type="button" style={TOOL_BUTTON_STYLE} onClick={onFreeBall}>
                        Free Ball
                      </button>
                    ) : null}
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={onRemoveBall}>
                      Remove Ball
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            {/* Route mode: editing tools */}
            {menuMode === "route" ? (
              <div style={PANEL_ROW_STYLE}>
                <button
                  type="button"
                  style={isPlaying ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                  onClick={() => cycleSelectedEntity("prev")}
                  disabled={isPlaying}
                >
                  Prev
                </button>
                <button
                  type="button"
                  style={isPlaying ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                  onClick={() => cycleSelectedEntity("next")}
                  disabled={isPlaying}
                >
                  Next
                </button>
                <button
                  type="button"
                  style={removePointDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                  onClick={() => shellRef.current?.removeSelectedWaypoint()}
                  disabled={removePointDisabled}
                >
                  Remove
                </button>
                <button
                  type="button"
                  style={clearRouteDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                  onClick={clearRoute}
                  disabled={clearRouteDisabled}
                >
                  Clear Route
                </button>
                <button
                  type="button"
                  style={playRoutesDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                  onClick={onPlayRoutesPress}
                  disabled={playRoutesDisabled}
                >
                  Play Routes
                </button>
                {unitDrawingId !== null && selectedToken && routes.some((r) => r.playerId === selectedToken.id) ? (
                  <button
                    type="button"
                    style={{ ...TOOL_ACTIVE_STYLE, border: "1px solid rgba(255, 200, 80, 0.60)", background: "rgba(60, 50, 10, 0.90)", color: "#ffe87a" }}
                    onClick={onApplyUnitRoute}
                  >
                    Apply to Unit
                  </button>
                ) : null}
                {selectedToken && !isPlaying ? (
                  <button
                    type="button"
                    style={selectedHasBall ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                    onClick={giveSelectedPlayerBall}
                  >
                    {selectedHasBall ? "Has Ball" : "Give Ball"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Move mode: selected token actions */}
            {menuMode === "move" && selectedToken && !modeIsPlaybackLocked ? (
              <div style={PANEL_ROW_STYLE}>
                <button
                  type="button"
                  style={selectedHasBall ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                  onClick={giveSelectedPlayerBall}
                >
                  {selectedHasBall ? "Has Ball" : "Give Ball"}
                </button>
                <button
                  type="button"
                  style={{ ...TOOL_BUTTON_STYLE, color: "rgba(255, 140, 140, 0.80)" }}
                  onClick={onRemoveSelectedPlayer}
                >
                  − Player
                </button>
              </div>
            ) : null}

            {/* Play mode: playback controls + speed */}
            {menuMode === "play" ? (
              <div style={PANEL_ROW_STYLE}>
                <button
                  type="button"
                  style={pauseResumeDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                  onClick={onPauseResumePress}
                  disabled={pauseResumeDisabled}
                >
                  {isPlaying ? "Pause" : isPaused ? "Resume" : "Play"}
                </button>
                {SpeedBar}
              </div>
            ) : null}
          </div>
        ) : null}

        {movementsOpen && routes.length > 0 ? (
          <div style={MOVEMENT_PANEL_STYLE}>
            <div style={MP_HEADER_STYLE}>
              <span style={MP_TITLE_STYLE}>Movements</span>
              <button type="button" style={MP_CLOSE_STYLE} onClick={() => setMovementsOpen(false)}>
                ×
              </button>
            </div>

            <div style={MP_ROW}>
              {movementsRoutedPlayers.map((p) => {
                const r = routes.find((route) => route.playerId === p.playerId);
                const conceptShort = r?.concept != null ? CONCEPT_LABELS[r.concept].split(" ")[0] : null;
                const timingShort = r?.triggeredBy
                  ? `P${tokenNumberById[r.triggeredBy] ?? "?"}`
                  : r?.delayMs != null
                    ? r.delayMs === 0 ? "Now" : `+${r.delayMs / 1000}s`
                    : null;
                const summary = [conceptShort, timingShort].filter(Boolean).join(" · ");
                const isSelected = movementsSelectedPlayerId === p.playerId;
                return (
                  <button
                    key={p.playerId}
                    type="button"
                    style={isSelected ? MP_PLAYER_CHIP_ACTIVE : MP_PLAYER_CHIP}
                    onClick={() => setMovementsSelectedPlayerId(isSelected ? null : p.playerId)}
                  >
                    <span>P{p.number}</span>
                    {summary ? (
                      <span style={{ opacity: 0.52, fontSize: "8px", letterSpacing: "0.02em" }}>{summary}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {movementsSelectedPlayerId ? (
              <>
                <div style={MP_ROW}>
                  <span style={MP_ROW_LABEL}>Type</span>
                  {([
                    { id: "support-run" as MovementConcept, label: "Support" },
                    { id: "overlap" as MovementConcept, label: "Overlap" },
                    { id: "shadow-run" as MovementConcept, label: "Shadow" },
                    { id: "rotation" as MovementConcept, label: "Rotation" },
                    { id: "custom" as MovementConcept, label: "Custom" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      style={movementsRouteConcept === opt.id ? MP_CHIP_ACTIVE : MP_CHIP}
                      onClick={() => onMovementsSetConcept(movementsRouteConcept === opt.id ? null : opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div style={MP_ROW}>
                  <span style={MP_ROW_LABEL}>Time</span>
                  {([
                    { ms: 0, label: "Now" },
                    { ms: 1000, label: "+1s" },
                    { ms: 2000, label: "+2s" },
                    { ms: 3000, label: "+3s" },
                    { ms: 4000, label: "+4s" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.ms}
                      type="button"
                      style={
                        movementsRouteTrigger == null &&
                        (movementsRouteDelay === opt.ms || (opt.ms === 0 && movementsRouteDelay == null))
                          ? MP_CHIP_ACTIVE
                          : MP_CHIP
                      }
                      onClick={() => onMovementsSetDelay(opt.ms)}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {movementsOtherPlayers.length > 0 ? (
                    <>
                      <span style={{ ...MP_ROW_LABEL, marginLeft: "3px" }}>After</span>
                      {movementsRouteTrigger != null ? (
                        <button type="button" style={MP_CHIP_SECONDARY} onClick={() => onMovementsSetTrigger(null)}>
                          ×
                        </button>
                      ) : null}
                      {movementsOtherPlayers.map((p) => (
                        <button
                          key={p.playerId}
                          type="button"
                          style={movementsRouteTrigger === p.playerId ? MP_CHIP_ACTIVE : MP_CHIP}
                          onClick={() => onMovementsSetTrigger(p.playerId)}
                        >
                          P{p.number}
                        </button>
                      ))}
                    </>
                  ) : null}
                </div>
              </>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" style={MP_DONE} onClick={() => setMovementsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        ) : null}

        {unitsOpen && !modeIsPlaybackLocked ? (
          <div style={MOVEMENT_PANEL_STYLE}>
            <div style={MP_HEADER_STYLE}>
              <span style={MP_TITLE_STYLE}>Group Move</span>
              <button type="button" style={MP_CLOSE_STYLE} onClick={() => setUnitsOpen(false)}>×</button>
            </div>

            <div style={MP_ROW}>
              <input
                style={{ ...PLAYS_INPUT_STYLE, flex: 1, height: "28px", fontSize: "9px" }}
                type="text"
                placeholder="Unit name…"
                value={unitNameDraft}
                maxLength={30}
                onChange={(e) => setUnitNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onCreateUnit(); }}
              />
              <button
                type="button"
                style={MP_CHIP}
                onClick={onCreateUnit}
              >
                + Unit
              </button>
            </div>

            {units.map((unit) => (
              <div key={unit.id} style={{ display: "grid", gap: "4px" }}>
                <div style={MP_ROW}>
                  <span style={{ flex: 1, fontFamily: "Inter, system-ui, sans-serif", fontSize: "9px", fontWeight: 600, color: "rgba(200, 230, 255, 0.75)", letterSpacing: "0.02em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {unit.name}
                    <span style={{ marginLeft: "4px", opacity: 0.45, fontSize: "8px" }}>({unit.memberIds.length})</span>
                  </span>
                  <button
                    type="button"
                    style={unitEditingId === unit.id ? MP_CHIP_ACTIVE : MP_CHIP}
                    onClick={() => setUnitEditingId(unitEditingId === unit.id ? null : unit.id)}
                  >
                    Members
                  </button>
                  <button
                    type="button"
                    style={unitDrawingId === unit.id ? { ...MP_CHIP_ACTIVE, border: "1px solid rgba(255, 200, 80, 0.60)", background: "rgba(60, 50, 10, 0.90)", color: "#ffe87a" } : MP_CHIP}
                    onClick={() => {
                      if (unitDrawingId === unit.id) {
                        setUnitDrawingId(null);
                      } else {
                        setUnitDrawingId(unit.id);
                        setMenuMode("route");
                        setUnitsOpen(false);
                      }
                    }}
                  >
                    Draw
                  </button>
                  <button
                    type="button"
                    style={{ ...MP_CHIP, color: "rgba(255, 140, 140, 0.75)" }}
                    onClick={() => onDeleteUnit(unit.id)}
                  >
                    ×
                  </button>
                </div>
                {unitEditingId === unit.id ? (
                  <div style={MP_ROW}>
                    <span style={MP_ROW_LABEL}>Members</span>
                    {Object.entries(tokenNumberById).sort((a, b) => a[1] - b[1]).map(([id, num]) => {
                      const isMember = unit.memberIds.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          style={isMember ? MP_PLAYER_CHIP_ACTIVE : MP_PLAYER_CHIP}
                          onClick={() => onToggleUnitMember(unit.id, id)}
                        >
                          P{num}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}

            {units.length === 0 ? (
              <span style={{ fontSize: "9px", color: "rgba(180, 210, 255, 0.35)", fontFamily: "Inter, system-ui, sans-serif", padding: "2px" }}>
                Name a group and press + Unit to create.
              </span>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" style={MP_DONE} onClick={() => setUnitsOpen(false)}>
                Done
              </button>
            </div>
          </div>
        ) : null}

        {passesOpen ? (
          <div style={MOVEMENT_PANEL_STYLE}>
            <div style={MP_HEADER_STYLE}>
              <span style={MP_TITLE_STYLE}>Passes</span>
              <button type="button" style={MP_CLOSE_STYLE} onClick={() => { setPassesOpen(false); setShotOpen(false); }}>
                ×
              </button>
            </div>

            {passEvents.length > 0 || shotEvents.length > 0 ? (
              <div style={MP_ROW}>
                {passEvents.map((p) => {
                  const fromNum = tokenNumberById[p.fromPlayerId] ?? "?";
                  const toNum = tokenNumberById[p.toPlayerId] ?? "?";
                  return (
                    <span key={p.id} style={{ ...MP_CHIP_SECONDARY, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ color: "rgba(255, 220, 100, 0.80)" }}>P{fromNum}→P{toNum}</span>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", color: "rgba(255, 140, 140, 0.70)", fontSize: "11px", cursor: "pointer", padding: "0 2px", lineHeight: "1" }}
                        onClick={() => onRemovePass(p.id)}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
                {shotEvents.map((s) => {
                  const num = tokenNumberById[s.shooterId] ?? "?";
                  const delayLabel = s.delayMs > 0 ? ` +${s.delayMs / 1000}s` : "";
                  return (
                    <span key={s.id} style={{ ...MP_CHIP_SECONDARY, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ color: "rgba(180, 255, 140, 0.80)" }}>P{num}→Goal{delayLabel}</span>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", color: "rgba(255, 140, 140, 0.70)", fontSize: "11px", cursor: "pointer", padding: "0 2px", lineHeight: "1" }}
                        onClick={() => { setShotEvents((prev) => prev.filter((e) => e.id !== s.id)); shellRef.current?.removeShotEvent(s.id); }}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}

            <div style={MP_ROW}>
              <span style={MP_ROW_LABEL}>From</span>
              {Object.entries(tokenNumberById).sort((a, b) => a[1] - b[1]).map(([id, num]) => (
                <button
                  key={id}
                  type="button"
                  style={passFromId === id ? MP_PLAYER_CHIP_ACTIVE : MP_PLAYER_CHIP}
                  onClick={() => setPassFromId(passFromId === id ? null : id)}
                >
                  P{num}
                </button>
              ))}
            </div>

            {passFromId ? (
              <div style={MP_ROW}>
                <span style={MP_ROW_LABEL}>To</span>
                {Object.entries(tokenNumberById).filter(([id]) => id !== passFromId).sort((a, b) => a[1] - b[1]).map(([id, num]) => (
                  <button
                    key={id}
                    type="button"
                    style={passToId === id ? MP_PLAYER_CHIP_ACTIVE : MP_PLAYER_CHIP}
                    onClick={() => setPassToId(passToId === id ? null : id)}
                  >
                    P{num}
                  </button>
                ))}
              </div>
            ) : null}

            {passFromId && passToId ? (
              <div style={MP_ROW}>
                <span style={MP_ROW_LABEL}>Time</span>
                {([
                  { ms: 0, label: "Now" },
                  { ms: 1000, label: "+1s" },
                  { ms: 2000, label: "+2s" },
                  { ms: 3000, label: "+3s" },
                  { ms: 4000, label: "+4s" },
                ] as const).map((opt) => (
                  <button
                    key={opt.ms}
                    type="button"
                    style={passTriggerId == null && passTimingMs === opt.ms ? MP_CHIP_ACTIVE : MP_CHIP}
                    onClick={() => { setPassTimingMs(opt.ms); setPassTriggerId(null); }}
                  >
                    {opt.label}
                  </button>
                ))}
                {routes.length > 0 || passEvents.length > 0 ? (
                  <>
                    <span style={{ ...MP_ROW_LABEL, marginLeft: "3px" }}>After</span>
                    {passTriggerId != null ? (
                      <button type="button" style={MP_CHIP_SECONDARY} onClick={() => setPassTriggerId(null)}>
                        ×
                      </button>
                    ) : null}
                    {routes.map((r) => {
                      const num = tokenNumberById[r.playerId] ?? "?";
                      return (
                        <button
                          key={r.playerId}
                          type="button"
                          style={passTriggerId === r.playerId ? MP_CHIP_ACTIVE : MP_CHIP}
                          onClick={() => setPassTriggerId(passTriggerId === r.playerId ? null : r.playerId)}
                        >
                          P{num}
                        </button>
                      );
                    })}
                  </>
                ) : null}
              </div>
            ) : null}

            {shotOpen ? (() => {
              const lastReceiverId = passEvents.length > 0 ? passEvents[passEvents.length - 1].toPlayerId : null;
              const shooterId = lastReceiverId ?? ballCarrierId;
              if (!shooterId) {
                return (
                  <div style={MP_ROW}>
                    <span style={{ fontSize: "11px", color: "rgba(255, 200, 100, 0.70)", fontStyle: "italic" }}>
                      Give ball to a player or add a pass first.
                    </span>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "rgba(255, 140, 140, 0.70)", fontSize: "14px", cursor: "pointer", padding: "0 2px", lineHeight: "1" }}
                      onClick={() => setShotOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                );
              }
              const shooterNum = tokenNumberById[shooterId] ?? "?";
              return (
                <div style={MP_ROW}>
                  <span style={MP_ROW_LABEL}>Shooter</span>
                  <span style={MP_CHIP_SECONDARY}>P{shooterNum}</span>
                  <span style={{ ...MP_ROW_LABEL, marginLeft: "4px" }}>Delay</span>
                  {([
                    { ms: 0, label: "Now" },
                    { ms: 1000, label: "+1s" },
                    { ms: 2000, label: "+2s" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.ms}
                      type="button"
                      style={shootDelayMs === opt.ms ? MP_CHIP_ACTIVE : MP_CHIP}
                      onClick={() => setShootDelayMs(opt.ms)}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    style={MP_CHIP_ACTIVE}
                    onClick={() => {
                      const delay = shootDelayMs;
                      const sid = shooterId;
                      const entry = { id: `shot-${Date.now()}`, shooterId: sid, delayMs: delay };
                      setShotEvents((prev) => [...prev, entry]);
                      shellRef.current?.addShotEvent(entry);
                      setShotOpen(false);
                    }}
                  >
                    Add Shot
                  </button>
                  <button
                    type="button"
                    style={{ background: "none", border: "none", color: "rgba(255, 140, 140, 0.70)", fontSize: "14px", cursor: "pointer", padding: "0 2px", lineHeight: "1" }}
                    onClick={() => setShotOpen(false)}
                  >
                    ×
                  </button>
                </div>
              );
            })() : null}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={passFromId && passToId ? MP_CHIP_ACTIVE : { ...MP_CHIP, opacity: 0.45, cursor: "not-allowed" }}
                  disabled={!passFromId || !passToId || passFromId === passToId}
                  onClick={onAddPass}
                >
                  + Add Pass
                </button>
                {passEvents.length > 0 || ballCarrierId ? (
                  <button
                    type="button"
                    style={shotOpen ? MP_CHIP_ACTIVE : MP_CHIP}
                    onClick={() => setShotOpen((prev) => !prev)}
                  >
                    + Add Shot
                  </button>
                ) : null}
              </div>
              <button type="button" style={MP_DONE} onClick={() => { setPassesOpen(false); setShotOpen(false); }}>
                Done
              </button>
            </div>
          </div>
        ) : null}

        {setupOpen ? (
          <div style={SETUP_PANEL_STYLE}>
            <div style={PANEL_ROW_STYLE}>
              {SETUP_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  style={activeSetupCategory === cat.id ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                  onClick={() => setActiveSetupCategory((prev) => prev === cat.id ? null : cat.id)}
                >
                  {cat.label}
                </button>
              ))}
              <button
                type="button"
                style={TOOL_BUTTON_STYLE}
                onClick={() => {
                  const demo = TACTICAL_TEMPLATES.find((t) => t.id === "demo");
                  if (demo) onLoadTemplate(demo);
                }}
              >
                Demo
              </button>
              <button
                type="button"
                style={playersOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                onClick={() => setPlayersOpen((prev) => !prev)}
              >
                Players
              </button>
              <button
                type="button"
                style={scenariosOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                onClick={() => setScenariosOpen((prev) => !prev)}
              >
                Scenarios
              </button>
            </div>

            {activeSetupCategory !== null ? (
              <div style={PANEL_ROW_STYLE}>
                {TACTICAL_TEMPLATES.filter((t) => t.category === activeSetupCategory).map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    style={TOOL_BUTTON_STYLE}
                    onClick={() => onLoadTemplate(tmpl)}
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>
            ) : null}


            {scenariosOpen ? (
              <>
                <div style={PANEL_ROW_STYLE}>
                  <span style={SETUP_SECTION_LABEL_STYLE}>Save</span>
                  <input
                    style={SCENARIO_INPUT_STYLE}
                    type="text"
                    placeholder="Scenario name…"
                    value={scenarioNameDraft}
                    maxLength={40}
                    onChange={(e) => setScenarioNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onSaveScenario(); }}
                  />
                  <button type="button" style={TOOL_BUTTON_STYLE} onClick={onSaveScenario}>
                    Save
                  </button>
                </div>
                {scenarios.length > 0 ? (
                  scenarios.map((s) => (
                    <div key={s.id} style={{ display: "grid", gap: "2px" }}>
                      <div style={PANEL_ROW_STYLE}>
                        <span
                          style={{
                            ...SETUP_SECTION_LABEL_STYLE,
                            maxWidth: "130px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "9px",
                            color: "rgba(200, 230, 255, 0.72)",
                            letterSpacing: "0.02em",
                            textTransform: "none",
                          }}
                          title={s.name}
                        >
                          {s.name}
                        </span>
                        <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onLoadScenario(s)}>
                          Load
                        </button>
                        <button
                          type="button"
                          style={scenarioRenameId === s.id ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                          onClick={() => {
                            if (scenarioRenameId === s.id) {
                              setScenarioRenameId(null);
                            } else {
                              setScenarioRenameId(s.id);
                              setScenarioRenameDraft(s.name);
                            }
                          }}
                        >
                          Ren
                        </button>
                        <button
                          type="button"
                          style={TOOL_BUTTON_STYLE}
                          onClick={() => onDuplicateScenario(s.id)}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          style={{ ...TOOL_BUTTON_STYLE, color: "rgba(255, 160, 160, 0.88)" }}
                          onClick={() => onDeleteScenario(s.id)}
                        >
                          Del
                        </button>
                      </div>
                      {scenarioRenameId === s.id ? (
                        <div style={{ ...PANEL_ROW_STYLE, paddingLeft: "4px" }}>
                          <input
                            style={SCENARIO_INPUT_STYLE}
                            type="text"
                            value={scenarioRenameDraft}
                            maxLength={40}
                            autoFocus
                            onChange={(e) => setScenarioRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                onRenameScenario(s.id, scenarioRenameDraft);
                                setScenarioRenameId(null);
                              } else if (e.key === "Escape") {
                                setScenarioRenameId(null);
                              }
                            }}
                          />
                          <button
                            type="button"
                            style={TOOL_BUTTON_STYLE}
                            onClick={() => {
                              onRenameScenario(s.id, scenarioRenameDraft);
                              setScenarioRenameId(null);
                            }}
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            style={TOOL_BUTTON_STYLE}
                            onClick={() => setScenarioRenameId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div style={PANEL_ROW_STYLE}>
                    <span style={SETUP_SECTION_LABEL_STYLE}>No saved scenarios yet</span>
                  </div>
                )}
              </>
            ) : null}

            {playersOpen ? (
              <>
                <div style={PANEL_ROW_STYLE}>
                  {([
                    { id: "pixi", label: "Pixi" },
                    { id: "phosphor", label: "Phosphor" },
                    { id: "jersey", label: "Jersey" },
                  ] as const).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      style={tokenRenderer === r.id ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                      onClick={() => onSetTokenRenderer(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                  {([
                    { id: "small", label: "Small" },
                    { id: "medium", label: "Medium" },
                    { id: "large", label: "Large" },
                  ] as const).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      style={tokenSize === s.id ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                      onClick={() => onSetTokenSize(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div style={PANEL_ROW_STYLE}>
                  <span style={SETUP_SECTION_LABEL_STYLE}>Primary</span>
                  {ALL_TOKEN_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      style={
                        primaryColor === c
                          ? {
                              ...TOOL_BUTTON_STYLE,
                              minWidth: "44px",
                              padding: "0 8px",
                              background: TOKEN_COLOR_BG[c],
                              border: `1px solid ${TOKEN_COLOR_BORDER[c]}`,
                              color: TOKEN_COLOR_IS_LIGHT.has(c) ? "#0f172a" : "#f8fafc",
                            }
                          : { ...TOOL_BUTTON_STYLE, minWidth: "44px", padding: "0 8px" }
                      }
                      onClick={() => onSetPrimaryColor(c)}
                    >
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
                <div style={PANEL_ROW_STYLE}>
                  <span style={SETUP_SECTION_LABEL_STYLE}>2nd</span>
                  {ALL_TOKEN_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      style={
                        secondaryColor === c
                          ? {
                              ...TOOL_BUTTON_STYLE,
                              minWidth: "44px",
                              padding: "0 8px",
                              background: TOKEN_COLOR_BG[c],
                              border: `1px solid ${TOKEN_COLOR_BORDER[c]}`,
                              color: TOKEN_COLOR_IS_LIGHT.has(c) ? "#0f172a" : "#f8fafc",
                            }
                          : { ...TOOL_BUTTON_STYLE, minWidth: "44px", padding: "0 8px" }
                      }
                      onClick={() => onSetSecondaryColor(c)}
                    >
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {playbackFloatingVisible ? (
          <div style={PLAYBACK_SIDE_STYLE}>
            <button
              type="button"
              style={isPlaying ? TOOL_DISABLED_STYLE : PLAYBACK_SIDE_BUTTON_STYLE}
              onClick={onPlayResumePress}
              disabled={isPlaying}
            >
              {isPaused ? "Resume" : "Play/Resume"}
            </button>
            <button
              type="button"
              style={!isPlaying ? TOOL_DISABLED_STYLE : PLAYBACK_SIDE_BUTTON_STYLE}
              onClick={onPausePress}
              disabled={!isPlaying}
            >
              Pause
            </button>
            <button type="button" style={PLAYBACK_SIDE_BUTTON_STYLE} onClick={resetBoard}>
              Reset
            </button>
          </div>
        ) : null}

        {/* PLAYS floating button — right-side, vertically centered */}
        {!playbackFloatingVisible ? (
          <button
            type="button"
            style={playsOpen
              ? { ...playsButtonStyle, border: "1px solid rgba(124, 255, 114, 0.40)", background: "rgba(14, 32, 22, 0.86)" }
              : playsButtonStyle}
            onClick={() => {
              setScenarios(listScenarios());
              setPlaysOpen((prev) => !prev);
              setIsControlsOpen(false);
              setSetupOpen(false);
              setMovementsOpen(false);
              setPassesOpen(false);
            }}
          >
            Plays
          </button>
        ) : null}

        {playsOpen && !playbackFloatingVisible ? (
          <div style={playsPanelStyle}>
            <div style={MP_HEADER_STYLE}>
              <span style={MP_TITLE_STYLE}>Saved Plays</span>
              <button type="button" style={MP_CLOSE_STYLE} onClick={() => { setPlaysOpen(false); setScenarioRenameId(null); }}>
                ×
              </button>
            </div>

            {/* Save current play */}
            <div style={PLAYS_ROW_STYLE}>
              <input
                style={PLAYS_INPUT_STYLE}
                type="text"
                placeholder="Name this play…"
                value={playsNameDraft}
                maxLength={40}
                onChange={(e) => setPlaysNameDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onSavePlays(); }}
              />
              <button type="button" style={{ ...PLAYS_ACTION_BTN, border: "1px solid rgba(124, 255, 114, 0.34)", color: "#c4ffbf" }} onClick={onSavePlays}>
                Save
              </button>
            </div>

            {scenarios.length > 0 ? (
              <>
                <div style={{ height: "1px", background: "rgba(180, 210, 255, 0.08)", margin: "2px 0" }} />
                <span style={{ ...MP_TITLE_STYLE, paddingLeft: "2px" }}>Load a play</span>
                {scenarios.map((s) => (
                  <div key={s.id} style={{ display: "grid", gap: "3px" }}>
                    <div style={PLAYS_ROW_STYLE}>
                      <span style={PLAYS_SCENARIO_NAME_STYLE} title={s.name}>{s.name}</span>
                      <button
                        type="button"
                        style={{ ...PLAYS_ACTION_BTN, border: "1px solid rgba(100, 200, 255, 0.30)", color: "rgba(160, 220, 255, 0.90)" }}
                        onClick={() => onLoadScenario(s)}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        style={scenarioRenameId === s.id ? { ...PLAYS_ACTION_BTN, border: "1px solid rgba(124, 255, 114, 0.40)", color: "#c4ffbf" } : PLAYS_ACTION_BTN}
                        onClick={() => {
                          if (scenarioRenameId === s.id) {
                            setScenarioRenameId(null);
                          } else {
                            setScenarioRenameId(s.id);
                            setScenarioRenameDraft(s.name);
                          }
                        }}
                      >
                        Ren
                      </button>
                      <button
                        type="button"
                        style={PLAYS_ACTION_BTN}
                        onClick={() => onDuplicateScenario(s.id)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        style={{ ...PLAYS_ACTION_BTN, color: "rgba(255, 160, 160, 0.88)" }}
                        onClick={() => onDeleteScenario(s.id)}
                      >
                        Del
                      </button>
                    </div>
                    {scenarioRenameId === s.id ? (
                      <div style={PLAYS_ROW_STYLE}>
                        <input
                          style={PLAYS_INPUT_STYLE}
                          type="text"
                          value={scenarioRenameDraft}
                          maxLength={40}
                          autoFocus
                          onChange={(e) => setScenarioRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { onRenameScenario(s.id, scenarioRenameDraft); setScenarioRenameId(null); }
                            else if (e.key === "Escape") { setScenarioRenameId(null); }
                          }}
                        />
                        <button
                          type="button"
                          style={{ ...PLAYS_ACTION_BTN, border: "1px solid rgba(124, 255, 114, 0.34)", color: "#c4ffbf" }}
                          onClick={() => { onRenameScenario(s.id, scenarioRenameDraft); setScenarioRenameId(null); }}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          style={PLAYS_ACTION_BTN}
                          onClick={() => setScenarioRenameId(null)}
                        >
                          ✕
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </>
            ) : (
              <span style={{ fontSize: "10px", color: "rgba(180, 210, 255, 0.38)", fontFamily: "Inter, system-ui, sans-serif", padding: "4px 2px" }}>
                No saved plays yet. Build a play and tap Save.
              </span>
            )}

            {/* ── Record & Share ── */}
            <div style={{ height: "1px", background: "rgba(180, 210, 255, 0.08)", margin: "4px 0 2px" }} />

            {(recordPhase === "idle" || recordPhase === "done") ? (
              <button
                type="button"
                style={{ ...PLAYS_ACTION_BTN, border: "1px solid rgba(255, 80, 80, 0.38)", color: "rgba(255, 190, 190, 0.95)", width: "100%", justifyContent: "center", height: "30px" }}
                onClick={() => {
                  if (!canRecord()) {
                    alert("Recording is not supported in this browser.\n\niPhone: use Screen Recording from Control Centre.\nAndroid: use Chrome for full recording support.");
                    return;
                  }
                  setRecordPhase("panel");
                }}
              >
                Record Clip
              </button>
            ) : null}

            {recordPhase === "panel" ? (
              <div style={{ display: "grid", gap: "4px" }}>
                <span style={SETUP_SECTION_LABEL_STYLE}>Duration</span>
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {([10, 20, 30] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      style={recordDuration === d
                        ? { ...PLAYS_ACTION_BTN, border: "1px solid rgba(124, 255, 114, 0.56)", color: "#f4fff6", background: "rgba(34, 112, 66, 0.82)" }
                        : PLAYS_ACTION_BTN}
                      onClick={() => setRecordDuration(d)}
                    >
                      {d}s
                    </button>
                  ))}
                  <button
                    type="button"
                    style={{ ...PLAYS_ACTION_BTN, border: "1px solid rgba(255, 80, 80, 0.50)", color: "rgba(255, 190, 190, 0.95)", flex: 1 }}
                    onClick={startCountdown}
                  >
                    Start Recording
                  </button>
                  <button
                    type="button"
                    style={{ ...PLAYS_ACTION_BTN, color: "rgba(180, 210, 255, 0.55)" }}
                    onClick={dismissRecord}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : null}

            {recordBlob ? (
              <button
                type="button"
                style={{ ...PLAYS_ACTION_BTN, border: "1px solid rgba(80, 160, 255, 0.40)", color: "rgba(170, 210, 255, 0.95)", width: "100%", justifyContent: "center", height: "30px" }}
                onClick={() => { void shareClip(); }}
              >
                Share Last Clip
              </button>
            ) : null}

            {/* ── Templates placeholder ── */}
            <div style={{ height: "1px", background: "rgba(180, 210, 255, 0.08)", margin: "2px 0 4px" }} />
            <span style={{ fontSize: "9px", color: "rgba(180, 210, 255, 0.28)", fontFamily: "Inter, system-ui, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0 2px" }}>
              Templates — Coming Soon
            </span>
          </div>
        ) : null}
      </div>
    </OrientationGate>
  );
}
