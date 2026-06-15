import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

import {
  createTacticalPadLiteSurface,
  type ItemMode,
  type TacticalLabelMode,
  type TacticalKitPattern,
  type TacticalPlayerTokenStyle,
  type TacticalPlayerKitPatch,
  type TacticalPlayerKitSnapshot,
  type TacticalPadLiteSurface,
  type TacticalRouteState,
  type TacticalItem,
  type WhiteboardTokenColor,
  sanitizeInitials,
} from "../engine/pixi/createTacticalPadLiteSurface";
import StatsModeSurface from "../StatsModeSurface";
import OrientationGate, { usePortraitOrientation } from "../components/OrientationGate";
import { useCanvasRecorder } from "../features/shared/useCanvasRecorder";
import { captureQuickBoardSnapshot, restoreQuickBoardSnapshot } from "../features/quickboard/storage/quickboard-snapshot";
import { generateQuickBoardThumbnail } from "../features/quickboard/storage/quickboard-thumbnail";
import {
  clearQuickBoardDraft,
  deleteBoard,
  duplicateBoard,
  formatBoardUpdatedAt,
  hasReachedQuickBoardSaveLimit,
  loadAllBoards,
  loadBoard,
  loadQuickBoardDraft,
  renameBoard,
  saveBoard,
  saveQuickBoardDraft,
  setBoardThumbnail,
} from "../features/quickboard/storage/quickboard-storage";
import {
  MAX_QUICKBOARD_SAVES,
  sanitizeBoardName,
  type QuickBoardBoardState,
  type SavedQuickBoard,
} from "../features/quickboard/storage/quickboard-types";
import { useOverlayPortalRoot } from "../overlay/OverlayPortalContext";
import { useScreenWakeLock } from "../hooks/useScreenWakeLock";
import VisionStadiumBackground from "../components/VisionStadiumBackground";
import { exportBoardSetupAsPng } from "../features/quickboard/export/board-png-export";
import SlateTextOverlay from "../features/quickboard/annotations/SlateTextOverlay";
import { type SlateTextAnnotation } from "../features/quickboard/annotations/slateTextAnnotation";

type PadMode = "tactical" | "stats" | "whiteboard";
type TacticalPadLiteCleanProps = {
  initialMode?: PadMode;
};

const CAN_USE_CSS_SUPPORTS = typeof window !== "undefined" && typeof window.CSS !== "undefined";
const VIEWPORT_WIDTH_UNIT = CAN_USE_CSS_SUPPORTS && window.CSS.supports("width: 100dvw") ? "100dvw" : "100vw";
const BOARD_VIEWPORT_HEIGHT_CSS_VAR = "--board-app-height";
const VIEWPORT_HEIGHT_EXPR = `var(${BOARD_VIEWPORT_HEIGHT_CSS_VAR}, 100dvh)`;

const CONTENT_WIDTH_EXPR =
  `min(calc(${VIEWPORT_WIDTH_UNIT} - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)), calc((${VIEWPORT_HEIGHT_EXPR} - 10px) * 1.6), 1360px)`;
const WHITEBOARD_PLAYER_COLOR_CHOICES: ReadonlyArray<{
  value: WhiteboardTokenColor;
  css: string;
}> = [
  { value: "blue", css: "#2563eb" },
  { value: "red", css: "#dc2626" },
  { value: "yellow", css: "#facc15" },
  { value: "black", css: "#1f2937" },
];
const WHITEBOARD_PEN_COLOR_CHOICES: ReadonlyArray<{ label: string; value: number; css: string }> = [
  { label: "Black", value: 0x111111, css: "#111111" },
  { label: "White", value: 0xffffff, css: "#ffffff" },
  { label: "Yellow", value: 0xfacc15, css: "#facc15" },
  { label: "Red", value: 0xdc2626, css: "#dc2626" },
  { label: "Blue", value: 0x2563eb, css: "#2563eb" },
];
const WHITEBOARD_DRAW_COLOR = WHITEBOARD_PEN_COLOR_CHOICES[0]?.value ?? 0x111111;
const PLAYBACK_SPEED_OPTIONS: ReadonlyArray<{ multiplier: number; label: string }> = [
  { multiplier: 0.25, label: "0.25x" },
  { multiplier: 0.5, label: "0.5x" },
  { multiplier: 0.75, label: "0.75x" },
  { multiplier: 1.0, label: "1.0x" },
  { multiplier: 1.25, label: "1.25x" },
  { multiplier: 1.5, label: "1.5x" },
];
const DEFAULT_PLAYBACK_SPEED_MULTIPLIER = 1.0;
const TACTICAL_ITEM_CHOICES: ReadonlyArray<{ label: string; type: TacticalItem["type"] }> = [
  { label: "Cone", type: "cone" },
  { label: "Disc Cone", type: "discCone" },
  { label: "Pole", type: "pole" },
  { label: "Mini Goal", type: "miniGoal" },
  { label: "Mannequin", type: "mannequin" },
  { label: "Ladder", type: "ladder" },
  { label: "Hurdle", type: "hurdle" },
  { label: "Tackle Bag", type: "tackleBag" },
  { label: "Football (S)", type: "footballSmall" },
  { label: "Football (M)", type: "football" },
  { label: "Football (L)", type: "footballLarge" },
  { label: "Sliotar (S)", type: "sliotarSmall" },
  { label: "Sliotar (M)", type: "sliotar" },
  { label: "Sliotar (L)", type: "sliotarLarge" },
];

function isBallItemType(type: TacticalItem["type"]): boolean {
  return (
    type === "footballSmall" ||
    type === "football" ||
    type === "footballLarge" ||
    type === "sliotarSmall" ||
    type === "sliotar" ||
    type === "sliotarLarge"
  );
}
const ORIENTATION_SETTLE_DEBOUNCE_MS = 140;
type WhiteboardToolControl =
  | "move"
  | "line"
  | "arrow"
  | "curved"
  | "dashed"
  | "wavy"
  | "freePen"
  | "rectangleZone"
  | "circleZone"
  | "eraser";
type WhiteboardToolAction = WhiteboardToolControl;
type MovementModePillOption = "move" | "route" | "ball";
const WHITEBOARD_BUBBLE_SIZE = 36;
const WHITEBOARD_BUBBLE_MARGIN = 12;
const KIT_EDITOR_MARGIN = 10;
const KIT_EDITOR_MAX_WIDTH = 260;
const KIT_EDITOR_MAX_HEIGHT_RATIO = 0.56;
const KIT_COLOR_CHOICES = [
  "navy",
  "blue",
  "sky",
  "cyan",
  "green",
  "lime",
  "yellow",
  "orange",
  "red",
  "maroon",
  "purple",
  "pink",
  "white",
  "grey",
  "black",
] as const;
const KIT_COLOR_CSS: Record<(typeof KIT_COLOR_CHOICES)[number], string> = {
  navy: "#1e3a8a",
  blue: "#2563eb",
  sky: "#0ea5e9",
  cyan: "#06b6d4",
  green: "#16a34a",
  lime: "#84cc16",
  orange: "#f97316",
  red: "#dc2626",
  maroon: "#7f1d1d",
  purple: "#7c3aed",
  pink: "#ec4899",
  yellow: "#facc15",
  white: "#ffffff",
  grey: "#6b7280",
  black: "#111827",
};
const KIT_PATTERN_CHOICES: TacticalKitPattern[] = ["plain", "hoops", "stripes", "slash"];
const KIT_PATTERN_LABEL: Record<TacticalKitPattern, string> = {
  plain: "Plain",
  hoops: "Hoops",
  stripes: "Stripes",
  slash: "Slash",
};
const LABEL_MODE_CHOICES: TacticalLabelMode[] = ["number", "initials"];
const TOKEN_STYLE_CHOICES: ReadonlyArray<{ value: TacticalPlayerTokenStyle; label: string }> = [
  { value: "vision-v3", label: "Vision V3" },
  { value: "classic", label: "Classic" },
  { value: "premium", label: "Glow" },
  { value: "pixi", label: "Pixi" },
  { value: "phosphor", label: "Phosphor" },
];
type KitEditorTab = "base" | "pattern" | "label";
const KIT_EDITOR_TABS: ReadonlyArray<{ id: KitEditorTab; label: string }> = [
  { id: "base", label: "Base" },
  { id: "pattern", label: "Pattern" },
  { id: "label", label: "Label" },
];

type KitEditorState = {
  playerId: string;
  anchorLeft: number;
  anchorTop: number;
  revision: number;
};

type ViewportRect = { left: number; top: number; width: number; height: number };
const COMPACT_LANDSCAPE_TOOLS_MAX_WIDTH = 900;

function getViewportRect(): ViewportRect {
  const viewport = window.visualViewport;
  if (!viewport) {
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
  return {
    left: viewport.offsetLeft,
    top: viewport.offsetTop,
    width: viewport.width,
    height: viewport.height,
  };
}

function getMobileViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  const viewport = window.visualViewport;
  const visualViewportHeight =
    viewport && Number.isFinite(viewport.height) ? Math.round(viewport.height) : 0;
  const innerHeight =
    Number.isFinite(window.innerHeight) ? Math.round(window.innerHeight) : 0;
  return Math.max(0, visualViewportHeight || innerHeight);
}

function clampWhiteboardBubblePosition(
  position: { left: number; top: number },
  viewport: ViewportRect,
): { left: number; top: number } {
  const minLeft = viewport.left + WHITEBOARD_BUBBLE_MARGIN;
  const maxLeft = viewport.left + viewport.width - WHITEBOARD_BUBBLE_MARGIN - WHITEBOARD_BUBBLE_SIZE;
  const minTop = viewport.top + WHITEBOARD_BUBBLE_MARGIN;
  const maxTop = viewport.top + viewport.height - WHITEBOARD_BUBBLE_MARGIN - WHITEBOARD_BUBBLE_SIZE;
  return {
    left: Math.min(Math.max(position.left, minLeft), Math.max(minLeft, maxLeft)),
    top: Math.min(Math.max(position.top, minTop), Math.max(minTop, maxTop)),
  };
}

function getDefaultWhiteboardBubblePosition(viewport: ViewportRect): { left: number; top: number } {
  return clampWhiteboardBubblePosition(
    {
      left: viewport.left + 14,
      top: viewport.top + 14,
    },
    viewport,
  );
}

function clampKitEditorPosition(anchor: { left: number; top: number }, viewport: ViewportRect): { left: number; top: number } {
  const editorWidth = Math.min(KIT_EDITOR_MAX_WIDTH, Math.max(0, viewport.width - KIT_EDITOR_MARGIN * 2));
  const editorHeight = Math.max(0, viewport.height * KIT_EDITOR_MAX_HEIGHT_RATIO);
  const minLeft = viewport.left + KIT_EDITOR_MARGIN;
  const maxLeft = viewport.left + viewport.width - KIT_EDITOR_MARGIN - editorWidth;
  const minTop = viewport.top + KIT_EDITOR_MARGIN;
  const maxTop = viewport.top + viewport.height - KIT_EDITOR_MARGIN - editorHeight;
  return {
    left: Math.min(Math.max(anchor.left, minLeft), Math.max(minLeft, maxLeft)),
    top: Math.min(Math.max(anchor.top, minTop), Math.max(minTop, maxTop)),
  };
}

function shouldUseCompactLandscapeToolsMenu(viewport: ViewportRect): boolean {
  return viewport.width > viewport.height && viewport.width <= COMPACT_LANDSCAPE_TOOLS_MAX_WIDTH;
}

function isIphoneDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? "";
  return /iphone/i.test(ua) || /iphone/i.test(platform) || /iphone/i.test(uaPlatform);
}

function shouldUseIphoneLandscapeToolsOverride(viewport: ViewportRect): boolean {
  return isIphoneDevice() && viewport.width > viewport.height;
}

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: VIEWPORT_HEIGHT_EXPR,
  minHeight: VIEWPORT_HEIGHT_EXPR,
  background: "#050c14",
  margin: 0,
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

const ROOT_WHITEBOARD_STYLE: CSSProperties = {
  ...ROOT_STYLE,
  background:
    "linear-gradient(165deg, rgba(245, 248, 251, 1) 0%, rgba(236, 241, 246, 1) 52%, rgba(228, 235, 242, 1) 100%)",
  paddingTop: "max(8px, calc(env(safe-area-inset-top, 0px) + 6px))",
  paddingBottom: "max(8px, calc(env(safe-area-inset-bottom, 0px) + 6px))",
  paddingLeft: "max(12px, calc(env(safe-area-inset-left, 0px) + 8px))",
  paddingRight: "max(12px, calc(env(safe-area-inset-right, 0px) + 8px))",
};

const STADIUM_FLOODLIGHT_CSS = `
.floating-bubble {
  transition: transform 140ms ease, filter 140ms ease;
}

.floating-bubble:hover,
.floating-bubble:active {
  transform: scale(1.04);
  filter: brightness(1.1);
}

.floating-bubble-tool {
  background: transparent;
  border: none;
  box-shadow: none;
  color: rgba(255, 255, 255, 0.96);
}

.floating-bubble-tool:hover,
.floating-bubble-tool:active {
  transform: scale(0.96);
  filter: brightness(1.15);
}

.tool-bubble-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.tool-bubble-logo {
  width: 30px;
  height: 30px;
  object-fit: contain;
  display: block;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 4px 10px rgba(2, 8, 15, 0.26));
}

.tool-bubble-label {
  font-size: 9px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.78);
  letter-spacing: 0.5px;
  line-height: 1;
  text-transform: uppercase;
}

.control-button {
  transition: transform 140ms ease, filter 140ms ease;
}

.control-button:hover,
.control-button:active {
  transform: scale(1.04);
  filter: brightness(1.1);
}

.control-button:disabled {
  cursor: not-allowed;
  filter: none;
}

.control-button:disabled:hover,
.control-button:disabled:active {
  transform: none;
  filter: none;
}

.speed-control-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 12px;
  margin: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.speed-control-range:focus {
  outline: none;
}

.speed-control-range::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 999px;
  border: 1px solid rgba(225, 232, 228, 0.42);
  background: var(
    --speed-track,
    linear-gradient(90deg, rgba(34, 197, 94, 0.95) 0%, rgba(34, 197, 94, 0.95) 50%, rgba(255, 255, 255, 0.9) 50%, rgba(255, 255, 255, 0.9) 100%)
  );
}

.speed-control-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(14, 20, 19, 0.8);
  background: #f8fbfa;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 2px 5px rgba(0, 0, 0, 0.34);
  margin-top: -4px;
}

.speed-control-range::-moz-range-track {
  height: 5px;
  border-radius: 999px;
  border: 1px solid rgba(225, 232, 228, 0.42);
  background: rgba(255, 255, 255, 0.9);
}

.speed-control-range::-moz-range-progress {
  height: 5px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.95);
}

.speed-control-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(14, 20, 19, 0.8);
  background: #f8fbfa;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 2px 5px rgba(0, 0, 0, 0.34);
}

`;

const CONTENT_STYLE: CSSProperties = {
  width: CONTENT_WIDTH_EXPR,
  maxWidth: "calc(100vw - 24px)",
  aspectRatio: "16 / 10",
  maxHeight: `calc(${VIEWPORT_HEIGHT_EXPR} - 10px)`,
  boxSizing: "border-box",
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "stretch",
};

const WHITEBOARD_CONTENT_STYLE: CSSProperties = {
  width: "100%",
  maxWidth: `min(900px, calc((${VIEWPORT_HEIGHT_EXPR} - 16px) * 1.6))`,
  aspectRatio: "16 / 10",
  maxHeight: `calc(${VIEWPORT_HEIGHT_EXPR} - 16px)`,
  boxSizing: "border-box",
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "stretch",
  margin: "0 auto",
};

const PITCH_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 50px 110px rgba(0, 0, 0, 0.55), 0 18px 45px rgba(0, 0, 0, 0.35)",
  background: "#13221d",
};

const PITCH_WHITEBOARD_STYLE: CSSProperties = {
  ...PITCH_STYLE,
  background: "#f8f9fb",
  boxShadow: "0 40px 90px rgba(34, 42, 51, 0.22), 0 14px 30px rgba(45, 56, 68, 0.17)",
};

const PORTRAIT_INTERACTION_SHIELD_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
  borderRadius: "12px",
  background: "rgba(6, 14, 20, 0.03)",
  pointerEvents: "auto",
  touchAction: "pan-x pan-y pinch-zoom",
};

const BUBBLE_BASE_STYLE: CSSProperties = {
  position: "fixed",
  width: "40px",
  height: "40px",
  borderRadius: "999px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(255, 255, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.3px",
  border: "1px solid rgba(255, 255, 255, 0.24)",
  background: "rgba(20, 25, 30, 0.65)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow:
    "0 8px 20px rgba(0, 0, 0, 0.42), 0 0 12px rgba(255, 255, 255, 0.1), inset 0 1px 2px rgba(255, 255, 255, 0.22)",
  cursor: "pointer",
  zIndex: 20,
};

const LEFT_BUBBLE_STYLE: CSSProperties = {
  ...BUBBLE_BASE_STYLE,
  left: "max(12px, calc(env(safe-area-inset-left, 0px) + 10px))",
  bottom: "max(12px, calc(env(safe-area-inset-bottom, 0px) + 10px))",
};

const ACTIONS_BUBBLE_STYLE: CSSProperties = {
  ...BUBBLE_BASE_STYLE,
  left: "max(12px, calc(env(safe-area-inset-left, 0px) + 10px))",
  top: "50%",
  transform: "translateY(-50%)",
  background: "rgba(32, 40, 50, 0.74)",
  border: "1px solid rgba(233, 242, 255, 0.3)",
  boxShadow: "0 8px 18px rgba(0, 0, 0, 0.38), inset 0 1px 2px rgba(255, 255, 255, 0.2)",
  zIndex: 21,
};

const PORTRAIT_ACTIONS_BUBBLE_STYLE: CSSProperties = {
  ...ACTIONS_BUBBLE_STYLE,
  left: "auto",
  right: "max(12px, calc(env(safe-area-inset-right, 0px) + 10px))",
  top: "auto",
  bottom: "max(12px, calc(env(safe-area-inset-bottom, 0px) + 10px))",
  transform: "none",
};

const RIGHT_BUBBLE_STYLE: CSSProperties = {
  ...BUBBLE_BASE_STYLE,
  right: "max(12px, calc(env(safe-area-inset-right, 0px) + 10px))",
  bottom: "max(12px, calc(env(safe-area-inset-bottom, 0px) + 10px))",
};

const TOOL_BUBBLE_STYLE: CSSProperties = {
  ...RIGHT_BUBBLE_STYLE,
  width: "52px",
  height: "64px",
  borderRadius: "16px",
  background: "transparent",
  border: "none",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  boxShadow: "0 4px 11px rgba(2, 8, 15, 0.24)",
};

const MOBILE_TOOLS_BUBBLE_STYLE: CSSProperties = {
  ...RIGHT_BUBBLE_STYLE,
  width: "52px",
  height: "64px",
  borderRadius: "16px",
  border: "none",
  background: "transparent",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  boxShadow: "0 4px 11px rgba(2, 8, 15, 0.24)",
};

const POPOUT_BASE_STYLE: CSSProperties = {
  position: "fixed",
  display: "flex",
  flexDirection: "row",
  gap: "6px",
  padding: "6px",
  borderRadius: "14px",
  background: "rgba(10, 20, 25, 0.62)",
  border: "1px solid rgba(215, 228, 224, 0.18)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.2)",
  zIndex: 19,
};

const KIT_EDITOR_STYLE: CSSProperties = {
  position: "fixed",
  width: `min(${KIT_EDITOR_MAX_WIDTH}px, calc(100vw - 20px))`,
  maxWidth: `${KIT_EDITOR_MAX_WIDTH}px`,
  maxHeight: "56vh",
  overflowY: "auto",
  overscrollBehavior: "contain",
  display: "grid",
  gap: "6px",
  padding: "6px",
  borderRadius: "12px",
  border: "1px solid rgba(191, 214, 235, 0.24)",
  background: "rgba(10, 20, 25, 0.9)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 10px 22px rgba(2, 8, 15, 0.4)",
  zIndex: 30,
};

const KIT_EDITOR_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "6px",
  position: "sticky",
  top: 0,
  zIndex: 1,
  background: "rgba(10, 20, 25, 0.96)",
  paddingBottom: "2px",
};

const KIT_EDITOR_TAB_ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "4px",
  flex: 1,
};

const KIT_EDITOR_CLOSE_STYLE: CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "999px",
  border: "1px solid rgba(198, 218, 236, 0.3)",
  background: "rgba(15, 28, 40, 0.8)",
  color: "#e8f2fd",
  cursor: "pointer",
  fontSize: "13px",
  lineHeight: 1,
  padding: 0,
};

const KIT_EDITOR_TAB_BUTTON_STYLE: CSSProperties = {
  height: "24px",
  borderRadius: "999px",
  border: "1px solid rgba(148, 163, 184, 0.34)",
  background: "rgba(15, 23, 42, 0.72)",
  color: "#dbe7f5",
  fontSize: "10px",
  fontWeight: 650,
  cursor: "pointer",
  minWidth: 0,
  fontFamily: "Inter, system-ui, sans-serif",
};

const KIT_EDITOR_TAB_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...KIT_EDITOR_TAB_BUTTON_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.8)",
  boxShadow: "0 0 0 1px rgba(125, 211, 252, 0.35) inset",
  background: "rgba(38, 72, 102, 0.78)",
  color: "#f8fcff",
};

const KIT_EDITOR_SECTION_STYLE: CSSProperties = {
  display: "grid",
  gap: "6px",
};

const KIT_EDITOR_COLOR_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "4px",
  justifyItems: "center",
};

const KIT_EDITOR_COLOR_BUTTON_STYLE: CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "999px",
  border: "1px solid rgba(150, 170, 190, 0.52)",
  background: "transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const KIT_EDITOR_MODE_ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "4px",
};

const KIT_EDITOR_OPTION_BUTTON_STYLE: CSSProperties = {
  height: "26px",
  borderRadius: "8px",
  border: "1px solid rgba(148, 163, 184, 0.36)",
  background: "rgba(15, 23, 42, 0.82)",
  color: "#dbe7f5",
  fontSize: "9.5px",
  fontWeight: 650,
  letterSpacing: "0.2px",
  cursor: "pointer",
  fontFamily: "Inter, system-ui, sans-serif",
  minWidth: 0,
};

const KIT_EDITOR_OPTION_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...KIT_EDITOR_OPTION_BUTTON_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.66)",
  background: "rgba(38, 72, 102, 0.72)",
  color: "#f8fcff",
  minWidth: 0,
};

const KIT_EDITOR_INPUT_STYLE: CSSProperties = {
  height: "26px",
  borderRadius: "8px",
  border: "1px solid rgba(148, 163, 184, 0.38)",
  background: "rgba(15, 23, 42, 0.86)",
  color: "#e2e8f0",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.2px",
  fontFamily: "Inter, system-ui, sans-serif",
  padding: "0 8px",
  textTransform: "uppercase",
};

const CONTROLS_POPOUT_STYLE: CSSProperties = {
  ...POPOUT_BASE_STYLE,
  left: "50%",
  transform: "translateX(-50%)",
  bottom: "max(12px, calc(env(safe-area-inset-bottom, 0px) + 10px))",
  width: "fit-content",
  maxWidth: "calc(100vw - 128px)",
  overflowX: "auto",
  overflowY: "hidden",
  whiteSpace: "nowrap",
  flexWrap: "nowrap",
  background: "rgba(20, 16, 17, 0.58)",
  border: "1px solid rgba(238, 146, 146, 0.16)",
};

const ACTIONS_POPOUT_STYLE: CSSProperties = {
  ...POPOUT_BASE_STYLE,
  left: "max(58px, calc(env(safe-area-inset-left, 0px) + 56px))",
  top: "50%",
  transform: "translateY(-50%)",
  flexDirection: "column",
  width: "128px",
  padding: "7px",
  gap: "5px",
  overflow: "hidden",
  background: "rgba(22, 30, 38, 0.78)",
  border: "1px solid rgba(218, 232, 246, 0.24)",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.36)",
  zIndex: 21,
};

const PORTRAIT_POPOUT_BASE_STYLE: CSSProperties = {
  left: "16px",
  right: "16px",
  top: "auto",
  bottom: "max(64px, calc(env(safe-area-inset-bottom, 0px) + 62px))",
  transform: "none",
  width: "calc(100vw - 32px)",
  maxWidth: "calc(100vw - 32px)",
  boxSizing: "border-box",
  overflowX: "hidden",
};

const PORTRAIT_ACTIONS_POPOUT_STYLE: CSSProperties = {
  ...ACTIONS_POPOUT_STYLE,
  ...PORTRAIT_POPOUT_BASE_STYLE,
  width: "calc(100vw - 32px)",
  maxWidth: "calc(100vw - 32px)",
};

const ACTIONS_MENU_BUTTON_STYLE: CSSProperties = {
  borderRadius: "8px",
  border: "1px solid rgba(224, 236, 248, 0.28)",
  color: "rgba(255, 255, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontWeight: 620,
  width: "100%",
  height: "30px",
  minWidth: 0,
  fontSize: "10px",
  letterSpacing: "0.2px",
  padding: "0 9px",
  cursor: "pointer",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  textAlign: "left",
  background: "rgba(15, 24, 31, 0.82)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.12)",
};

const TOKEN_STYLE_MENU_SECTION_STYLE: CSSProperties = {
  borderRadius: "8px",
  border: "1px solid rgba(224, 236, 248, 0.22)",
  background: "rgba(12, 21, 27, 0.76)",
  padding: "5px",
  display: "grid",
  gap: "4px",
};

const TOKEN_STYLE_MENU_LABEL_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(220, 233, 246, 0.9)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 650,
  letterSpacing: "0.18px",
  textTransform: "uppercase",
};

const TOKEN_STYLE_MENU_ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "3px",
};

const TOKEN_STYLE_MENU_BUTTON_STYLE: CSSProperties = {
  borderRadius: "7px",
  border: "1px solid rgba(170, 196, 220, 0.3)",
  background: "rgba(15, 24, 31, 0.82)",
  color: "rgba(232, 241, 249, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 620,
  letterSpacing: "0.14px",
  height: "25px",
  cursor: "pointer",
  padding: "0 3px",
};

const TOKEN_STYLE_MENU_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...TOKEN_STYLE_MENU_BUTTON_STYLE,
  border: "1px solid rgba(124, 255, 114, 0.5)",
  background: "rgba(124, 255, 114, 0.12)",
  color: "#f3fff1",
};

function formatRecordTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Activated when the page loads with ?diag in the URL.
// Entry points: /vision-board?diag  or  /vision-tactics/slate?diag
// Must be in the URL at initial page load (hard refresh) — cannot be added dynamically.
const IS_DIAG_PREVIEW =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("diag");
const DIAG_RS: Record<number, string> = {
  0: "HAVE_NOTHING", 1: "HAVE_METADATA", 2: "HAVE_CURRENT_DATA",
  3: "HAVE_FUTURE_DATA", 4: "HAVE_ENOUGH_DATA",
};
const DIAG_NS: Record<number, string> = {
  0: "EMPTY", 1: "IDLE", 2: "LOADING", 3: "LOADED_META", 4: "LOADED_DATA",
};

const QUICK_SHARE_POPOUT_STYLE: CSSProperties = {
  ...POPOUT_BASE_STYLE,
  left: "max(194px, calc(env(safe-area-inset-left, 0px) + 192px))",
  top: "50%",
  transform: "translateY(-50%)",
  flexDirection: "column",
  width: "188px",
  padding: "9px",
  gap: "7px",
  overflow: "hidden",
  background: "rgba(20, 28, 36, 0.82)",
  border: "1px solid rgba(212, 228, 244, 0.24)",
  boxShadow: "0 12px 26px rgba(0, 0, 0, 0.34)",
  zIndex: 22,
};

const PORTRAIT_QUICK_SHARE_POPOUT_STYLE: CSSProperties = {
  ...QUICK_SHARE_POPOUT_STYLE,
  ...PORTRAIT_POPOUT_BASE_STYLE,
  width: "calc(100vw - 32px)",
  maxWidth: "calc(100vw - 32px)",
  maxHeight: "min(58vh, 360px)",
  overflowY: "auto",
};

const QUICK_SHARE_TITLE_STYLE: CSSProperties = {
  margin: 0,
  color: "#eef7ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11.5px",
  fontWeight: 700,
  letterSpacing: "0.14px",
};

const QUICK_SHARE_OPTION_BUTTON_STYLE: CSSProperties = {
  ...ACTIONS_MENU_BUTTON_STYLE,
  height: "40px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: "2px",
  padding: "6px 9px",
  lineHeight: 1.1,
};

const QUICK_SHARE_OPTION_TITLE_STYLE: CSSProperties = {
  color: "#eef6ff",
  fontSize: "10px",
  fontWeight: 650,
  letterSpacing: "0.16px",
};

const QUICK_SHARE_OPTION_SUBTITLE_STYLE: CSSProperties = {
  color: "rgba(206, 222, 238, 0.9)",
  fontSize: "9px",
  fontWeight: 520,
  letterSpacing: "0.12px",
  lineHeight: 1.25,
};

const QUICK_SHARE_ONBOARDING_OVERLAY_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "max(16px, calc(env(safe-area-inset-top, 0px) + 10px)) max(16px, calc(env(safe-area-inset-right, 0px) + 8px)) max(16px, calc(env(safe-area-inset-bottom, 0px) + 10px)) max(16px, calc(env(safe-area-inset-left, 0px) + 8px))",
  background: "rgba(5, 11, 17, 0.36)",
  transition: "opacity 180ms ease-out",
  zIndex: 22,
};

const QUICK_SHARE_ONBOARDING_CARD_STYLE: CSSProperties = {
  width: "min(420px, calc(100vw - 32px))",
  display: "flex",
  flexDirection: "column",
  gap: "9px",
  padding: "12px",
  borderRadius: "14px",
  border: "1px solid rgba(194, 216, 235, 0.28)",
  background: "rgba(11, 21, 29, 0.84)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 16px 34px rgba(2, 8, 15, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.11)",
  transition: "transform 180ms ease-out, opacity 180ms ease-out",
  zIndex: 23,
};

const QUICK_SHARE_ONBOARDING_TITLE_STYLE: CSSProperties = {
  margin: 0,
  color: "#eff8ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.16px",
};

const QUICK_SHARE_ONBOARDING_BODY_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(220, 236, 247, 0.92)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 520,
  lineHeight: 1.4,
};

const QUICK_SHARE_ONBOARDING_BUTTON_STYLE: CSSProperties = {
  ...ACTIONS_MENU_BUTTON_STYLE,
  height: "34px",
  textAlign: "center",
  fontSize: "10.5px",
  fontWeight: 650,
  justifyContent: "center",
};

const QUICK_SHARE_ONBOARDING_STORAGE_KEY = "flowlabs_quick_share_onboarding_seen";

function safeReadLocalStorageFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "true";
  } catch (error) {
    console.warn("[quickboard-storage] Could not read localStorage flag", { key, error });
    return false;
  }
}

function safeWriteLocalStorageFlag(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value ? "true" : "false");
  } catch (error) {
    console.warn("[quickboard-storage] Could not write localStorage flag", { key, error });
  }
}

function cloneBoardStateForDraft(state: QuickBoardBoardState): QuickBoardBoardState {
  if (typeof structuredClone === "function") {
    return structuredClone(state);
  }
  return JSON.parse(JSON.stringify(state)) as QuickBoardBoardState;
}

function serializeBoardState(state: QuickBoardBoardState | null): string | null {
  if (!state) return null;
  const recoverableState: QuickBoardBoardState = {
    players: Array.isArray(state.players) ? state.players : [],
    items: Array.isArray(state.items) ? state.items : [],
    drawings: Array.isArray(state.drawings) ? state.drawings : [],
    phases: Array.isArray(state.phases) ? state.phases : [],
    movementPaths: Array.isArray(state.movementPaths) ? state.movementPaths : [],
    ...(state.routes !== undefined ? { routes: state.routes } : {}),
    ...(state.kits !== undefined ? { kits: state.kits } : {}),
    ...(state.teamKits !== undefined ? { teamKits: state.teamKits } : {}),
    ...(state.teamState !== undefined ? { teamState: state.teamState } : {}),
    ...(state.startSnapshot !== undefined ? { startSnapshot: state.startSnapshot } : {}),
  };
  try {
    return JSON.stringify(recoverableState);
  } catch {
    return null;
  }
}

const MY_BOARDS_POPOUT_STYLE: CSSProperties = {
  ...POPOUT_BASE_STYLE,
  left: "max(194px, calc(env(safe-area-inset-left, 0px) + 192px))",
  top: "50%",
  transform: "translateY(-50%)",
  flexDirection: "column",
  width: "min(240px, calc(100vw - 24px))",
  maxHeight: "min(66vh, 430px)",
  padding: "8px",
  gap: "6px",
  overflowY: "auto",
  overflowX: "hidden",
  background: "rgba(20, 28, 36, 0.86)",
  border: "1px solid rgba(212, 228, 244, 0.24)",
  boxShadow: "0 12px 26px rgba(0, 0, 0, 0.34)",
  zIndex: 22,
};

const PORTRAIT_MY_BOARDS_POPOUT_STYLE: CSSProperties = {
  ...MY_BOARDS_POPOUT_STYLE,
  ...PORTRAIT_POPOUT_BASE_STYLE,
  width: "calc(100vw - 32px)",
  maxWidth: "calc(100vw - 32px)",
  maxHeight: "min(60vh, 430px)",
};

const MY_BOARDS_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "6px",
};

const MY_BOARDS_TITLE_STYLE: CSSProperties = {
  margin: 0,
  color: "#eef7ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11.5px",
  fontWeight: 700,
  letterSpacing: "0.14px",
};

const MY_BOARDS_SAVE_BUTTON_STYLE: CSSProperties = {
  ...ACTIONS_MENU_BUTTON_STYLE,
  width: "fit-content",
  height: "28px",
  padding: "0 8px",
  textAlign: "center",
  fontSize: "9.5px",
  lineHeight: 1,
};

const MY_BOARDS_CARD_STYLE: CSSProperties = {
  borderRadius: "10px",
  border: "1px solid rgba(183, 207, 230, 0.2)",
  background: "rgba(13, 22, 30, 0.72)",
  padding: "7px",
  display: "grid",
  gap: "5px",
};

const MY_BOARDS_THUMBNAIL_STYLE: CSSProperties = {
  width: "100%",
  height: "80px",
  borderRadius: "8px",
  objectFit: "cover",
  border: "1px solid rgba(176, 203, 228, 0.22)",
  background: "rgba(17, 32, 42, 0.86)",
};

const MY_BOARDS_META_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(214, 230, 244, 0.94)",
  fontSize: "10px",
  fontWeight: 620,
  fontFamily: "Inter, system-ui, sans-serif",
};

const MY_BOARDS_TIMESTAMP_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(184, 206, 224, 0.86)",
  fontSize: "9px",
  fontFamily: "Inter, system-ui, sans-serif",
};

const MY_BOARDS_ACTION_ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: "4px",
};

const MY_BOARDS_ACTION_BUTTON_STYLE: CSSProperties = {
  ...ACTIONS_MENU_BUTTON_STYLE,
  height: "26px",
  minWidth: 0,
  fontSize: "9px",
  textAlign: "center",
  justifyContent: "center",
  padding: "0 2px",
};

const MY_BOARDS_EMPTY_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(188, 210, 228, 0.86)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9.5px",
  lineHeight: 1.35,
  textAlign: "center",
  padding: "8px 4px",
};

const COACH_HUB_PANEL_STYLE: CSSProperties = {
  ...POPOUT_BASE_STYLE,
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  width: "clamp(112px, 13vw, 148px)",
  maxWidth: "calc(100dvw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 12px)",
  maxHeight: "min(54vh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 72px))",
  overflowY: "auto",
  overflowX: "hidden",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  bottom: "max(60px, calc(env(safe-area-inset-bottom, 0px) + 58px))",
  padding: "5px",
  background: "rgba(9, 17, 24, 0.68)",
  border: "1px solid rgba(165, 194, 220, 0.2)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 8px 18px rgba(2, 8, 15, 0.26)",
  zIndex: 20,
};

const MOBILE_COACH_HUB_OVERLAY_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "flex-end",
  padding:
    "max(8px, calc(env(safe-area-inset-top, 0px) + 4px)) max(10px, calc(env(safe-area-inset-right, 0px) + 10px)) max(8px, calc(env(safe-area-inset-bottom, 0px) + 8px)) max(10px, calc(env(safe-area-inset-left, 0px) + 10px))",
  background: "rgba(5, 11, 17, 0.08)",
  zIndex: 24,
};

const TOOLS_PORTAL_BACKDROP_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "transparent",
  pointerEvents: "auto",
  zIndex: 24,
};

const MOBILE_COACH_HUB_PANEL_STYLE: CSSProperties = {
  width: "min(52vw, 320px)",
  maxWidth: "calc(100dvw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 20px)",
  maxHeight: "min(58dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 18px))",
  overflow: "hidden",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "6px",
  borderRadius: "11px",
  border: "1px solid rgba(140, 171, 159, 0.26)",
  background: "linear-gradient(180deg, rgba(12, 22, 24, 0.82) 0%, rgba(9, 16, 19, 0.88) 100%)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 10px 22px rgba(0, 0, 0, 0.26)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

const MOBILE_COACH_HUB_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4px",
  paddingBottom: "2px",
  borderBottom: "1px solid rgba(135, 162, 151, 0.14)",
};

const MOBILE_COACH_HUB_TITLE_STYLE: CSSProperties = {
  margin: 0,
  color: "#ecf6ef",
  fontSize: "10.5px",
  fontWeight: 700,
  letterSpacing: "0.12px",
  fontFamily: "Inter, system-ui, sans-serif",
};

const MOBILE_COACH_HUB_CLOSE_STYLE: CSSProperties = {
  ...ACTIONS_MENU_BUTTON_STYLE,
  width: "fit-content",
  minWidth: "46px",
  height: "22px",
  fontSize: "8.5px",
  fontWeight: 620,
  textAlign: "center",
  justifyContent: "center",
  borderRadius: "8px",
  border: "1px solid rgba(142, 169, 155, 0.26)",
  background: "rgba(13, 22, 25, 0.8)",
};

const MOBILE_COACH_HUB_BODY_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehavior: "contain",
  paddingRight: "1px",
};

const IPHONE_LANDSCAPE_TOOLS_OVERLAY_STYLE: CSSProperties = {
  ...MOBILE_COACH_HUB_OVERLAY_STYLE,
  justifyContent: "flex-end",
  alignItems: "flex-end",
};

const IPHONE_LANDSCAPE_TOOLS_PANEL_STYLE: CSSProperties = {
  position: "relative",
  left: "auto",
  right: "auto",
  top: "auto",
  bottom: "auto",
  width: "min(320px, calc(100dvw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 20px))",
  maxWidth: "calc(100dvw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 20px)",
  maxHeight: "min(58dvh, calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 18px))",
  height: "auto",
  overflow: "hidden",
  boxSizing: "border-box",
};

const IPHONE_LANDSCAPE_TOOLS_BODY_STYLE: CSSProperties = {
  ...MOBILE_COACH_HUB_BODY_STYLE,
  maxHeight: "100%",
};

const COACH_HUB_SECTION_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const COACH_HUB_SECTION_TITLE_STYLE: CSSProperties = {
  margin: 0,
  color: "#d7e8f5",
  fontSize: "8.5px",
  fontWeight: 700,
  letterSpacing: "0.12px",
  textTransform: "uppercase",
  fontFamily: "Inter, system-ui, sans-serif",
};

const COACH_HUB_TOOL_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: "3px",
};

const COACH_HUB_TOOL_BUTTON_STYLE: CSSProperties = {
  height: "30px",
  minWidth: "100%",
  borderRadius: "7px",
  fontSize: "9.5px",
  fontWeight: 600,
  fontFamily: "Inter, system-ui, sans-serif",
  letterSpacing: "0.1px",
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  padding: "0 2px",
  cursor: "pointer",
  border: "1px solid rgba(121, 171, 208, 0.24)",
  background: "rgba(17, 30, 40, 0.56)",
  color: "#dbecfa",
};

const COACH_HUB_TOOL_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...COACH_HUB_TOOL_BUTTON_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.68)",
  background: "rgba(38, 72, 102, 0.68)",
  color: "#f7fcff",
};

const COACH_HUB_COLOR_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "2px",
};

const COACH_HUB_COLOR_BUTTON_STYLE: CSSProperties = {
  width: "100%",
  height: "20px",
  borderRadius: "999px",
  border: "1px solid rgba(147, 173, 196, 0.28)",
  background: "rgba(15, 25, 36, 0.58)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const COACH_HUB_COLOR_SWATCH_STYLE: CSSProperties = {
  width: "12px",
  height: "12px",
  borderRadius: "999px",
  border: "1px solid rgba(255, 255, 255, 0.44)",
};

const COACH_HUB_ACTION_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "3px",
};

const GAELIC_FORMATION_BASE: ReadonlyArray<{ number: number; x: number; y: number }> = [
  { number: 1,  x: 8,  y: 50 },
  { number: 2,  x: 20, y: 22 },
  { number: 3,  x: 20, y: 50 },
  { number: 4,  x: 20, y: 78 },
  { number: 5,  x: 34, y: 18 },
  { number: 6,  x: 34, y: 50 },
  { number: 7,  x: 34, y: 82 },
  { number: 8,  x: 48, y: 38 },
  { number: 9,  x: 48, y: 62 },
  { number: 10, x: 62, y: 18 },
  { number: 11, x: 62, y: 50 },
  { number: 12, x: 62, y: 82 },
  { number: 13, x: 78, y: 25 },
  { number: 14, x: 78, y: 50 },
  { number: 15, x: 78, y: 75 },
];

function getGaelicFormationPos(team: "BLUE" | "RED", number: number): { x: number; y: number } {
  const base = GAELIC_FORMATION_BASE.find((p) => p.number === number);
  if (!base) return { x: team === "BLUE" ? 30 : 70, y: 50 };
  return team === "RED" ? { x: 100 - base.x, y: base.y } : { x: base.x, y: base.y };
}

const COACH_HUB_ACTION_BUTTON_STYLE: CSSProperties = {
  ...COACH_HUB_TOOL_BUTTON_STYLE,
  minWidth: 0,
};

const COACH_HUB_TAB_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "3px",
};

const COACH_HUB_TAB_BUTTON_STYLE: CSSProperties = {
  ...COACH_HUB_TOOL_BUTTON_STYLE,
  height: "26px",
  fontSize: "9px",
  letterSpacing: "0.12px",
};

const COACH_HUB_TAB_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...COACH_HUB_TAB_BUTTON_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.68)",
  background: "rgba(38, 72, 102, 0.72)",
  color: "#f7fcff",
};

const CONTROL_BUTTON_STYLE: CSSProperties = {
  height: "34px",
  minWidth: "78px",
  borderRadius: "10px",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  background: "rgba(20, 25, 30, 0.65)",
  color: "rgba(255, 255, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.3px",
  padding: "0 10px",
  cursor: "pointer",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow:
    "0 6px 20px rgba(0, 0, 0, 0.45), 0 0 18px rgba(255, 255, 255, 0.12), inset 0 1px 2px rgba(255, 255, 255, 0.25)",
  flex: "0 0 auto",
};

const DISABLED_CONTROL_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  opacity: 0.45,
  boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.08)",
  cursor: "not-allowed",
};

const SET_START_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  boxShadow:
    "0 6px 20px rgba(0, 0, 0, 0.45), 0 0 20px rgba(255, 255, 255, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.25)",
};

const ADD_PHASE_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  border: "1px solid rgba(59, 130, 246, 0.6)",
  boxShadow:
    "0 6px 20px rgba(0, 0, 0, 0.45), 0 0 18px rgba(59, 130, 246, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.25)",
};

const PLAY_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  border: "1px solid rgba(34, 197, 94, 0.6)",
  boxShadow:
    "0 6px 20px rgba(0, 0, 0, 0.45), 0 0 18px rgba(34, 197, 94, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.25)",
};

const PAUSE_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  border: "1px solid rgba(245, 158, 11, 0.62)",
  boxShadow:
    "0 6px 20px rgba(0, 0, 0, 0.45), 0 0 18px rgba(245, 158, 11, 0.32), inset 0 1px 2px rgba(255, 255, 255, 0.25)",
};

const RESET_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  border: "1px solid rgba(239, 68, 68, 0.6)",
  boxShadow:
    "0 6px 20px rgba(0, 0, 0, 0.45), 0 0 18px rgba(239, 68, 68, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.25)",
};

const UNDO_PHASE_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  border: "1px solid rgba(168, 85, 247, 0.6)",
  boxShadow:
    "0 6px 20px rgba(0, 0, 0, 0.45), 0 0 18px rgba(168, 85, 247, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.25)",
};

const PLAYBACK_SPEED_BAR_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 56px auto",
  alignItems: "center",
  gap: "5px",
  minWidth: "116px",
  height: "30px",
  padding: "0 7px",
  borderRadius: "999px",
  border: "1px solid rgba(211, 224, 217, 0.32)",
  background: "rgba(10, 20, 16, 0.72)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 7px 20px rgba(0, 0, 0, 0.35)",
  flex: "0 0 auto",
};

const PLAYBACK_SPEED_LABEL_STYLE: CSSProperties = {
  color: "rgba(230, 238, 233, 0.62)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "8px",
  fontWeight: 620,
  letterSpacing: "0.22px",
};

const PLAYBACK_SPEED_VALUE_STYLE: CSSProperties = {
  color: "#eef7f1",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.14px",
  textAlign: "right",
};

const PLAYBACK_SPEED_SLIDER_STYLE: CSSProperties = {
  width: "100%",
  minWidth: 0,
};

const MOVEMENT_MODE_PILL_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  transform: "translateX(-50%)",
  bottom: "max(54px, calc(env(safe-area-inset-bottom, 0px) + 52px))",
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "4px",
  borderRadius: "999px",
  border: "1px solid rgba(220, 236, 228, 0.26)",
  background: "rgba(9, 22, 18, 0.52)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 26px rgba(1, 7, 4, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  zIndex: 20,
};

const MOVEMENT_MODE_PILL_BUTTON_STYLE: CSSProperties = {
  minWidth: "58px",
  height: "30px",
  borderRadius: "999px",
  border: "1px solid rgba(212, 229, 222, 0.26)",
  background: "rgba(14, 30, 24, 0.66)",
  color: "rgba(230, 244, 236, 0.9)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10.5px",
  fontWeight: 640,
  letterSpacing: "0.2px",
  padding: "0 11px",
  cursor: "pointer",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.14)",
};

const MOVEMENT_MODE_PILL_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...MOVEMENT_MODE_PILL_BUTTON_STYLE,
  border: "1px solid rgba(124, 255, 114, 0.56)",
  background: "linear-gradient(180deg, rgba(34, 112, 66, 0.82) 0%, rgba(14, 42, 27, 0.94) 100%)",
  color: "#f4fff6",
  boxShadow: "0 0 0 1px rgba(124, 255, 114, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
};

const MOVEMENT_MODE_PILL_BUTTON_DISABLED_STYLE: CSSProperties = {
  opacity: 0.46,
  cursor: "not-allowed",
};

const BALL_POPUP_STYLE: CSSProperties = {
  ...POPOUT_BASE_STYLE,
  left: "50%",
  transform: "translateX(-50%)",
  bottom: "max(100px, calc(env(safe-area-inset-bottom, 0px) + 98px))",
  flexDirection: "row",
  gap: "4px",
  padding: "4px",
  borderRadius: "999px",
  border: "1px solid rgba(220, 236, 228, 0.26)",
  background: "rgba(9, 22, 18, 0.72)",
  boxShadow: "0 12px 26px rgba(1, 7, 4, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
  zIndex: 20,
};

const SHARE_TIP_TOAST_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(62px, calc(env(safe-area-inset-left, 0px) + 60px))",
  top: "calc(50% + 98px)",
  width: "min(286px, calc(100vw - 72px))",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "9px 10px",
  borderRadius: "12px",
  border: "1px solid rgba(191, 214, 235, 0.26)",
  background: "rgba(12, 22, 29, 0.84)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 12px 26px rgba(2, 8, 15, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
  zIndex: 23,
  pointerEvents: "none",
};

const SHARE_TIP_TEXT_STYLE: CSSProperties = {
  margin: 0,
  color: "#e5f2ff",
  fontSize: "10.5px",
  fontWeight: 600,
  letterSpacing: "0.14px",
  lineHeight: 1.35,
  whiteSpace: "pre-line",
  fontFamily: "Inter, system-ui, sans-serif",
};

const HOME_MENU_ICON_BUTTON_STYLE: CSSProperties = {
  width: "34px",
  height: "34px",
  borderRadius: "10px",
  border: "1px solid rgba(120, 168, 143, 0.34)",
  background: "rgba(13, 35, 23, 0.72)",
  color: "#f1f7f0",
  fontSize: "16px",
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

const WHITEBOARD_TOOLS_BUTTON_STYLE: CSSProperties = {
  ...COACH_HUB_TOOL_BUTTON_STYLE,
  minWidth: 0,
  fontWeight: 600,
};

const WHITEBOARD_TOOLS_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...WHITEBOARD_TOOLS_BUTTON_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.66)",
  background: "rgba(38, 72, 102, 0.72)",
  color: "#f8fcff",
};

const PHASES_CHIP_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(12px, calc(env(safe-area-inset-left, 0px) + 10px))",
  top: "max(12px, calc(env(safe-area-inset-top, 0px) + 10px))",
  height: "32px",
  borderRadius: "10px",
  border: "1px solid rgba(226, 236, 232, 0.22)",
  background: "rgba(10, 19, 20, 0.56)",
  color: "#dce9e4",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10.5px",
  fontWeight: 560,
  padding: "0 10px",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  zIndex: 20,
};

const PHASES_TRAY_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(12px, calc(env(safe-area-inset-left, 0px) + 10px))",
  top: "max(48px, calc(env(safe-area-inset-top, 0px) + 46px))",
  width: "126px",
  maxHeight: "156px",
  overflowY: "auto",
  padding: "6px",
  borderRadius: "12px",
  border: "1px solid rgba(226, 236, 232, 0.16)",
  background: "rgba(10, 19, 20, 0.64)",
  color: "#dce9e4",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.2)",
  zIndex: 19,
};

const PHASE_ITEM_STYLE: CSSProperties = {
  height: "28px",
  borderRadius: "8px",
  border: "1px solid rgba(224, 235, 230, 0.18)",
  background: "rgba(15, 24, 24, 0.58)",
  color: "#dce9e4",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 550,
  padding: "0 8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const PHASES_EMPTY_STYLE: CSSProperties = {
  ...PHASE_ITEM_STYLE,
  opacity: 0.75,
};

const WHITEBOARD_HEAD_BUTTON_BASE_STYLE: CSSProperties = {
  width: "36px",
  height: "36px",
  borderRadius: "999px",
  border: "1px solid rgba(148, 163, 184, 0.32)",
  background: "rgba(15, 23, 42, 0.72)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  color: "#e2e8f0",
  fontSize: "14px",
  lineHeight: 1,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 0 0 1px rgba(148, 163, 184, 0.14), 0 0 6px rgba(148, 163, 184, 0.16)",
};

const WHITEBOARD_COUNT_SELECTOR_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(8px, calc(env(safe-area-inset-right, 0px) + 6px))",
  top: "max(16px, env(safe-area-inset-top, 0px))",
  bottom: "auto",
  zIndex: 22,
  width: "clamp(148px, 23vw, 176px)",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  padding: "7px",
  borderRadius: "12px",
  border: "1px solid rgba(163, 190, 212, 0.26)",
  background: "rgba(10, 19, 24, 0.74)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 12px 24px rgba(2, 8, 15, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
  maxHeight: "min(62vh, 380px)",
  overflowY: "auto",
  overflowX: "hidden",
};

const WHITEBOARD_COUNT_SELECTOR_TITLE_STYLE: CSSProperties = {
  color: "#d7e8f5",
  fontSize: "8px",
  fontWeight: 700,
  letterSpacing: "0.2px",
  textTransform: "uppercase",
  margin: 0,
  fontFamily: "Inter, system-ui, sans-serif",
};

const WHITEBOARD_SUBSECTION_TITLE_STYLE: CSSProperties = {
  ...WHITEBOARD_COUNT_SELECTOR_TITLE_STYLE,
  opacity: 0.78,
};

const WHITEBOARD_PANEL_SECTION_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const WHITEBOARD_TOOL_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "4px",
};

const WHITEBOARD_TEAM_SELECTOR_ROW_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "5px",
};

const WHITEBOARD_TEAM_OPTION_STYLE: CSSProperties = {
  height: "28px",
  borderRadius: "8px",
  border: "1px solid rgba(148, 163, 184, 0.36)",
  background: "rgba(15, 23, 42, 0.82)",
  color: "#dbe7f5",
  fontSize: "10px",
  fontWeight: 650,
  letterSpacing: "0.2px",
  cursor: "pointer",
  fontFamily: "Inter, system-ui, sans-serif",
};

const WHITEBOARD_TEAM_OPTION_ACTIVE_STYLE: CSSProperties = {
  ...WHITEBOARD_TEAM_OPTION_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.6)",
  background: "rgba(30, 64, 175, 0.52)",
  color: "#f8fcff",
};

const WHITEBOARD_COUNT_SELECTOR_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "4px",
};

const WHITEBOARD_COUNT_OPTION_STYLE: CSSProperties = {
  height: "26px",
  borderRadius: "8px",
  border: "1px solid rgba(148, 163, 184, 0.36)",
  background: "rgba(15, 23, 42, 0.86)",
  color: "#dbe7f5",
  fontSize: "10px",
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "0.2px",
  cursor: "pointer",
  fontFamily: "Inter, system-ui, sans-serif",
};

const WHITEBOARD_COUNT_OPTION_ACTIVE_STYLE: CSSProperties = {
  ...WHITEBOARD_COUNT_OPTION_STYLE,
  border: "1px solid rgba(125, 211, 252, 0.56)",
  background: "rgba(30, 64, 175, 0.5)",
  color: "#f8fcff",
};

const WHITEBOARD_COUNT_OPTIONS = Array.from({ length: 15 }, (_, index) => index + 1);

const WHITEBOARD_TOKEN_COLOR_OPTION_STYLE: CSSProperties = {
  width: "28px",
  height: "28px",
  borderRadius: "999px",
  border: "1px solid rgba(130, 150, 170, 0.4)",
  background: "rgba(15, 23, 42, 0.52)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const WHITEBOARD_TOKEN_COLOR_SWATCH_STYLE: CSSProperties = {
  width: "22px",
  height: "22px",
  borderRadius: "999px",
  border: "1px solid rgba(255, 255, 255, 0.48)",
};

const WHITEBOARD_HOME_BUTTON_STYLE: CSSProperties = {
  ...HOME_MENU_ICON_BUTTON_STYLE,
  position: "fixed",
  top: "max(12px, calc(env(safe-area-inset-top, 0px) + 10px))",
  right: "max(12px, calc(env(safe-area-inset-right, 0px) + 10px))",
  zIndex: 23,
};

const WHITEBOARD_HOME_CONFIRM_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(54px, calc(env(safe-area-inset-top, 0px) + 50px))",
  right: "max(12px, calc(env(safe-area-inset-right, 0px) + 10px))",
  width: "min(244px, calc(100vw - 24px))",
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  padding: "9px",
  borderRadius: "12px",
  border: "1px solid rgba(163, 190, 212, 0.24)",
  background: "rgba(10, 19, 24, 0.76)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 12px 24px rgba(2, 8, 15, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  zIndex: 24,
};

const WHITEBOARD_HOME_CONFIRM_TITLE_STYLE: CSSProperties = {
  margin: 0,
  color: "#e4eff8",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.12px",
  fontFamily: "Inter, system-ui, sans-serif",
};

const WHITEBOARD_HOME_CONFIRM_MESSAGE_STYLE: CSSProperties = {
  margin: 0,
  color: "rgba(215, 232, 245, 0.88)",
  fontSize: "10px",
  lineHeight: 1.35,
  fontFamily: "Inter, system-ui, sans-serif",
};

const WHITEBOARD_HOME_CONFIRM_ACTIONS_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "6px",
};

const WHITEBOARD_HOME_CONFIRM_BUTTON_STYLE: CSSProperties = {
  ...COACH_HUB_TOOL_BUTTON_STYLE,
  minWidth: 0,
  height: "31px",
};

const WHITEBOARD_HOME_CONFIRM_GO_BUTTON_STYLE: CSSProperties = {
  ...WHITEBOARD_HOME_CONFIRM_BUTTON_STYLE,
  border: "1px solid rgba(248, 113, 113, 0.5)",
  background: "rgba(127, 29, 29, 0.62)",
  color: "#ffe5e5",
};

export default function TacticalPadLiteClean({ initialMode = "tactical" }: TacticalPadLiteCleanProps) {
  const overlayPortalRoot = useOverlayPortalRoot();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<TacticalPadLiteSurface | null>(null);
  const latestThumbnailSaveTokenRef = useRef(0);
  const tacticalItemCounterRef = useRef(0);
  const actionsBubbleButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const quickSharePopoverRef = useRef<HTMLDivElement | null>(null);
  const quickShareOnboardingCardRef = useRef<HTMLDivElement | null>(null);
  const myBoardsPopoverRef = useRef<HTMLDivElement | null>(null);
  const toolsBubbleButtonRef = useRef<HTMLButtonElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const shareTipTimerRef = useRef<number | null>(null);
  const isExportingSnapshotRef = useRef(false);
  const quickBoardFeedbackTimerRef = useRef<number | null>(null);
  const whiteboardBubbleButtonRef = useRef<HTMLButtonElement | null>(null);
  const whiteboardBubbleMenuRef = useRef<HTMLDivElement | null>(null);
  const whiteboardHomeButtonRef = useRef<HTMLButtonElement | null>(null);
  const whiteboardHomeConfirmRef = useRef<HTMLDivElement | null>(null);
  const whiteboardHomeConfirmHistoryRef = useRef(false);
  const whiteboardBubbleDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    moved: boolean;
  } | null>(null);
  const suppressWhiteboardBubbleClickRef = useRef(false);
  const mode: PadMode = initialMode;
  const isPortraitOrientation = usePortraitOrientation();
  const [whiteboardBlueCount, setWhiteboardBlueCount] = useState(1);
  const [whiteboardRedCount, setWhiteboardRedCount] = useState(1);
  const [bluePlayerCount, setBluePlayerCount] = useState(0);
  const [redPlayerCount, setRedPlayerCount] = useState(0);
  const [blueActiveNumbers, setBlueActiveNumbers] = useState<Set<number>>(new Set());
  const [redActiveNumbers, setRedActiveNumbers] = useState<Set<number>>(new Set());
  const [whiteboardCountPickerTeam, setWhiteboardCountPickerTeam] = useState<"BLUE" | "RED">("BLUE");
  const [whiteboardBubbleOpen, setWhiteboardBubbleOpen] = useState(false);
  const [whiteboardHomeConfirmOpen, setWhiteboardHomeConfirmOpen] = useState(false);
  const [whiteboardBubblePosition, setWhiteboardBubblePosition] = useState<{ left: number; top: number } | null>(
    null,
  );
  const [whiteboardBubbleMenuSize, setWhiteboardBubbleMenuSize] = useState<{ width: number; height: number }>({
    width: 176,
    height: 300,
  });
  const [whiteboardBlueColor, setWhiteboardBlueColor] = useState<WhiteboardTokenColor>("blue");
  const [whiteboardRedColor, setWhiteboardRedColor] = useState<WhiteboardTokenColor>("red");
  const [whiteboardPenColor, setWhiteboardPenColor] = useState<number>(WHITEBOARD_DRAW_COLOR);
  const [tacticalPenColor, setTacticalPenColor] = useState<number>(WHITEBOARD_DRAW_COLOR);
  const whiteboardCountsRef = useRef({ blue: 1, red: 1 });
  const whiteboardTeamColorsRef = useRef<{ blue: WhiteboardTokenColor; red: WhiteboardTokenColor }>({
    blue: "blue",
    red: "red",
  });
  const [whiteboardTool, setWhiteboardTool] = useState<WhiteboardToolControl>("move");
  const [tacticalTool, setTacticalTool] = useState<WhiteboardToolControl>("move");
  const [items, setItems] = useState<TacticalItem[]>([]);
  const [itemMode, setItemMode] = useState<ItemMode>("locked");
  const [phaseCount, setPhaseCount] = useState(0);
  const [tacticalTokenStyle, setTacticalTokenStyle] = useState<TacticalPlayerTokenStyle>("vision-v3");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [movementModePillSelection, setMovementModePillSelection] = useState<MovementModePillOption>("move");
  const [routeState, setRouteState] = useState<TacticalRouteState>({
    isRouteCaptureMode: false,
    routeCount: 0,
    maxRoutes: 6,
  });
  const [playbackSpeedMultiplier, setPlaybackSpeedMultiplier] = useState<number>(DEFAULT_PLAYBACK_SPEED_MULTIPLIER);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [quickShareOpen, setQuickShareOpen] = useState(false);
  const {
    recordPhase: slateRecordPhase,
    setRecordPhase: setSlateRecordPhase,
    recordCountdown: slateRecordCountdown,
    recordElapsed: slateRecordElapsed,
    recordBlob: slateRecordBlob,
    recordBlobUrl: slateRecordBlobUrl,
    recordHasAudio: slateRecordHasAudio,
    recordMimeType: slateRecordMimeType,
    micStatus: slateMicStatus,
    isSharing: slateIsSharing,
    canRecord: slateCanRecord,
    startCountdown: slateStartCountdown,
    startCountdownWithVoice: slateStartCountdownWithVoice,
    stopRecording: slateStopRecording,
    dismissRecord: slateDismissRecord,
    saveClip: slateSaveClip,
    shareClip: slateShareClip,
  } = useCanvasRecorder({
    getCanvas: () => surfaceRef.current?.getCanvas() ?? null,
    onBeforeCountdown: () => setQuickShareOpen(false),
    onComplete: () => setQuickShareOpen(true),
  });
  // slateRecordElapsed holds the final elapsed value after stop — used as the clip duration display.

  type SlateClipDiag = { events: string[]; rs: number; ns: number; src: string; dur: number; vw: number; vh: number; err: string | null; seeked: boolean };
  const [slateClipDiag, setSlateClipDiag] = useState<SlateClipDiag>({ events: [], rs: -1, ns: -1, src: "", dur: NaN, vw: 0, vh: 0, err: null, seeked: false });
  useEffect(() => {
    if (IS_DIAG_PREVIEW) setSlateClipDiag({ events: [], rs: -1, ns: -1, src: "", dur: NaN, vw: 0, vh: 0, err: null, seeked: false });
  }, [slateRecordBlobUrl]);

  const [slateClipVideoReady, setSlateClipVideoReady] = useState(false);
  const [slateClipBlankWarning, setSlateClipBlankWarning] = useState(false);
  const slateClipBlankTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setSlateClipVideoReady(false);
    setSlateClipBlankWarning(false);
    if (slateClipBlankTimerRef.current) { clearTimeout(slateClipBlankTimerRef.current); slateClipBlankTimerRef.current = null; }
    if (!slateRecordBlobUrl || IS_DIAG_PREVIEW) return;
    slateClipBlankTimerRef.current = setTimeout(() => setSlateClipBlankWarning(true), 4000);
    return () => { if (slateClipBlankTimerRef.current) { clearTimeout(slateClipBlankTimerRef.current); slateClipBlankTimerRef.current = null; } };
  }, [slateRecordBlobUrl]);

  const [myBoardsOpen, setMyBoardsOpen] = useState(false);
  const [savedBoards, setSavedBoards] = useState<SavedQuickBoard[]>([]);
  const [pendingRecoveredBoardDraft, setPendingRecoveredBoardDraft] = useState<QuickBoardBoardState | null>(null);
  const [isRecoveredBoardPromptVisible, setIsRecoveredBoardPromptVisible] = useState(false);
  const [isBoardDraftCheckComplete, setIsBoardDraftCheckComplete] = useState(false);
  const [boardSurfaceReadyNonce, setBoardSurfaceReadyNonce] = useState(0);
  const [quickShareOnboardingOpen, setQuickShareOnboardingOpen] = useState(false);
  const [quickShareOnboardingSeen, setQuickShareOnboardingSeen] = useState(false);
  const [quickShareOnboardingEntered, setQuickShareOnboardingEntered] = useState(false);
  const [shareTipMessage, setShareTipMessage] = useState<string | null>(null);
  const [quickBoardFeedback, setQuickBoardFeedback] = useState<string | null>(null);
  const [lastBoardSavedAtMillis, setLastBoardSavedAtMillis] = useState<number | null>(null);
  const [loadedBoardName, setLoadedBoardName] = useState<string | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [ballPopupStep, setBallPopupStep] = useState<"root" | "football-size" | "sliotar-size" | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [activeToolsSection, setActiveToolsSection] = useState<"draw" | "teams" | "items" | "board">("draw");
  const [isCompactLandscapeToolsMenu, setIsCompactLandscapeToolsMenu] = useState(() => {
    if (typeof window === "undefined") return false;
    return shouldUseCompactLandscapeToolsMenu(getViewportRect());
  });
  const [isIphoneLandscapeToolsMenu, setIsIphoneLandscapeToolsMenu] = useState(() => {
    if (typeof window === "undefined") return false;
    return shouldUseIphoneLandscapeToolsOverride(getViewportRect());
  });
  const [appViewportHeight, setAppViewportHeight] = useState(() => getMobileViewportHeight());
  const [phasesOpen, setPhasesOpen] = useState(false);
  const [kitEditorState, setKitEditorState] = useState<KitEditorState | null>(null);
  const [kitEditorTab, setKitEditorTab] = useState<KitEditorTab>("base");
  const [textAnnotations, setTextAnnotations] = useState<SlateTextAnnotation[]>([]);
  const [textToolActive, setTextToolActive] = useState(false);
  const textAnnotationsRef = useRef<SlateTextAnnotation[]>([]);
  const textAnnotationsBaselineRef = useRef<string>("[]");

  const isStatsMode = mode === "stats";
  const isWhiteboardMode = mode === "whiteboard";
  const isPortraitViewingMode = !isStatsMode && !isWhiteboardMode && isPortraitOrientation;
  const isPortraitViewingModeRef = useRef(isPortraitViewingMode);
  const shouldKeepScreenAwakeForBoard = !isStatsMode && !isWhiteboardMode;
  const playbackSpeedMultiplierRef = useRef(playbackSpeedMultiplier);
  const boardBaselineSignatureRef = useRef<string | null>(null);
  const lastBoardDraftSignatureRef = useRef<string | null>(null);

  useScreenWakeLock(shouldKeepScreenAwakeForBoard);

  useEffect(() => {
    isPortraitViewingModeRef.current = isPortraitViewingMode;
  }, [isPortraitViewingMode]);

  useEffect(() => {
    textAnnotationsRef.current = textAnnotations;
  }, [textAnnotations]);

  useEffect(() => {
    playbackSpeedMultiplierRef.current = playbackSpeedMultiplier;
  }, [playbackSpeedMultiplier]);

  useEffect(() => {
    if (isWhiteboardMode || isStatsMode) {
      setKitEditorState(null);
      setKitEditorTab("base");
      setMyBoardsOpen(false);
    }
  }, [isWhiteboardMode, isStatsMode]);

  useEffect(() => {
    if (kitEditorState == null) {
      setKitEditorTab("base");
    }
  }, [kitEditorState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = safeReadLocalStorageFlag(QUICK_SHARE_ONBOARDING_STORAGE_KEY);
    setQuickShareOnboardingSeen(seen);
    setSavedBoards(loadAllBoards());
    const { draft, isCorrupt } = loadQuickBoardDraft();
    if (draft) {
      setPendingRecoveredBoardDraft(cloneBoardStateForDraft(draft.boardState));
      setIsRecoveredBoardPromptVisible(false);
      lastBoardDraftSignatureRef.current = serializeBoardState(draft.boardState);
    } else if (isCorrupt) {
      showQuickBoardNotice("Recovered board draft was invalid and ignored.");
      clearQuickBoardDraft();
      setIsRecoveredBoardPromptVisible(false);
    } else {
      setIsRecoveredBoardPromptVisible(false);
    }
    setIsBoardDraftCheckComplete(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const settleMs = isIphoneDevice() ? ORIENTATION_SETTLE_DEBOUNCE_MS : 0;
    let settleTimer: number | null = null;
    let settleRaf = 0;
    const applyCompactLandscapeState = () => {
      settleRaf = 0;
      const viewport = getViewportRect();
      setIsCompactLandscapeToolsMenu(shouldUseCompactLandscapeToolsMenu(viewport));
      setIsIphoneLandscapeToolsMenu(shouldUseIphoneLandscapeToolsOverride(viewport));
    };
    const syncCompactLandscapeState = () => {
      if (settleTimer != null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (settleRaf) {
        window.cancelAnimationFrame(settleRaf);
        settleRaf = 0;
      }
      if (settleMs <= 0) {
        settleRaf = window.requestAnimationFrame(applyCompactLandscapeState);
        return;
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        settleRaf = window.requestAnimationFrame(applyCompactLandscapeState);
      }, settleMs);
    };
    applyCompactLandscapeState();
    window.addEventListener("resize", syncCompactLandscapeState);
    window.addEventListener("orientationchange", syncCompactLandscapeState);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncCompactLandscapeState);
    viewport?.addEventListener("scroll", syncCompactLandscapeState);
    return () => {
      if (settleTimer != null) {
        window.clearTimeout(settleTimer);
      }
      if (settleRaf) {
        window.cancelAnimationFrame(settleRaf);
      }
      window.removeEventListener("resize", syncCompactLandscapeState);
      window.removeEventListener("orientationchange", syncCompactLandscapeState);
      viewport?.removeEventListener("resize", syncCompactLandscapeState);
      viewport?.removeEventListener("scroll", syncCompactLandscapeState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId = 0;
    let timeoutId: number | null = null;
    const clearScheduled = () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
    const syncViewportHeight = () => {
      rafId = 0;
      const nextHeight = getMobileViewportHeight();
      setAppViewportHeight((prevHeight) =>
        Math.abs(prevHeight - nextHeight) <= 1 ? prevHeight : nextHeight,
      );
    };
    const scheduleSync = (defer: boolean) => {
      clearScheduled();
      const run = () => {
        rafId = window.requestAnimationFrame(syncViewportHeight);
      };
      if (defer) {
        timeoutId = window.setTimeout(run, 180);
        return;
      }
      run();
    };
    const handleResize = () => scheduleSync(false);
    const handleOrientationChange = () => scheduleSync(true);
    const handleResume = () => scheduleSync(true);
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      scheduleSync(true);
    };

    scheduleSync(false);
    const viewport = window.visualViewport;
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleOrientationChange);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    viewport?.addEventListener("resize", handleResize);
    viewport?.addEventListener("scroll", handleResize);

    return () => {
      clearScheduled();
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("pageshow", handleResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      viewport?.removeEventListener("resize", handleResize);
      viewport?.removeEventListener("scroll", handleResize);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(orientation: landscape)");
    const settleMs = isIphoneDevice() ? ORIENTATION_SETTLE_DEBOUNCE_MS : 0;
    const resumeSettleMs = Math.max(180, settleMs);
    let rafA = 0;
    let rafB = 0;
    let settleTimer: number | null = null;
    let resumeTimer: number | null = null;

    const runDoubleRafReflow = () => {
      rafA = window.requestAnimationFrame(() => {
        rafB = window.requestAnimationFrame(() => {
          surfaceRef.current?.reflow();
        });
      });
    };

    const scheduleReflow = () => {
      if (settleTimer != null) {
        window.clearTimeout(settleTimer);
        settleTimer = null;
      }
      window.cancelAnimationFrame(rafA);
      window.cancelAnimationFrame(rafB);
      if (settleMs <= 0) {
        runDoubleRafReflow();
        return;
      }
      settleTimer = window.setTimeout(() => {
        settleTimer = null;
        runDoubleRafReflow();
      }, settleMs);
    };

    const scheduleResumeRecovery = () => {
      scheduleReflow();
      if (resumeTimer != null) {
        window.clearTimeout(resumeTimer);
        resumeTimer = null;
      }
      resumeTimer = window.setTimeout(() => {
        resumeTimer = null;
        scheduleReflow();
        window.dispatchEvent(new Event("resize"));
      }, resumeSettleMs);
    };

    const handleViewportChange = () => {
      scheduleReflow();
    };
    const handleResume = () => {
      scheduleResumeRecovery();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      scheduleResumeRecovery();
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleViewportChange);
    } else {
      media.addListener(handleViewportChange);
    }
    window.addEventListener("orientationchange", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("focus", handleResume);
    window.addEventListener("pageshow", handleResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);

    return () => {
      if (settleTimer != null) {
        window.clearTimeout(settleTimer);
      }
      if (resumeTimer != null) {
        window.clearTimeout(resumeTimer);
      }
      window.cancelAnimationFrame(rafA);
      window.cancelAnimationFrame(rafB);
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", handleViewportChange);
      } else {
        media.removeListener(handleViewportChange);
      }
      window.removeEventListener("orientationchange", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("focus", handleResume);
      window.removeEventListener("pageshow", handleResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStatsMode || isWhiteboardMode) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const hasActiveDraft = loadQuickBoardDraft().draft != null;
      const shouldWarn = hasActiveDraft || hasUnsavedBoardChanges();
      if (!shouldWarn) return;
      event.preventDefault();
      event.returnValue = "Save your board in My Boards before leaving or refreshing.";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isStatsMode, isWhiteboardMode]);

  useEffect(() => {
    whiteboardCountsRef.current = {
      blue: whiteboardBlueCount,
      red: whiteboardRedCount,
    };
  }, [whiteboardBlueCount, whiteboardRedCount]);

  useEffect(() => {
    whiteboardTeamColorsRef.current = {
      blue: whiteboardBlueColor,
      red: whiteboardRedColor,
    };
  }, [whiteboardBlueColor, whiteboardRedColor]);

  useEffect(() => {
    if (isStatsMode) return;
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let destroySurface: (() => void) | null = null;

    void createTacticalPadLiteSurface(host, {
      surfaceVariant: isWhiteboardMode ? "whiteboard" : "tactical",
      whiteboardTeamCounts: isWhiteboardMode ? whiteboardCountsRef.current : undefined,
      whiteboardTeamColors: whiteboardTeamColorsRef.current,
      whiteboardDrawColor: isWhiteboardMode ? whiteboardPenColor : tacticalPenColor,
      tacticalTokenStyle,
      onPhaseCountChange: (count) => {
        if (!disposed) {
          setPhaseCount(count);
        }
      },
      onPlaybackStateChange: (state) => {
        if (disposed) return;
        setIsPlaying(state.isPlaying);
        setIsPaused(state.isPaused);
      },
      onRouteStateChange: (state) => {
        if (disposed) return;
        setRouteState(state);
      },
      onItemMove: (itemId, x, y) => {
        if (disposed) return;
        const nextX = Math.max(0, Math.min(100, x));
        const nextY = Math.max(0, Math.min(100, y));
        setItems((previous) =>
          previous.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  x: nextX,
                  y: nextY,
                }
              : item,
          ),
        );
      },
      onTacticalPlayerDoubleTap: ({ playerId, clientX, clientY }) => {
        if (disposed || isWhiteboardMode || isPortraitViewingModeRef.current) return;
        const player = surfaceRef.current?.getTacticalPlayer(playerId);
        if (!player) return;
        setKitEditorTab("base");
        setKitEditorState({
          playerId: player.id,
          anchorLeft: clientX,
          anchorTop: clientY,
          revision: 0,
        });
      },
    }).then((surface) => {
      if (disposed) {
        surface.destroy();
        return;
      }
      surfaceRef.current = surface;
      destroySurface = surface.destroy;
      const initialDrawTool = isWhiteboardMode ? whiteboardTool : tacticalTool;
      const initialDrawColor = isWhiteboardMode ? whiteboardPenColor : tacticalPenColor;
      surface.setPlaybackSpeedMultiplier(playbackSpeedMultiplierRef.current);
      surface.setWhiteboardDrawTool(initialDrawTool);
      surface.setWhiteboardDrawColor(initialDrawColor);
      if (!isWhiteboardMode) {
        surface.setItems(items);
        const initialSurfaceItemMode: ItemMode =
          itemMode === "edit" && tacticalTool === "move" && !(isPlaying || isPaused)
            ? "edit"
            : "locked";
        surface.setItemMode(initialSurfaceItemMode);
        surface.setRouteCaptureMode(false);
        surface.setPossessionPassMode(false);
        const initialSnapshot = captureQuickBoardSnapshot(surface);
        boardBaselineSignatureRef.current = serializeBoardState(initialSnapshot);
        const query = new URLSearchParams(window.location.search);
        const boardIdFromQuery = query.get("boardId")?.trim() ?? "";
        const hasRecoverableDraft = loadQuickBoardDraft().draft != null;
        if (boardIdFromQuery.length > 0 && !hasRecoverableDraft) {
          handleOpenSavedBoard(boardIdFromQuery);
          query.delete("boardId");
          const nextQuery = query.toString();
          const nextUrl = `${window.location.pathname}${nextQuery.length > 0 ? `?${nextQuery}` : ""}${window.location.hash}`;
          window.history.replaceState(window.history.state, "", nextUrl);
        }
      }
      setBoardSurfaceReadyNonce((previous) => previous + 1);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          surface.reflow();
        });
      });
    });

    return () => {
      disposed = true;
      surfaceRef.current = null;
      destroySurface?.();
    };
  }, [isStatsMode, isWhiteboardMode]);

  useEffect(() => {
    if (isStatsMode) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const activeDrawTool = isWhiteboardMode ? whiteboardTool : tacticalTool;
    const activeDrawColor = isWhiteboardMode ? whiteboardPenColor : tacticalPenColor;
    surface.setWhiteboardDrawTool(activeDrawTool);
    surface.setWhiteboardDrawColor(activeDrawColor);
  }, [isStatsMode, isWhiteboardMode, whiteboardTool, whiteboardPenColor, tacticalTool, tacticalPenColor]);

  useEffect(() => {
    if (isStatsMode) return;
    surfaceRef.current?.setPlaybackSpeedMultiplier(playbackSpeedMultiplier);
  }, [isStatsMode, playbackSpeedMultiplier]);

  useEffect(() => {
    if (isStatsMode) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.setWhiteboardTeamConfig({
      counts: whiteboardCountsRef.current,
      colors: whiteboardTeamColorsRef.current,
    });
  }, [isStatsMode, whiteboardBlueCount, whiteboardRedCount, whiteboardBlueColor, whiteboardRedColor]);

  useEffect(() => {
    if (isStatsMode || isWhiteboardMode) return;
    surfaceRef.current?.setItems(items);
  }, [isStatsMode, isWhiteboardMode, items]);

  useEffect(() => {
    if (isStatsMode || isWhiteboardMode) return;
    surfaceRef.current?.setTacticalTokenStyle(tacticalTokenStyle);
  }, [isStatsMode, isWhiteboardMode, tacticalTokenStyle]);

  useEffect(() => {
    if (isStatsMode || isWhiteboardMode) return;
    if (!isBoardDraftCheckComplete) return;
    if (pendingRecoveredBoardDraft) return;
    const persistDraft = () => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const snapshot = captureQuickBoardSnapshot(surface);
      if (!snapshot) return;
      const signature = serializeBoardState(snapshot);
      if (!signature) return;
      if (!boardBaselineSignatureRef.current) {
        boardBaselineSignatureRef.current = signature;
      }
      const currentAnnotations = textAnnotationsRef.current;
      const annotationsSig = JSON.stringify(currentAnnotations);
      const isDirty = boardBaselineSignatureRef.current !== signature
        || annotationsSig !== textAnnotationsBaselineRef.current;
      if (!isDirty) return;
      const draftKey = signature + ":ta:" + annotationsSig;
      if (lastBoardDraftSignatureRef.current === draftKey) return;
      const snapshotFull = currentAnnotations.length > 0
        ? { ...snapshot, textAnnotations: currentAnnotations }
        : snapshot;
      const persisted = saveQuickBoardDraft(snapshotFull);
      if (!persisted) return;
      lastBoardDraftSignatureRef.current = draftKey;
    };
    const intervalId = window.setInterval(persistDraft, 1200);
    const onBeforeUnload = () => {
      persistDraft();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [isStatsMode, isWhiteboardMode, isBoardDraftCheckComplete, pendingRecoveredBoardDraft]);

  useEffect(() => {
    if (isStatsMode || isWhiteboardMode) {
      setIsRecoveredBoardPromptVisible(false);
      return;
    }
    if (!pendingRecoveredBoardDraft) {
      setIsRecoveredBoardPromptVisible(false);
      return;
    }
    const currentSignature = captureCurrentBoardSignature();
    if (!currentSignature) return;
    const draftSignature = serializeBoardState(pendingRecoveredBoardDraft);
    if (!draftSignature || draftSignature === currentSignature) {
      clearActiveBoardDraft();
      setPendingRecoveredBoardDraft(null);
      setIsRecoveredBoardPromptVisible(false);
      return;
    }
    setIsRecoveredBoardPromptVisible(true);
  }, [isStatsMode, isWhiteboardMode, pendingRecoveredBoardDraft, boardSurfaceReadyNonce]);

  useEffect(() => {
    if (isStatsMode || isWhiteboardMode || !isPortraitViewingMode) return;
    setToolsOpen(false);
    setKitEditorState(null);
    setMovementModePillSelection("move");
    setItemMode("locked");
    setTacticalTool("move");
    setRouteState((previous) => ({ ...previous, isRouteCaptureMode: false }));
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.setItemMode("locked");
    surface.setWhiteboardDrawTool("move");
    surface.setRouteCaptureMode(false);
  }, [isPortraitViewingMode, isStatsMode, isWhiteboardMode]);

  const isPlaybackLocked = isPlaying || isPaused;
  const hasBallOnPitch = items.some((item) => isBallItemType(item.type));
  const hasAssignedRoutes = routeState.routeCount > 0;
  const isAddPhaseBlocked = isPlaybackLocked || routeState.isRouteCaptureMode || hasAssignedRoutes;
  const playbackSpeedOptionIndex = Math.max(
    0,
    PLAYBACK_SPEED_OPTIONS.findIndex((option) => option.multiplier === playbackSpeedMultiplier),
  );
  const playbackSpeedLabel = PLAYBACK_SPEED_OPTIONS[playbackSpeedOptionIndex]?.label ?? "1.0x";
  const playbackSpeedTrackFillPercent =
    (playbackSpeedOptionIndex / Math.max(1, PLAYBACK_SPEED_OPTIONS.length - 1)) * 100;
  const playbackSpeedSliderStyle = {
    ...PLAYBACK_SPEED_SLIDER_STYLE,
    "--speed-track": `linear-gradient(90deg, rgba(34, 197, 94, 0.95) 0%, rgba(34, 197, 94, 0.95) ${playbackSpeedTrackFillPercent}%, rgba(255, 255, 255, 0.9) ${playbackSpeedTrackFillPercent}%, rgba(255, 255, 255, 0.9) 100%)`,
  } as CSSProperties;
  const effectiveItemMode: ItemMode =
    isPortraitViewingMode || routeState.isRouteCaptureMode || (itemMode !== "edit" || tacticalTool !== "move" || isPlaybackLocked)
      ? "locked"
      : "edit";

  useEffect(() => {
    if (isStatsMode || isWhiteboardMode) return;
    surfaceRef.current?.setItemMode(effectiveItemMode);
  }, [isStatsMode, isWhiteboardMode, effectiveItemMode]);

  useEffect(() => {
    if (isStatsMode || isWhiteboardMode) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const isPossessionPassModeActive = !isPortraitViewingMode && movementModePillSelection === "ball";
    surface.setPossessionPassMode(isPossessionPassModeActive);
  }, [isStatsMode, isWhiteboardMode, isPortraitViewingMode, movementModePillSelection]);

  useEffect(() => {
    if (isStatsMode || isWhiteboardMode) return;
    if (routeState.isRouteCaptureMode) {
      setMovementModePillSelection("route");
      return;
    }
    if (movementModePillSelection === "route") {
      setMovementModePillSelection("move");
    }
    if (tacticalTool !== "move") return;
    if (itemMode === "edit") {
      setMovementModePillSelection("move");
    }
  }, [isStatsMode, isWhiteboardMode, routeState.isRouteCaptureMode, tacticalTool, itemMode, movementModePillSelection]);

  useEffect(() => {
    if (!isWhiteboardMode) return;
    const syncBubblePosition = () => {
      const viewport = getViewportRect();
      setWhiteboardBubblePosition((prev) => {
        const next =
          prev == null ? getDefaultWhiteboardBubblePosition(viewport) : clampWhiteboardBubblePosition(prev, viewport);
        if (prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5) {
          return prev;
        }
        return next;
      });
    };

    syncBubblePosition();
    window.addEventListener("resize", syncBubblePosition);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncBubblePosition);
    viewport?.addEventListener("scroll", syncBubblePosition);

    return () => {
      window.removeEventListener("resize", syncBubblePosition);
      viewport?.removeEventListener("resize", syncBubblePosition);
      viewport?.removeEventListener("scroll", syncBubblePosition);
    };
  }, [isWhiteboardMode]);

  useEffect(() => {
    if (!isWhiteboardMode || !whiteboardBubbleOpen) return;

    const measureMenu = () => {
      const rect = whiteboardBubbleMenuRef.current?.getBoundingClientRect();
      if (!rect) return;
      setWhiteboardBubbleMenuSize((prev) => {
        if (Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5) {
          return prev;
        }
        return { width: rect.width, height: rect.height };
      });
    };

    measureMenu();
    const rafId = window.requestAnimationFrame(measureMenu);
    window.addEventListener("resize", measureMenu);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measureMenu);
    viewport?.addEventListener("scroll", measureMenu);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measureMenu);
      viewport?.removeEventListener("resize", measureMenu);
      viewport?.removeEventListener("scroll", measureMenu);
    };
  }, [isWhiteboardMode, whiteboardBubbleOpen]);

  useEffect(() => {
    if (isWhiteboardMode || !quickShareOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (actionsBubbleButtonRef.current?.contains(target)) return;
      if (actionsMenuRef.current?.contains(target)) return;
      if (quickSharePopoverRef.current?.contains(target)) return;
      setQuickShareOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setQuickShareOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isWhiteboardMode, quickShareOpen]);

  useEffect(() => {
    if (isWhiteboardMode || !myBoardsOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (actionsBubbleButtonRef.current?.contains(target)) return;
      if (actionsMenuRef.current?.contains(target)) return;
      if (myBoardsPopoverRef.current?.contains(target)) return;
      setMyBoardsOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMyBoardsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isWhiteboardMode, myBoardsOpen]);

  useEffect(() => {
    if (isWhiteboardMode || !quickShareOnboardingOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (quickShareOnboardingCardRef.current?.contains(target)) return;
      dismissQuickShareOnboarding(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismissQuickShareOnboarding(false);
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isWhiteboardMode, quickShareOnboardingOpen]);

  useEffect(() => {
    if (!quickShareOnboardingOpen) {
      setQuickShareOnboardingEntered(false);
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      setQuickShareOnboardingEntered(true);
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [quickShareOnboardingOpen]);

  useEffect(() => {
    if (isWhiteboardMode || !actionsOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (actionsBubbleButtonRef.current?.contains(target)) return;
      if (actionsMenuRef.current?.contains(target)) return;
      if (quickSharePopoverRef.current?.contains(target)) return;
      if (myBoardsPopoverRef.current?.contains(target)) return;
      setActionsOpen(false);
      setQuickShareOpen(false);
      setMyBoardsOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setActionsOpen(false);
      setQuickShareOpen(false);
      setMyBoardsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isWhiteboardMode, actionsOpen]);

  useEffect(() => {
    if (!isWhiteboardMode || !whiteboardBubbleOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (whiteboardBubbleButtonRef.current?.contains(target)) return;
      if (whiteboardBubbleMenuRef.current?.contains(target)) return;
      setWhiteboardBubbleOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
    };
  }, [isWhiteboardMode, whiteboardBubbleOpen]);

  const handlePlayPress = () => {
    if (isPaused) {
      surfaceRef.current?.resumePlayback();
    } else {
      surfaceRef.current?.play();
    }
    setToolsOpen(false);
    setControlsOpen(false);
  };

  const handlePausePress = () => {
    surfaceRef.current?.pausePlayback();
    setControlsOpen(false);
  };

  const handleToolsBackdropPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    setToolsOpen(false);
  };

  const handlePlaybackSpeedChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextIndex = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(nextIndex)) return;
    const boundedIndex = Math.max(0, Math.min(PLAYBACK_SPEED_OPTIONS.length - 1, nextIndex));
    const nextSpeed = PLAYBACK_SPEED_OPTIONS[boundedIndex]?.multiplier;
    if (nextSpeed == null) return;
    setPlaybackSpeedMultiplier(nextSpeed);
  };

  const phaseItems = Array.from({ length: phaseCount }, (_, index) => index + 1);
  const activeTacticalPenColor = tacticalPenColor;
  const refreshSavedBoards = () => {
    setSavedBoards(loadAllBoards());
  };
  const showQuickBoardNotice = (message: string) => {
    if (quickBoardFeedbackTimerRef.current !== null) {
      window.clearTimeout(quickBoardFeedbackTimerRef.current);
    }
    setQuickBoardFeedback(message);
    quickBoardFeedbackTimerRef.current = window.setTimeout(() => {
      setQuickBoardFeedback(null);
      quickBoardFeedbackTimerRef.current = null;
    }, 2600);
  };
  const captureCurrentBoardSnapshot = (): QuickBoardBoardState | null => {
    const surface = surfaceRef.current;
    if (!surface || isWhiteboardMode || isStatsMode) return null;
    return captureQuickBoardSnapshot(surface);
  };
  const captureCurrentBoardSignature = (): string | null => {
    const snapshot = captureCurrentBoardSnapshot();
    return serializeBoardState(snapshot);
  };
  const hasUnsavedBoardChanges = (): boolean => {
    const currentSignature = captureCurrentBoardSignature();
    if (!currentSignature) return false;
    const baselineSignature = boardBaselineSignatureRef.current;
    if (!baselineSignature) return true;
    if (currentSignature !== baselineSignature) return true;
    return JSON.stringify(textAnnotations) !== textAnnotationsBaselineRef.current;
  };
  const clearActiveBoardDraft = () => {
    clearQuickBoardDraft();
    lastBoardDraftSignatureRef.current = null;
  };
  const extractItemsFromBoardState = (boardState: QuickBoardBoardState): TacticalItem[] =>
    Array.isArray(boardState.items)
      ? boardState.items
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const item = entry as Record<string, unknown>;
            const id = typeof item.id === "string" ? item.id.trim() : "";
            const type = item.type;
            const x = typeof item.x === "number" && Number.isFinite(item.x) ? Math.max(0, Math.min(100, item.x)) : null;
            const y = typeof item.y === "number" && Number.isFinite(item.y) ? Math.max(0, Math.min(100, item.y)) : null;
            if (
              id.length <= 0 ||
              x == null ||
              y == null ||
              (type !== "cone" &&
                type !== "discCone" &&
                type !== "pole" &&
                type !== "miniGoal" &&
                type !== "mannequin" &&
                type !== "ladder" &&
                type !== "hurdle" &&
                type !== "tackleBag" &&
                type !== "footballSmall" &&
                type !== "football" &&
                type !== "footballLarge" &&
                type !== "sliotarSmall" &&
                type !== "sliotar" &&
                type !== "sliotarLarge")
            ) {
              return null;
            }
            return {
              id,
              type,
              x,
              y,
              ...(typeof item.rotation === "number" && Number.isFinite(item.rotation) ? { rotation: item.rotation } : {}),
              ...(typeof item.scale === "number" && Number.isFinite(item.scale) ? { scale: item.scale } : {}),
            } satisfies TacticalItem;
          })
          .filter((entry): entry is TacticalItem => entry != null)
      : [];
  const confirmDiscardUnsavedBoardChanges = (reason: "load" | "reset"): boolean => {
    if (!hasUnsavedBoardChanges()) return true;
    const message =
      reason === "load"
        ? "Load this board and discard unsaved changes on the current board?"
        : "Reset this board and discard unsaved changes?";
    return window.confirm(message);
  };
  const closeActionsMenu = () => {
    setActionsOpen(false);
    setQuickShareOpen(false);
    setMyBoardsOpen(false);
  };
  const closeMyBoardsMenu = () => setMyBoardsOpen(false);
  const closeControlsMenu = () => setControlsOpen(false);
  const goHome = () => {
    closeActionsMenu();
    window.location.assign("/board");
  };
  const closeQuickShareMenu = () => setQuickShareOpen(false);
  const showShareTip = (message: string) => {
    if (shareTipTimerRef.current !== null) {
      window.clearTimeout(shareTipTimerRef.current);
    }
    setShareTipMessage(message);
    shareTipTimerRef.current = window.setTimeout(() => {
      setShareTipMessage(null);
      shareTipTimerRef.current = null;
    }, 4000);
  };
  const handleQuickShareRecordClip = () => {
    if (!slateCanRecord()) {
      showShareTip("Recording not supported in this browser.\niPhone: use Screen Recording from Control Centre.");
      return;
    }
    setSlateRecordPhase("panel");
  };
  const handleQuickShareSnapshot = async () => {
    if (isExportingSnapshotRef.current) return;
    const surface = surfaceRef.current;
    console.debug("[PV share] surface:", surface ? "ok" : "null", "exportImageCanvas:", typeof surface?.exportImageCanvas);
    if (!surface) {
      showShareTip("Board not ready — please try again.");
      return;
    }
    isExportingSnapshotRef.current = true;
    closeQuickShareMenu();
    surface.pausePlayback();
    try {
      const file = await exportBoardSetupAsPng(surface, { textAnnotations });
      if (!file) {
        console.debug("[PV share] exportBoardSetupAsPng returned null");
        showShareTip("Could not generate image — please try again.");
        return;
      }
      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof (navigator as Navigator & { canShare?: (data?: ShareData) => boolean }).canShare === "function" &&
        (navigator as Navigator & { canShare?: (data?: ShareData) => boolean }).canShare!({ files: [file] });
      if (canShareFiles) {
        try {
          await navigator.share({ title: "PáircVision Board", files: [file] });
        } catch {
          // User cancelled the share sheet — no error toast needed.
        }
      } else {
        const url = URL.createObjectURL(file);
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = "paircvision-board.png";
          a.click();
          showShareTip("Image saved — check your downloads.");
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error("[PV share] export threw:", err);
      showShareTip("Share failed — please try again.");
    } finally {
      isExportingSnapshotRef.current = false;
    }
  };
  const openMyBoardsEntry = () => {
    setQuickShareOpen(false);
    setActionsOpen(false);
    refreshSavedBoards();
    setMyBoardsOpen(true);
  };
  const resumeRecoveredBoardDraft = () => {
    const draft = pendingRecoveredBoardDraft;
    const surface = surfaceRef.current;
    if (!draft || !surface) {
      showQuickBoardNotice("Recovered board unavailable");
      setPendingRecoveredBoardDraft(null);
      setIsRecoveredBoardPromptVisible(false);
      return;
    }
    const restored = restoreQuickBoardSnapshot(surface, draft);
    if (!restored) {
      showQuickBoardNotice("Could not recover board");
      clearActiveBoardDraft();
      setPendingRecoveredBoardDraft(null);
      return;
    }
    const recoveredAnnotations = draft.textAnnotations ?? [];
    setItems(extractItemsFromBoardState(draft));
    setPhaseCount(Array.isArray(draft.phases) ? draft.phases.length : 0);
    setTextAnnotations(recoveredAnnotations);
    setTextToolActive(false);
    setIsPlaying(false);
    setIsPaused(false);
    setLoadedBoardName("Recovered draft");
    const draftSignature = serializeBoardState(draft);
    boardBaselineSignatureRef.current = draftSignature;
    textAnnotationsBaselineRef.current = JSON.stringify(recoveredAnnotations);
    lastBoardDraftSignatureRef.current = draftSignature;
    clearActiveBoardDraft();
    setPendingRecoveredBoardDraft(null);
    setIsRecoveredBoardPromptVisible(false);
    showQuickBoardNotice("Recovered unsaved board");
  };
  const discardRecoveredBoardDraft = () => {
    clearActiveBoardDraft();
    setPendingRecoveredBoardDraft(null);
    setIsRecoveredBoardPromptVisible(false);
    showQuickBoardNotice("Recovered board draft discarded");
  };
  const handleSaveCurrentBoard = () => {
    const surface = surfaceRef.current;
    if (!surface || isWhiteboardMode || isStatsMode) {
      showQuickBoardNotice("PáircVision Board not ready");
      return;
    }
    if (hasReachedQuickBoardSaveLimit()) {
      showQuickBoardNotice(
        `Board limit reached (${MAX_QUICKBOARD_SAVES}).\nDelete old boards or export/share important ones.`,
      );
      return;
    }
    const snapshot = captureQuickBoardSnapshot(surface);
    if (!snapshot) {
      showQuickBoardNotice("Could not capture board");
      return;
    }
    const now = new Date();
    const fallbackName = `Board ${now.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })}`;
    const boardStateToSave = textAnnotations.length > 0
      ? { ...snapshot, textAnnotations }
      : snapshot;
    const saved = saveBoard({ name: fallbackName, boardState: boardStateToSave });
    if (!saved) {
      showQuickBoardNotice("Save failed");
      return;
    }
    boardBaselineSignatureRef.current = serializeBoardState(snapshot);
    textAnnotationsBaselineRef.current = JSON.stringify(textAnnotations);
    clearActiveBoardDraft();
    setPendingRecoveredBoardDraft(null);
    latestThumbnailSaveTokenRef.current += 1;
    const thumbnailSaveToken = latestThumbnailSaveTokenRef.current;
    refreshSavedBoards();
    showQuickBoardNotice("Board saved");
    setLastBoardSavedAtMillis(saved.updatedAt);
    void generateQuickBoardThumbnail(surface).then((thumbnail) => {
      if (!thumbnail) return;
      if (thumbnailSaveToken !== latestThumbnailSaveTokenRef.current) return;
      const updated = setBoardThumbnail(saved.id, thumbnail);
      if (!updated) return;
      refreshSavedBoards();
    });
  };
  const handleOpenSavedBoard = (boardId: string) => {
    const surface = surfaceRef.current;
    if (!surface) {
      showQuickBoardNotice("Board unavailable");
      return;
    }
    if (!confirmDiscardUnsavedBoardChanges("load")) return;
    const saved = loadBoard(boardId);
    if (!saved) {
      showQuickBoardNotice("Board not found");
      refreshSavedBoards();
      return;
    }
    const restored = restoreQuickBoardSnapshot(surface, saved.boardState);
    if (!restored) {
      showQuickBoardNotice("Load failed");
      return;
    }
    const loadedAnnotations = saved.boardState.textAnnotations ?? [];
    setItems(extractItemsFromBoardState(saved.boardState));
    setPhaseCount(Array.isArray(saved.boardState.phases) ? saved.boardState.phases.length : 0);
    setTextAnnotations(loadedAnnotations);
    setTextToolActive(false);
    setIsPlaying(false);
    setIsPaused(false);
    setMyBoardsOpen(false);
    setActionsOpen(false);
    setQuickShareOpen(false);
    boardBaselineSignatureRef.current = serializeBoardState(saved.boardState);
    textAnnotationsBaselineRef.current = JSON.stringify(loadedAnnotations);
    clearActiveBoardDraft();
    setPendingRecoveredBoardDraft(null);
    showQuickBoardNotice("Board loaded");
    setLoadedBoardName(saved.name);
    syncTeamCounts();
  };
  const lastBoardSavedLabel =
    lastBoardSavedAtMillis != null ? formatBoardUpdatedAt(lastBoardSavedAtMillis) : null;
  const handleRenameBoard = (boardId: string, currentName: string) => {
    const drafted = window.prompt("Rename board", currentName);
    if (drafted == null) return;
    const renamed = renameBoard(boardId, sanitizeBoardName(drafted));
    if (!renamed) {
      showQuickBoardNotice("Rename failed");
      return;
    }
    refreshSavedBoards();
    showQuickBoardNotice("Board renamed");
  };
  const handleDuplicateBoard = (boardId: string) => {
    const duplicated = duplicateBoard(boardId);
    if (!duplicated) {
      showQuickBoardNotice("Duplicate failed");
      return;
    }
    refreshSavedBoards();
    showQuickBoardNotice("Board duplicated");
  };
  const handleDeleteBoard = (boardId: string, name: string) => {
    const confirmed = window.confirm(`Delete "${name}"?`);
    if (!confirmed) return;
    const deleted = deleteBoard(boardId);
    if (!deleted) {
      showQuickBoardNotice("Delete failed");
      return;
    }
    refreshSavedBoards();
    showQuickBoardNotice("Board deleted");
  };
  const dismissQuickShareOnboarding = (openQuickShareAfter = false) => {
    setQuickShareOnboardingOpen(false);
    setQuickShareOnboardingSeen(true);
    safeWriteLocalStorageFlag(QUICK_SHARE_ONBOARDING_STORAGE_KEY, true);
    if (openQuickShareAfter) {
      setQuickShareOpen(true);
    }
  };
  const openQuickShareEntry = () => {
    closeActionsMenu();
    setQuickShareOpen(true);
    if (quickShareOnboardingSeen) return;
    showShareTip("Best results:\nUse your phone’s screen recorder.\nShare the saved video directly to WhatsApp.");
    setQuickShareOnboardingSeen(true);
    safeWriteLocalStorageFlag(QUICK_SHARE_ONBOARDING_STORAGE_KEY, true);
  };
  useEffect(() => {
    return () => {
      if (shareTipTimerRef.current !== null) {
        window.clearTimeout(shareTipTimerRef.current);
      }
      if (quickBoardFeedbackTimerRef.current !== null) {
        window.clearTimeout(quickBoardFeedbackTimerRef.current);
      }
    };
  }, []);
  const openWhiteboardHomeConfirm = () => {
    if (whiteboardHomeConfirmOpen) return;
    setWhiteboardHomeConfirmOpen(true);
    if (!whiteboardHomeConfirmHistoryRef.current) {
      window.history.pushState(
        { ...(window.history.state as Record<string, unknown> | null), whiteboardHomeConfirmOpen: true },
        "",
        window.location.href,
      );
      whiteboardHomeConfirmHistoryRef.current = true;
    }
  };
  const closeWhiteboardHomeConfirm = () => {
    if (whiteboardHomeConfirmHistoryRef.current) {
      whiteboardHomeConfirmHistoryRef.current = false;
      window.history.back();
      return;
    }
    setWhiteboardHomeConfirmOpen(false);
  };
  const confirmWhiteboardGoHome = () => {
    whiteboardHomeConfirmHistoryRef.current = false;
    setWhiteboardHomeConfirmOpen(false);
    goHome();
  };

  useEffect(() => {
    if (!isWhiteboardMode || !whiteboardHomeConfirmOpen) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (whiteboardHomeButtonRef.current?.contains(target)) return;
      if (whiteboardHomeConfirmRef.current?.contains(target)) return;
      closeWhiteboardHomeConfirm();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeWhiteboardHomeConfirm();
    };
    const handlePopState = () => {
      if (!whiteboardHomeConfirmOpen) return;
      whiteboardHomeConfirmHistoryRef.current = false;
      setWhiteboardHomeConfirmOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDownOutside);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutside);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isWhiteboardMode, whiteboardHomeConfirmOpen]);

  useEffect(() => {
    if (isPlaybackLocked) setBallPopupStep(null);
  }, [isPlaybackLocked]);

  useEffect(() => {
    if (!controlsOpen) setBallPopupStep(null);
  }, [controlsOpen]);

  const setWhiteboardCount = (team: "BLUE" | "RED", count: number) => {
    const clamped = Math.max(1, Math.min(15, Math.floor(count)));
    if (team === "BLUE") {
      setWhiteboardBlueCount(clamped);
      return;
    }
    setWhiteboardRedCount(clamped);
  };

  const applyWhiteboardTool = (tool: WhiteboardToolAction) => {
    const surface = surfaceRef.current;
    if (!surface) return;
    setWhiteboardTool(tool);
    surface.setWhiteboardDrawTool(tool);
    surface.setWhiteboardDrawColor(whiteboardPenColor);
  };

  const applyWhiteboardPenColor = (color: number) => {
    setWhiteboardPenColor(color);
    surfaceRef.current?.setWhiteboardDrawColor(color);
  };

  const applyTacticalPenColor = (color: number) => {
    if (isPortraitViewingMode) return;
    setTacticalPenColor(color);
    surfaceRef.current?.setWhiteboardDrawColor(color);
  };

  const setRouteCaptureMode = (enabled: boolean) => {
    if (isPortraitViewingMode) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.setRouteCaptureMode(enabled);
  };

  const clearCommittedRoutes = () => {
    if (isPortraitViewingMode || isPlaybackLocked) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    surface.clearRoutes();
    setMovementModePillSelection("move");
    setItemMode("edit");
    setTacticalTool("move");
    surface.setWhiteboardDrawTool("move");
  };

  const applyTacticalTool = (tool: WhiteboardToolAction) => {
    if (isPortraitViewingMode && tool !== "move") return;
    setTextToolActive(false);
    const surface = surfaceRef.current;
    if (!surface) return;
    if (tool !== "move") {
      setRouteCaptureMode(false);
    }
    setTacticalTool(tool);
    surface.setWhiteboardDrawTool(tool);
    surface.setWhiteboardDrawColor(tacticalPenColor);
  };
  const applyTacticalToolFromMenu = (tool: WhiteboardToolAction) => {
    applyTacticalTool(tool);
    if (isCompactLandscapeToolsMenu) {
      setToolsOpen(false);
    }
  };
  const activateTextTool = () => {
    if (isPortraitViewingMode || isPlaybackLocked) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    setTextToolActive(true);
    setTacticalTool("move");
    surface.setWhiteboardDrawTool("move");
    setRouteCaptureMode(false);
    if (isCompactLandscapeToolsMenu) setToolsOpen(false);
  };

  const syncTeamCounts = () => {
    const board = surfaceRef.current?.exportBoardState();
    if (!board) return;
    const ps = board.players as Array<Record<string, unknown>>;
    const bluePs = ps.filter((p) => p.team === "BLUE");
    const redPs = ps.filter((p) => p.team === "RED");
    setBluePlayerCount(bluePs.length);
    setRedPlayerCount(redPs.length);
    setBlueActiveNumbers(new Set(bluePs.map((p) => Number(p.number)).filter((n) => n >= 1 && n <= 15)));
    setRedActiveNumbers(new Set(redPs.map((p) => Number(p.number)).filter((n) => n >= 1 && n <= 15)));
  };

  const clearTacticalDrawings = () => {
    if (isPortraitViewingMode) return;
    surfaceRef.current?.clearWhiteboardStrokes();
  };

  const resetBoardFromTools = () => {
    if (isPortraitViewingMode) return;
    if (!confirmDiscardUnsavedBoardChanges("reset")) return;
    const surface = surfaceRef.current;
    surface?.reset();
    setIsPlaying(false);
    setIsPaused(false);
    setTextAnnotations([]);
    setTextToolActive(false);
    const resetSnapshot = captureCurrentBoardSnapshot();
    boardBaselineSignatureRef.current = serializeBoardState(resetSnapshot);
    textAnnotationsBaselineRef.current = "[]";
    clearActiveBoardDraft();
    setPendingRecoveredBoardDraft(null);
    syncTeamCounts();
  };

  const handleNewBoard = () => {
    if (isWhiteboardMode || isStatsMode || isPortraitViewingMode) return;
    const surface = surfaceRef.current;
    if (!surface) {
      showQuickBoardNotice("PáircVision Board not ready");
      return;
    }
    const confirmed = window.confirm("Start a new board?\nUnsaved changes on the current board will be lost.");
    if (!confirmed) return;
    surface.newBoard();
    const pristineSnapshot = captureCurrentBoardSnapshot();
    boardBaselineSignatureRef.current = serializeBoardState(pristineSnapshot);
    textAnnotationsBaselineRef.current = "[]";
    clearActiveBoardDraft();
    setPendingRecoveredBoardDraft(null);
    tacticalItemCounterRef.current = 0;
    setItems([]);
    setTextAnnotations([]);
    setTextToolActive(false);
    setMovementModePillSelection("move");
    setRouteState((previous) => ({ ...previous, isRouteCaptureMode: false, routeCount: 0 }));
    setItemMode("locked");
    setTacticalTool("move");
    setKitEditorState(null);
    setPhaseCount(0);
    setIsPlaying(false);
    setIsPaused(false);
    setPhasesOpen(false);
    setToolsOpen(false);
    setControlsOpen(false);
    closeActionsMenu();
    showQuickBoardNotice("New board ready");
    syncTeamCounts();
  };

  const openMenuFromTools = () => {
    setToolsOpen(false);
    setActionsOpen((open) => {
      const next = !open;
      if (next) {
        setControlsOpen(false);
        setQuickShareOpen(false);
        setMyBoardsOpen(false);
      }
      return next;
    });
  };

  const addTacticalPlayer = (team: "BLUE" | "RED") => {
    if (isPortraitViewingMode) return;
    surfaceRef.current?.addTacticalPlayer(team);
    setKitEditorState(null);
    syncTeamCounts();
  };

  const removeTacticalPlayer = (team: "BLUE" | "RED") => {
    if (isPortraitViewingMode) return;
    surfaceRef.current?.removeTacticalPlayer(team);
    setKitEditorState(null);
    syncTeamCounts();
  };

  const applyTeamNumbers = (team: "BLUE" | "RED", numbers: Set<number>) => {
    const surface = surfaceRef.current;
    if (!surface || isPortraitViewingMode) return;
    const boardState = surface.exportBoardState();
    const prefix = team === "BLUE" ? "B" : "R";
    const teamColor = team === "BLUE" ? "blue" : "red";
    const otherPlayers = (boardState.players as Array<Record<string, unknown>>).filter(
      (p) => p.team !== team,
    );
    const teamPlayers = Array.from(numbers)
      .sort((a, b) => a - b)
      .map((number) => {
        const pos = getGaelicFormationPos(team, number);
        return { id: `${prefix}${number}`, number, team, teamColor, x: pos.x, y: pos.y };
      });
    surface.importBoardState({ ...boardState, players: [...otherPlayers, ...teamPlayers] });
    setKitEditorState(null);
    syncTeamCounts();
  };

  const fillTeam = (team: "BLUE" | "RED") => {
    applyTeamNumbers(team, new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
  };

  const clearTeam = (team: "BLUE" | "RED") => {
    applyTeamNumbers(team, new Set());
  };

  const togglePlayerNumber = (team: "BLUE" | "RED", number: number) => {
    const currentNumbers = team === "BLUE" ? blueActiveNumbers : redActiveNumbers;
    const next = new Set(currentNumbers);
    if (next.has(number)) {
      next.delete(number);
    } else {
      next.add(number);
    }
    applyTeamNumbers(team, next);
  };

  const addItem = (type: TacticalItem["type"]) => {
    if (isPortraitViewingMode) return;
    tacticalItemCounterRef.current += 1;
    const nextId = `item-${tacticalItemCounterRef.current}`;
    setItems((previous) => {
      const index = previous.length;
      const column = index % 3;
      const row = Math.floor(index / 3);
      const nextX = Math.min(78, 30 + column * 12);
      const nextY = Math.min(78, 26 + row * 10);
      return [...previous, { id: nextId, type, x: nextX, y: nextY }];
    });
  };

  const clearItems = () => {
    if (isPortraitViewingMode) return;
    setItems([]);
  };

  const freeBall = () => {
    if (isPortraitViewingMode || isPlaybackLocked) return;
    setRouteCaptureMode(false);
    surfaceRef.current?.freeBall();
    setMovementModePillSelection("ball");
    setTacticalTool("move");
    surfaceRef.current?.setWhiteboardDrawTool("move");
  };

  const handleBallButtonPress = () => {
    if (isPortraitViewingMode || isPlaybackLocked) return;
    setBallPopupStep((prev) => (prev === null ? "root" : null));
  };

  const onSelectBallSize = (type: TacticalItem["type"]) => {
    tacticalItemCounterRef.current += 1;
    const nextId = `item-${tacticalItemCounterRef.current}`;
    setItems((previous) => {
      const withoutBalls = previous.filter((item) => !isBallItemType(item.type));
      const index = withoutBalls.length;
      const column = index % 3;
      const row = Math.floor(index / 3);
      const nextX = Math.min(78, 30 + column * 12);
      const nextY = Math.min(78, 26 + row * 10);
      return [...withoutBalls, { id: nextId, type, x: nextX, y: nextY }];
    });
    setBallPopupStep(null);
    applyMovementModePillSelection("ball");
  };

  const removeCurrentBall = () => {
    setItems((previous) => previous.filter((item) => !isBallItemType(item.type)));
    setBallPopupStep(null);
  };

  const applyMovementModePillSelection = (nextMode: MovementModePillOption) => {
    if (isPortraitViewingMode || isPlaybackLocked) return;
    setMovementModePillSelection(nextMode);
    if (nextMode === "move") {
      setRouteCaptureMode(false);
      setItemMode("edit");
      applyTacticalTool("move");
      return;
    }
    if (nextMode === "route") {
      setItemMode("locked");
      applyTacticalTool("move");
      setRouteCaptureMode(true);
      return;
    }
    setItemMode("locked");
    freeBall();
  };

  const handleWhiteboardBubblePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const viewport = getViewportRect();
    const currentPosition =
      whiteboardBubblePosition == null
        ? getDefaultWhiteboardBubblePosition(viewport)
        : whiteboardBubblePosition;
    suppressWhiteboardBubbleClickRef.current = false;
    whiteboardBubbleDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: currentPosition.left,
      startTop: currentPosition.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleWhiteboardBubblePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = whiteboardBubbleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) >= 4) {
      drag.moved = true;
    }
    const viewport = getViewportRect();
    setWhiteboardBubblePosition(
      clampWhiteboardBubblePosition(
        {
          left: drag.startLeft + deltaX,
          top: drag.startTop + deltaY,
        },
        viewport,
      ),
    );
  };

  const finishWhiteboardBubbleDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = whiteboardBubbleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      suppressWhiteboardBubbleClickRef.current = true;
    }
    whiteboardBubbleDragRef.current = null;
  };

  const handleWhiteboardBubbleClick = () => {
    if (suppressWhiteboardBubbleClickRef.current) {
      suppressWhiteboardBubbleClickRef.current = false;
      return;
    }
    setWhiteboardBubbleOpen((open) => !open);
  };

  const activeKitPlayer: TacticalPlayerKitSnapshot | null =
    kitEditorState == null ? null : surfaceRef.current?.getTacticalPlayer(kitEditorState.playerId) ?? null;
  const kitEditorPosition =
    kitEditorState == null
      ? null
      : clampKitEditorPosition(
          {
            left: kitEditorState.anchorLeft + 8,
            top: kitEditorState.anchorTop + 8,
          },
          getViewportRect(),
        );

  const applyPlayerKitPatch = (patch: TacticalPlayerKitPatch) => {
    const editor = kitEditorState;
    const surface = surfaceRef.current;
    if (!editor || !surface) return;
    surface.patchTacticalPlayer(editor.playerId, patch);
    setKitEditorState((previous) =>
      previous == null
        ? previous
        : {
            ...previous,
            revision: previous.revision + 1,
          },
    );
  };

  const handleKitInitialsChange = (rawValue: string) => {
    const sanitized = sanitizeInitials(rawValue) ?? "";
    applyPlayerKitPatch({ initials: sanitized });
  };

  const whiteboardBubbleStyle =
    whiteboardBubblePosition == null
      ? undefined
      : {
          left: `${whiteboardBubblePosition.left}px`,
          top: `${whiteboardBubblePosition.top}px`,
          right: "auto",
          bottom: "auto",
          touchAction: "none",
          cursor: whiteboardBubbleDragRef.current ? "grabbing" : "grab",
        };
  const whiteboardBubbleMenuStyle = (() => {
    const viewport = getViewportRect();
    const availableHeight = viewport.height - WHITEBOARD_BUBBLE_MARGIN * 2;
    const preferredHeight = whiteboardBubbleMenuSize.height + 40;
    return {
      maxHeight: `${Math.max(140, Math.min(availableHeight, preferredHeight))}px`,
      zIndex: 22,
    } as const;
  })();
  const actionsBubbleStyle = isPortraitViewingMode ? PORTRAIT_ACTIONS_BUBBLE_STYLE : ACTIONS_BUBBLE_STYLE;
  const actionsPopoutStyle = isPortraitViewingMode ? PORTRAIT_ACTIONS_POPOUT_STYLE : ACTIONS_POPOUT_STYLE;
  // In landscape the base style uses overflow:hidden which clips the recording
  // preview when it's taller than the default popover. Override to scroll.
  const quickSharePopoverStyle: CSSProperties = isPortraitViewingMode
    ? PORTRAIT_QUICK_SHARE_POPOUT_STYLE
    : { ...QUICK_SHARE_POPOUT_STYLE, overflowY: "auto", maxHeight: "min(78vh, 400px)" };
  const myBoardsPopoverStyle = isPortraitViewingMode ? PORTRAIT_MY_BOARDS_POPOUT_STYLE : MY_BOARDS_POPOUT_STYLE;
  const isToolsOverlayOpen = !isWhiteboardMode && !isPortraitViewingMode && toolsOpen;
  const isCompactLandscapeTools = !isWhiteboardMode && !isPortraitViewingMode && isCompactLandscapeToolsMenu;
  const isIphoneLandscapeTools = isCompactLandscapeTools && isIphoneLandscapeToolsMenu;
  const compactLandscapeViewportWidth = isCompactLandscapeTools ? getViewportRect().width : 0;
  const isTightCompactLandscapeTools = isCompactLandscapeTools && compactLandscapeViewportWidth <= 760;
  const mobileCoachHubOverlayStyle = isIphoneLandscapeTools ? IPHONE_LANDSCAPE_TOOLS_OVERLAY_STYLE : MOBILE_COACH_HUB_OVERLAY_STYLE;
  const mobileCoachHubPanelStyle = isCompactLandscapeTools
    ? {
        ...MOBILE_COACH_HUB_PANEL_STYLE,
        ...(isTightCompactLandscapeTools
          ? {
              width: "min(49vw, 292px)",
              gap: "3px",
              padding: "5px",
            }
          : null),
        ...(isIphoneLandscapeTools ? IPHONE_LANDSCAPE_TOOLS_PANEL_STYLE : null),
      }
    : MOBILE_COACH_HUB_PANEL_STYLE;
  const toolsPortalOverlayStyle: CSSProperties = {
    ...mobileCoachHubOverlayStyle,
    pointerEvents: "auto",
  };
  const toolsPortalCompactPanelStyle: CSSProperties = {
    ...mobileCoachHubPanelStyle,
    pointerEvents: "auto",
    zIndex: 25,
  };
  const toolsPortalPanelStyle: CSSProperties = {
    ...COACH_HUB_PANEL_STYLE,
    pointerEvents: "auto",
    zIndex: 25,
  };
  const mobileCoachHubBodyStyle = isIphoneLandscapeTools ? IPHONE_LANDSCAPE_TOOLS_BODY_STYLE : MOBILE_COACH_HUB_BODY_STYLE;
  const coachHubSectionTitleStyle = isCompactLandscapeTools
    ? {
        ...COACH_HUB_SECTION_TITLE_STYLE,
        fontSize: "8px",
        letterSpacing: "0.2px",
        color: "rgba(202, 222, 213, 0.86)",
        marginTop: "0px",
      }
    : COACH_HUB_SECTION_TITLE_STYLE;
  const coachHubTabGridStyle = isCompactLandscapeTools
    ? {
        ...COACH_HUB_TAB_GRID_STYLE,
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: isTightCompactLandscapeTools ? "1px" : "2px",
        padding: isTightCompactLandscapeTools ? "1px" : "2px",
        alignItems: "stretch",
        borderRadius: "9px",
        border: "1px solid rgba(129, 157, 144, 0.12)",
        background: "rgba(9, 16, 20, 0.44)",
      }
    : COACH_HUB_TAB_GRID_STYLE;
  const coachHubTabButtonStyle = isCompactLandscapeTools
    ? {
        ...COACH_HUB_TAB_BUTTON_STYLE,
        height: isTightCompactLandscapeTools ? "22px" : "24px",
        borderRadius: "999px",
        fontSize: isTightCompactLandscapeTools ? "8.4px" : "8.8px",
        letterSpacing: "0.14px",
        padding: isTightCompactLandscapeTools ? "0 3px" : "0 4px",
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        border: "1px solid rgba(127, 156, 142, 0.24)",
        background: "rgba(13, 22, 25, 0.68)",
        color: "rgba(220, 235, 227, 0.9)",
      }
    : COACH_HUB_TAB_BUTTON_STYLE;
  const coachHubTabButtonActiveStyle = isCompactLandscapeTools
    ? {
        ...coachHubTabButtonStyle,
        border: "1px solid rgba(124, 255, 114, 0.42)",
        background: "rgba(124, 255, 114, 0.12)",
        color: "#f1f7f0",
      }
    : COACH_HUB_TAB_BUTTON_ACTIVE_STYLE;
  const coachHubToolButtonStyle = isCompactLandscapeTools
    ? {
        ...COACH_HUB_TOOL_BUTTON_STYLE,
        height: isTightCompactLandscapeTools ? "28px" : "30px",
        borderRadius: "7px",
        fontSize: isTightCompactLandscapeTools ? "8.8px" : "9px",
        padding: isTightCompactLandscapeTools ? "0 3px" : "0 4px",
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        border: "1px solid rgba(127, 156, 142, 0.22)",
        background: "rgba(13, 22, 25, 0.68)",
        color: "#e6f0ea",
      }
    : COACH_HUB_TOOL_BUTTON_STYLE;
  const coachHubToolButtonActiveStyle = isCompactLandscapeTools
    ? {
        ...coachHubToolButtonStyle,
        border: "1px solid rgba(124, 255, 114, 0.46)",
        background: "rgba(124, 255, 114, 0.14)",
        color: "#f7fcff",
      }
    : COACH_HUB_TOOL_BUTTON_ACTIVE_STYLE;
  const coachHubColorGridStyle = isCompactLandscapeTools
    ? {
        ...COACH_HUB_COLOR_GRID_STYLE,
        gap: isTightCompactLandscapeTools ? "1px" : "2px",
      }
    : COACH_HUB_COLOR_GRID_STYLE;
  const coachHubColorButtonStyle = isCompactLandscapeTools
    ? {
        ...COACH_HUB_COLOR_BUTTON_STYLE,
        height: isTightCompactLandscapeTools ? "18px" : "20px",
        border: "1px solid rgba(129, 157, 144, 0.22)",
        background: "rgba(10, 18, 22, 0.7)",
      }
    : COACH_HUB_COLOR_BUTTON_STYLE;
  const coachHubColorSwatchStyle = isCompactLandscapeTools
    ? {
        ...COACH_HUB_COLOR_SWATCH_STYLE,
        width: isTightCompactLandscapeTools ? "10px" : "11px",
        height: isTightCompactLandscapeTools ? "10px" : "11px",
      }
    : COACH_HUB_COLOR_SWATCH_STYLE;
  const coachHubActionButtonStyle = isCompactLandscapeTools
    ? {
        ...COACH_HUB_ACTION_BUTTON_STYLE,
        height: isTightCompactLandscapeTools ? "28px" : "30px",
        borderRadius: "7px",
        fontSize: isTightCompactLandscapeTools ? "8.8px" : "9px",
        padding: isTightCompactLandscapeTools ? "0 3px" : "0 4px",
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        border: "1px solid rgba(127, 156, 142, 0.22)",
        background: "rgba(13, 22, 25, 0.68)",
        color: "#e6f0ea",
      }
    : COACH_HUB_ACTION_BUTTON_STYLE;
  const pitchSurfaceStyle: CSSProperties =
    !isWhiteboardMode && toolsOpen
      ? {
          ...PITCH_STYLE,
          pointerEvents: "none" as const,
        }
      : isWhiteboardMode
        ? PITCH_WHITEBOARD_STYLE
        : PITCH_STYLE;
  const rootShellStyle: CSSProperties = {
    ...(isWhiteboardMode ? ROOT_WHITEBOARD_STYLE : ROOT_STYLE),
    [BOARD_VIEWPORT_HEIGHT_CSS_VAR]: `${Math.max(0, Math.floor(appViewportHeight))}px`,
  } as CSSProperties;

  if (isStatsMode) {
    return (
      <>
        <StatsModeSurface />
      </>
    );
  }

  return (
    <OrientationGate modeLabel="PáircVision Board">
      <div style={rootShellStyle}>
        <style>{`@keyframes tp-rec-pulse{0%,100%{opacity:1}50%{opacity:0.30}}`}</style>
        {!isWhiteboardMode ? <style>{STADIUM_FLOODLIGHT_CSS}</style> : null}
        {!isWhiteboardMode ? <VisionStadiumBackground variant="board" /> : null}
        <div style={isWhiteboardMode ? WHITEBOARD_CONTENT_STYLE : CONTENT_STYLE}>
          <div ref={hostRef} style={pitchSurfaceStyle} />
          {!isWhiteboardMode && isPortraitViewingMode ? <div style={PORTRAIT_INTERACTION_SHIELD_STYLE} aria-hidden="true" /> : null}
          {!isWhiteboardMode && !isPortraitViewingMode ? (
            <SlateTextOverlay
              annotations={textAnnotations}
              active={textToolActive && !toolsOpen && !isPlaybackLocked}
              onAnnotationsChange={setTextAnnotations}
            />
          ) : null}
        </div>
        {!isWhiteboardMode && !isPortraitViewingMode && kitEditorState && activeKitPlayer && kitEditorPosition ? (
          <div
            style={{
              ...KIT_EDITOR_STYLE,
              left: `${kitEditorPosition.left}px`,
              top: `${kitEditorPosition.top}px`,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="false"
            aria-label="Player kit editor"
          >
            <div style={KIT_EDITOR_HEADER_STYLE}>
              <div style={KIT_EDITOR_TAB_ROW_STYLE}>
                {KIT_EDITOR_TABS.map((tab) => (
                  <button
                    key={`kit-editor-tab-${tab.id}`}
                    type="button"
                    style={kitEditorTab === tab.id ? KIT_EDITOR_TAB_BUTTON_ACTIVE_STYLE : KIT_EDITOR_TAB_BUTTON_STYLE}
                    onClick={() => setKitEditorTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button type="button" style={KIT_EDITOR_CLOSE_STYLE} onClick={() => setKitEditorState(null)} aria-label="Close kit editor">
                ×
              </button>
            </div>
            {kitEditorTab === "base" ? (
              <div style={KIT_EDITOR_SECTION_STYLE}>
                <div style={KIT_EDITOR_COLOR_GRID_STYLE}>
                  {KIT_COLOR_CHOICES.map((color) => {
                    const effectiveBaseColor = activeKitPlayer.kitBaseColor ?? (activeKitPlayer.team === "RED" ? "red" : "blue");
                    const isActive = effectiveBaseColor === color;
                    return (
                      <button
                        key={`kit-base-${activeKitPlayer.id}-${color}`}
                        type="button"
                        style={{
                          ...KIT_EDITOR_COLOR_BUTTON_STYLE,
                          ...(isActive ? { boxShadow: "0 0 0 2px rgba(125, 211, 252, 0.95)" } : null),
                        }}
                        aria-label={`Set base colour ${color}`}
                        onClick={() => applyPlayerKitPatch({ kitBaseColor: color })}
                      >
                        <span style={{ ...WHITEBOARD_TOKEN_COLOR_SWATCH_STYLE, background: KIT_COLOR_CSS[color] }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {kitEditorTab === "pattern" ? (
              <div style={KIT_EDITOR_SECTION_STYLE}>
                <div style={KIT_EDITOR_MODE_ROW_STYLE}>
                  {KIT_PATTERN_CHOICES.map((pattern) => {
                    const effectivePattern = activeKitPlayer.kitPattern ?? "plain";
                    const isActive = effectivePattern === pattern;
                    return (
                      <button
                        key={`kit-pattern-${activeKitPlayer.id}-${pattern}`}
                        type="button"
                        style={isActive ? KIT_EDITOR_OPTION_BUTTON_ACTIVE_STYLE : KIT_EDITOR_OPTION_BUTTON_STYLE}
                        onClick={() => applyPlayerKitPatch({ kitPattern: pattern })}
                      >
                        {KIT_PATTERN_LABEL[pattern]}
                      </button>
                    );
                  })}
                </div>
                <div style={KIT_EDITOR_COLOR_GRID_STYLE}>
                  {KIT_COLOR_CHOICES.map((color) => {
                    const effectiveBaseColor = activeKitPlayer.kitBaseColor ?? (activeKitPlayer.team === "RED" ? "red" : "blue");
                    const effectivePatternColor = activeKitPlayer.kitPatternColor ?? (effectiveBaseColor === "white" ? "black" : "white");
                    const isActive = effectivePatternColor === color;
                    return (
                      <button
                        key={`kit-pattern-color-${activeKitPlayer.id}-${color}`}
                        type="button"
                        style={{
                          ...KIT_EDITOR_COLOR_BUTTON_STYLE,
                          ...(isActive ? { boxShadow: "0 0 0 2px rgba(125, 211, 252, 0.95)" } : null),
                        }}
                        aria-label={`Set pattern colour ${color}`}
                        onClick={() => applyPlayerKitPatch({ kitPatternColor: color })}
                      >
                        <span style={{ ...WHITEBOARD_TOKEN_COLOR_SWATCH_STYLE, background: KIT_COLOR_CSS[color] }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {kitEditorTab === "label" ? (
              <div style={KIT_EDITOR_SECTION_STYLE}>
                <div style={KIT_EDITOR_MODE_ROW_STYLE}>
                  {LABEL_MODE_CHOICES.map((modeValue) => {
                    const effectiveLabelMode = activeKitPlayer.labelMode ?? "number";
                    const isActive = effectiveLabelMode === modeValue;
                    return (
                      <button
                        key={`kit-label-mode-${activeKitPlayer.id}-${modeValue}`}
                        type="button"
                        style={isActive ? KIT_EDITOR_OPTION_BUTTON_ACTIVE_STYLE : KIT_EDITOR_OPTION_BUTTON_STYLE}
                        onClick={() => applyPlayerKitPatch({ labelMode: modeValue })}
                      >
                        {modeValue === "number" ? "Number" : "Initials"}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  maxLength={3}
                  value={sanitizeInitials(activeKitPlayer.initials) ?? ""}
                  onChange={(event) => handleKitInitialsChange(event.target.value)}
                  style={{
                    ...KIT_EDITOR_INPUT_STYLE,
                    ...(activeKitPlayer.labelMode === "initials" ? null : { opacity: 0.72 }),
                  }}
                  placeholder="ABC"
                  aria-label="Player initials"
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {isWhiteboardMode ? (
          <>
            <button
              ref={whiteboardBubbleButtonRef}
              type="button"
              style={{
                ...WHITEBOARD_HEAD_BUTTON_BASE_STYLE,
                position: "fixed",
                left: "max(12px, calc(env(safe-area-inset-left, 0px) + 10px))",
                top: "max(12px, calc(env(safe-area-inset-top, 0px) + 10px))",
                zIndex: 23,
                ...(whiteboardBubbleStyle ?? {}),
              }}
              aria-label="Toggle whiteboard bubble controls"
              aria-expanded={whiteboardBubbleOpen}
              onPointerDown={handleWhiteboardBubblePointerDown}
              onPointerMove={handleWhiteboardBubblePointerMove}
              onPointerUp={finishWhiteboardBubbleDrag}
              onPointerCancel={finishWhiteboardBubbleDrag}
              onClick={handleWhiteboardBubbleClick}
            >
              👤
            </button>
            {whiteboardBubbleOpen ? (
              <div
                ref={whiteboardBubbleMenuRef}
                style={{
                  ...WHITEBOARD_COUNT_SELECTOR_STYLE,
                  ...(whiteboardBubbleMenuStyle ?? {}),
                }}
              >
                <div style={WHITEBOARD_PANEL_SECTION_STYLE}>
                  <p style={WHITEBOARD_COUNT_SELECTOR_TITLE_STYLE}>TOOLS</p>
                  <div style={WHITEBOARD_TOOL_GRID_STYLE}>
                    <button
                      type="button"
                      style={whiteboardTool === "move" ? WHITEBOARD_TOOLS_BUTTON_ACTIVE_STYLE : WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => applyWhiteboardTool("move")}
                    >
                      Move
                    </button>
                    <button
                      type="button"
                      style={whiteboardTool === "line" ? WHITEBOARD_TOOLS_BUTTON_ACTIVE_STYLE : WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => applyWhiteboardTool("line")}
                    >
                      Plain
                    </button>
                    <button
                      type="button"
                      style={whiteboardTool === "arrow" ? WHITEBOARD_TOOLS_BUTTON_ACTIVE_STYLE : WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => applyWhiteboardTool("arrow")}
                    >
                      Straight
                    </button>
                    <button
                      type="button"
                      style={whiteboardTool === "curved" ? WHITEBOARD_TOOLS_BUTTON_ACTIVE_STYLE : WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => applyWhiteboardTool("curved")}
                    >
                      Curved
                    </button>
                    <button
                      type="button"
                      style={whiteboardTool === "dashed" ? WHITEBOARD_TOOLS_BUTTON_ACTIVE_STYLE : WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => applyWhiteboardTool("dashed")}
                    >
                      Dashed
                    </button>
                    <button
                      type="button"
                      style={whiteboardTool === "wavy" ? WHITEBOARD_TOOLS_BUTTON_ACTIVE_STYLE : WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => applyWhiteboardTool("wavy")}
                    >
                      Wavy
                    </button>
                    <button
                      type="button"
                      style={whiteboardTool === "eraser" ? WHITEBOARD_TOOLS_BUTTON_ACTIVE_STYLE : WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => applyWhiteboardTool("eraser")}
                    >
                      Eraser
                    </button>
                    <button
                      type="button"
                      style={WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => surfaceRef.current?.undoWhiteboardStroke()}
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      style={WHITEBOARD_TOOLS_BUTTON_STYLE}
                      onClick={() => surfaceRef.current?.clearWhiteboardStrokes()}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div style={WHITEBOARD_PANEL_SECTION_STYLE}>
                  <p style={WHITEBOARD_SUBSECTION_TITLE_STYLE}>COLOUR</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "4px" }}>
                    {WHITEBOARD_PEN_COLOR_CHOICES.map((choice) => {
                      const isActive = whiteboardPenColor === choice.value;
                      return (
                        <button
                          key={`whiteboard-pen-color-${choice.label.toLowerCase()}`}
                          type="button"
                          aria-label={`Set pen colour ${choice.label}`}
                          style={{
                            ...WHITEBOARD_TOKEN_COLOR_OPTION_STYLE,
                            width: "100%",
                            ...(isActive
                              ? {
                                  boxShadow: "0 0 0 2px rgba(125, 211, 252, 0.9)",
                                  border: "1px solid rgba(125, 211, 252, 0.75)",
                                }
                              : null),
                          }}
                          onClick={() => applyWhiteboardPenColor(choice.value)}
                        >
                          <span style={{ ...WHITEBOARD_TOKEN_COLOR_SWATCH_STYLE, background: choice.css }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={WHITEBOARD_PANEL_SECTION_STYLE}>
                  <p style={WHITEBOARD_SUBSECTION_TITLE_STYLE}>PLAYERS</p>
                  <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: "6px", alignItems: "center" }}>
                    <span style={{ color: "#dbe7f5", fontSize: "10px", fontWeight: 600, fontFamily: "Inter, system-ui, sans-serif" }}>
                      Team A
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                      {WHITEBOARD_PLAYER_COLOR_CHOICES.map((choice) => {
                        const isActive = whiteboardBlueColor === choice.value;
                        return (
                          <button
                            key={`whiteboard-blue-color-${choice.value}`}
                            type="button"
                            aria-label="Set Team A player colour"
                            style={{
                              ...WHITEBOARD_TOKEN_COLOR_OPTION_STYLE,
                              ...(isActive
                                ? { boxShadow: "0 0 0 2px rgba(125, 211, 252, 0.9)", border: "1px solid rgba(125, 211, 252, 0.75)" }
                                : null),
                            }}
                            onClick={() => setWhiteboardBlueColor(choice.value)}
                          >
                            <span style={{ ...WHITEBOARD_TOKEN_COLOR_SWATCH_STYLE, background: choice.css }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", gap: "6px", alignItems: "center" }}>
                    <span style={{ color: "#dbe7f5", fontSize: "10px", fontWeight: 600, fontFamily: "Inter, system-ui, sans-serif" }}>
                      Team B
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px" }}>
                      {WHITEBOARD_PLAYER_COLOR_CHOICES.map((choice) => {
                        const isActive = whiteboardRedColor === choice.value;
                        return (
                          <button
                            key={`whiteboard-red-color-${choice.value}`}
                            type="button"
                            aria-label="Set Team B player colour"
                            style={{
                              ...WHITEBOARD_TOKEN_COLOR_OPTION_STYLE,
                              ...(isActive
                                ? { boxShadow: "0 0 0 2px rgba(125, 211, 252, 0.9)", border: "1px solid rgba(125, 211, 252, 0.75)" }
                                : null),
                            }}
                            onClick={() => setWhiteboardRedColor(choice.value)}
                          >
                            <span style={{ ...WHITEBOARD_TOKEN_COLOR_SWATCH_STYLE, background: choice.css }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={WHITEBOARD_TEAM_SELECTOR_ROW_STYLE}>
                    <button
                      type="button"
                      style={
                        whiteboardCountPickerTeam === "BLUE"
                          ? WHITEBOARD_TEAM_OPTION_ACTIVE_STYLE
                          : WHITEBOARD_TEAM_OPTION_STYLE
                      }
                      onClick={() => setWhiteboardCountPickerTeam("BLUE")}
                    >
                      Team A
                    </button>
                    <button
                      type="button"
                      style={
                        whiteboardCountPickerTeam === "RED"
                          ? WHITEBOARD_TEAM_OPTION_ACTIVE_STYLE
                          : WHITEBOARD_TEAM_OPTION_STYLE
                      }
                      onClick={() => setWhiteboardCountPickerTeam("RED")}
                    >
                      Team B
                    </button>
                  </div>
                  <div style={WHITEBOARD_COUNT_SELECTOR_GRID_STYLE}>
                    {WHITEBOARD_COUNT_OPTIONS.map((count) => {
                      const isActive =
                        whiteboardCountPickerTeam === "BLUE"
                          ? whiteboardBlueCount === count
                          : whiteboardRedCount === count;
                      return (
                        <button
                          key={`${whiteboardCountPickerTeam}-count-${count}`}
                          type="button"
                          style={isActive ? WHITEBOARD_COUNT_OPTION_ACTIVE_STYLE : WHITEBOARD_COUNT_OPTION_STYLE}
                          onClick={() => setWhiteboardCount(whiteboardCountPickerTeam, count)}
                        >
                          {count}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        {!isWhiteboardMode ? (
          <button
            type="button"
            style={PHASES_CHIP_STYLE}
            aria-label="Toggle phases tray"
            onClick={() => setPhasesOpen((open) => !open)}
          >
            Phases: {phaseCount}
          </button>
        ) : null}
        {!isWhiteboardMode && phasesOpen ? (
          <div style={PHASES_TRAY_STYLE}>
            {phaseItems.length > 0 ? (
              phaseItems.map((phase) => (
                <div key={phase} style={PHASE_ITEM_STYLE}>
                  Phase {phase}
                </div>
              ))
            ) : (
              <div style={PHASES_EMPTY_STYLE}>No phases</div>
            )}
          </div>
        ) : null}
        {!isWhiteboardMode && !isPortraitViewingMode && controlsOpen && ballPopupStep !== null ? (
          <div style={BALL_POPUP_STYLE} role="group" aria-label="Ball type selection">
            {ballPopupStep === "root" ? (
              <>
                {hasBallOnPitch ? (
                  <>
                    <button
                      type="button"
                      className="control-button"
                      style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                      onClick={() => { freeBall(); setBallPopupStep(null); }}
                    >
                      Free Ball
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                      onClick={removeCurrentBall}
                    >
                      🗑 Remove Ball
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="control-button"
                  style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                  onClick={() => setBallPopupStep("football-size")}
                >
                  ⚽ Football
                </button>
                <button
                  type="button"
                  className="control-button"
                  style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                  onClick={() => setBallPopupStep("sliotar-size")}
                >
                  🥎 Sliotar
                </button>
              </>
            ) : null}
            {ballPopupStep === "football-size" ? (
              <>
                <button
                  type="button"
                  className="control-button"
                  style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                  onClick={() => setBallPopupStep("root")}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="control-button"
                  style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                  onClick={() => onSelectBallSize("footballSmall")}
                >
                  ⚽ Small
                </button>
                <button
                  type="button"
                  className="control-button"
                  style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                  onClick={() => onSelectBallSize("football")}
                >
                  ⚽ Medium
                </button>
              </>
            ) : null}
            {ballPopupStep === "sliotar-size" ? (
              <>
                <button
                  type="button"
                  className="control-button"
                  style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                  onClick={() => setBallPopupStep("root")}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="control-button"
                  style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                  onClick={() => onSelectBallSize("sliotarSmall")}
                >
                  🥎 Small
                </button>
                <button
                  type="button"
                  className="control-button"
                  style={MOVEMENT_MODE_PILL_BUTTON_STYLE}
                  onClick={() => onSelectBallSize("sliotar")}
                >
                  🥎 Medium
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {!isWhiteboardMode && !isPortraitViewingMode && controlsOpen ? (
          <div style={MOVEMENT_MODE_PILL_STYLE} role="group" aria-label="Movement mode">
            {([
              { id: "move", label: "Move" },
              { id: "route", label: "Route" },
              { id: "ball", label: "Ball" },
            ] as const).map((option) => (
              <button
                key={option.id}
                type="button"
                className="control-button"
                style={{
                  ...(option.id === "ball"
                    ? (ballPopupStep !== null || movementModePillSelection === "ball")
                        ? MOVEMENT_MODE_PILL_BUTTON_ACTIVE_STYLE
                        : MOVEMENT_MODE_PILL_BUTTON_STYLE
                    : movementModePillSelection === option.id
                      ? MOVEMENT_MODE_PILL_BUTTON_ACTIVE_STYLE
                      : MOVEMENT_MODE_PILL_BUTTON_STYLE),
                  ...(isPlaybackLocked ? MOVEMENT_MODE_PILL_BUTTON_DISABLED_STYLE : null),
                }}
                aria-pressed={option.id === "ball" ? ballPopupStep !== null : movementModePillSelection === option.id}
                disabled={isPlaybackLocked}
                onClick={() => option.id === "ball" ? handleBallButtonPress() : applyMovementModePillSelection(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {!isWhiteboardMode && (controlsOpen || isPortraitViewingMode) ? (
          <div style={CONTROLS_POPOUT_STYLE}>
            <div style={PLAYBACK_SPEED_BAR_STYLE}>
              <span style={PLAYBACK_SPEED_LABEL_STYLE}>SPEED</span>
              <input
                type="range"
                className="speed-control-range"
                min={0}
                max={PLAYBACK_SPEED_OPTIONS.length - 1}
                step={1}
                value={playbackSpeedOptionIndex}
                onChange={handlePlaybackSpeedChange}
                aria-label="Playback speed"
                style={playbackSpeedSliderStyle}
              />
              <span style={PLAYBACK_SPEED_VALUE_STYLE}>{playbackSpeedLabel}</span>
            </div>
            {!isPortraitViewingMode ? (
              <button
                type="button"
                className="control-button"
                disabled={isPlaybackLocked}
                style={isPlaybackLocked ? DISABLED_CONTROL_BUTTON_STYLE : SET_START_BUTTON_STYLE}
                onClick={() => {
                  surfaceRef.current?.setStart();
                  setMovementModePillSelection("move");
                  closeControlsMenu();
                }}
              >
                Set Start
              </button>
            ) : null}
            {!isPortraitViewingMode ? (
              <button
                type="button"
                className="control-button"
                disabled={isAddPhaseBlocked}
                style={isAddPhaseBlocked ? DISABLED_CONTROL_BUTTON_STYLE : ADD_PHASE_BUTTON_STYLE}
                onClick={() => {
                  surfaceRef.current?.addPhase();
                  closeControlsMenu();
                }}
              >
                Add Phase
              </button>
            ) : null}
            <button
              type="button"
              className="control-button"
              disabled={isPlaying}
              style={isPlaying ? DISABLED_CONTROL_BUTTON_STYLE : PLAY_BUTTON_STYLE}
              onClick={handlePlayPress}
            >
              {hasAssignedRoutes ? "Play Routes" : "Play"}
            </button>
            {hasAssignedRoutes ? (
              <button
                type="button"
                className="control-button"
                disabled={isPlaybackLocked}
                style={isPlaybackLocked ? DISABLED_CONTROL_BUTTON_STYLE : ADD_PHASE_BUTTON_STYLE}
                onClick={() => {
                  clearCommittedRoutes();
                  closeControlsMenu();
                }}
              >
                Clear Routes
              </button>
            ) : null}
            <button
              type="button"
              className="control-button"
              disabled={!isPlaying}
              style={!isPlaying ? DISABLED_CONTROL_BUTTON_STYLE : PAUSE_BUTTON_STYLE}
              onClick={handlePausePress}
            >
              Pause
            </button>
            {!isPortraitViewingMode ? (
              <button
                type="button"
                className="control-button"
                disabled={phaseCount <= 0}
                style={phaseCount <= 0 ? DISABLED_CONTROL_BUTTON_STYLE : UNDO_PHASE_BUTTON_STYLE}
                onClick={() => {
                  surfaceRef.current?.undoPhase();
                  closeControlsMenu();
                }}
              >
                Undo Phase
              </button>
            ) : null}
            <button
              type="button"
              className="control-button"
              style={RESET_BUTTON_STYLE}
              onClick={() => {
                surfaceRef.current?.reset();
                setIsPlaying(false);
                setIsPaused(false);
                closeControlsMenu();
              }}
            >
              Reset
            </button>
          </div>
        ) : null}
        {isToolsOverlayOpen && overlayPortalRoot
          ? createPortal(
              isCompactLandscapeTools ? (
            <div
              style={toolsPortalOverlayStyle}
              className={isIphoneLandscapeTools ? "isIphoneLandscapeTools" : undefined}
              role="presentation"
              onPointerDown={handleToolsBackdropPointerDown}
            >
              <div
                ref={toolsMenuRef}
                style={toolsPortalCompactPanelStyle}
                role="dialog"
                aria-modal="false"
                aria-label="PáircVision Board tools"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <div style={MOBILE_COACH_HUB_HEADER_STYLE}>
                  <p style={MOBILE_COACH_HUB_TITLE_STYLE}>PáircVision Board Tools</p>
                  <button type="button" className="control-button" style={MOBILE_COACH_HUB_CLOSE_STYLE} onClick={() => setToolsOpen(false)}>
                    Close
                  </button>
                </div>
                <div style={mobileCoachHubBodyStyle}>
                  <div style={coachHubTabGridStyle}>
                    <button
                      type="button"
                      style={activeToolsSection === "draw" ? coachHubTabButtonActiveStyle : coachHubTabButtonStyle}
                      onClick={() => setActiveToolsSection("draw")}
                    >
                      Draw
                    </button>
                    <button
                      type="button"
                      style={activeToolsSection === "teams" ? coachHubTabButtonActiveStyle : coachHubTabButtonStyle}
                      onClick={() => setActiveToolsSection("teams")}
                    >
                      Teams
                    </button>
                    <button
                      type="button"
                      style={activeToolsSection === "items" ? coachHubTabButtonActiveStyle : coachHubTabButtonStyle}
                      onClick={() => setActiveToolsSection("items")}
                    >
                      Items
                    </button>
                    <button
                      type="button"
                      style={activeToolsSection === "board" ? coachHubTabButtonActiveStyle : coachHubTabButtonStyle}
                      onClick={() => setActiveToolsSection("board")}
                    >
                      Board
                    </button>
                  </div>

                  {activeToolsSection === "draw" ? (
                    <div style={COACH_HUB_SECTION_STYLE}>
                      <p style={coachHubSectionTitleStyle}>Draw</p>
                      <div className="coach-hub-tool-grid" style={COACH_HUB_TOOL_GRID_STYLE}>
                        <button
                          type="button"
                          style={tacticalTool === "move" && !textToolActive ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("move")}
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          style={textToolActive ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={activateTextTool}
                        >
                          Label
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "line" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("line")}
                        >
                          Line
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "arrow" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("arrow")}
                        >
                          Arrow
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "curved" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("curved")}
                        >
                          Curved
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "dashed" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("dashed")}
                        >
                          Dash
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "wavy" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("wavy")}
                        >
                          Pen
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "freePen" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("freePen")}
                        >
                          Free Pen
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "rectangleZone" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("rectangleZone")}
                        >
                          Rect Zone
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "circleZone" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("circleZone")}
                        >
                          Circle Zone
                        </button>
                        <button
                          type="button"
                          style={tacticalTool === "eraser" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                          onClick={() => applyTacticalToolFromMenu("eraser")}
                        >
                          Eraser
                        </button>
                      </div>
                      {isCompactLandscapeTools ? <p style={coachHubSectionTitleStyle}>Colour</p> : null}
                      <div style={coachHubColorGridStyle}>
                        {WHITEBOARD_PEN_COLOR_CHOICES.map((choice) => {
                          const isActive = activeTacticalPenColor === choice.value;
                          return (
                            <button
                              key={`tactical-color-${choice.label.toLowerCase()}`}
                              type="button"
                              aria-label={`Set tactical drawing colour ${choice.label}`}
                              style={{
                                ...coachHubColorButtonStyle,
                                ...(isActive
                                  ? {
                                      boxShadow: "0 0 0 2px rgba(125, 211, 252, 0.88)",
                                      border: "1px solid rgba(125, 211, 252, 0.8)",
                                    }
                                  : null),
                              }}
                              onClick={() => applyTacticalPenColor(choice.value)}
                            >
                              <span style={{ ...coachHubColorSwatchStyle, background: choice.css }} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {activeToolsSection === "teams" ? (
                    <div style={COACH_HUB_SECTION_STYLE}>
                      <p style={coachHubSectionTitleStyle}>Teams</p>
                      <p style={{ ...coachHubSectionTitleStyle, color: "#93c5fd", marginTop: 4 }}>
                        Team A — {bluePlayerCount}/15
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "3px" }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => (
                          <button
                            key={`blue-${n}`}
                            type="button"
                            disabled={isPlaybackLocked}
                            style={blueActiveNumbers.has(n)
                              ? { ...COACH_HUB_TOOL_BUTTON_STYLE, border: "1px solid rgba(147,197,253,0.70)", background: "rgba(30,58,138,0.70)", color: "#e0f2fe" }
                              : COACH_HUB_TOOL_BUTTON_STYLE}
                            onClick={() => togglePlayerNumber("BLUE", n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <div style={{ ...COACH_HUB_ACTION_GRID_STYLE, marginTop: 3 }}>
                        <button type="button" style={coachHubActionButtonStyle} disabled={isPlaybackLocked} onClick={() => fillTeam("BLUE")}>
                          Fill 15
                        </button>
                        <button type="button" style={coachHubActionButtonStyle} disabled={isPlaybackLocked} onClick={() => clearTeam("BLUE")}>
                          Clear All
                        </button>
                      </div>
                      <p style={{ ...coachHubSectionTitleStyle, color: "#fca5a5", marginTop: 6 }}>
                        Team B — {redPlayerCount}/15
                      </p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "3px" }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => (
                          <button
                            key={`red-${n}`}
                            type="button"
                            disabled={isPlaybackLocked}
                            style={redActiveNumbers.has(n)
                              ? { ...COACH_HUB_TOOL_BUTTON_STYLE, border: "1px solid rgba(252,165,165,0.70)", background: "rgba(127,29,29,0.70)", color: "#fee2e2" }
                              : COACH_HUB_TOOL_BUTTON_STYLE}
                            onClick={() => togglePlayerNumber("RED", n)}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <div style={{ ...COACH_HUB_ACTION_GRID_STYLE, marginTop: 3 }}>
                        <button type="button" style={coachHubActionButtonStyle} disabled={isPlaybackLocked} onClick={() => fillTeam("RED")}>
                          Fill 15
                        </button>
                        <button type="button" style={coachHubActionButtonStyle} disabled={isPlaybackLocked} onClick={() => clearTeam("RED")}>
                          Clear All
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeToolsSection === "items" ? (
                    <div style={COACH_HUB_SECTION_STYLE}>
                      <p style={coachHubSectionTitleStyle}>Items</p>
                      <div style={COACH_HUB_ACTION_GRID_STYLE}>
                        <button
                          type="button"
                          style={{ ...coachHubActionButtonStyle, gridColumn: "1 / -1" }}
                          disabled={isPlaybackLocked}
                          onClick={() => setItemMode((previous) => (previous === "edit" ? "locked" : "edit"))}
                        >
                          {effectiveItemMode === "edit" ? "Lock Items" : "Edit Items"}
                        </button>
                        <button
                          type="button"
                          style={{ ...coachHubActionButtonStyle, gridColumn: "1 / -1" }}
                          disabled={isPlaybackLocked}
                          onClick={freeBall}
                        >
                          Free Ball
                        </button>
                        {TACTICAL_ITEM_CHOICES.map((choice) => (
                          <button
                            key={`item-${choice.type}`}
                            type="button"
                            style={coachHubActionButtonStyle}
                            disabled={isPlaybackLocked}
                            onClick={() => addItem(choice.type)}
                          >
                            + {choice.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          style={{ ...coachHubActionButtonStyle, gridColumn: "1 / -1" }}
                          disabled={isPlaybackLocked}
                          onClick={clearItems}
                        >
                          Clear Items
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeToolsSection === "board" ? (
                    <div style={COACH_HUB_SECTION_STYLE}>
                      <p style={coachHubSectionTitleStyle}>Board</p>
                      <div style={COACH_HUB_ACTION_GRID_STYLE}>
                        <button type="button" style={coachHubActionButtonStyle} onClick={handleNewBoard}>
                          New Board
                        </button>
                        <button type="button" style={coachHubActionButtonStyle} onClick={clearTacticalDrawings}>
                          Clear Drawings
                        </button>
                        <button type="button" style={coachHubActionButtonStyle} onClick={resetBoardFromTools}>
                          Reset Board
                        </button>
                        <button type="button" style={coachHubActionButtonStyle} onClick={goHome}>
                          Home
                        </button>
                        <button type="button" style={coachHubActionButtonStyle} onClick={openMenuFromTools}>
                          Menu
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
              ) : (
            <div style={TOOLS_PORTAL_BACKDROP_STYLE} role="presentation" onPointerDown={handleToolsBackdropPointerDown}>
              <div
                ref={toolsMenuRef}
                style={toolsPortalPanelStyle}
                role="dialog"
                aria-modal="false"
                aria-label="PáircVision Board tools"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
            <div style={coachHubTabGridStyle}>
              <button
                type="button"
                style={activeToolsSection === "draw" ? coachHubTabButtonActiveStyle : coachHubTabButtonStyle}
                onClick={() => setActiveToolsSection("draw")}
              >
                Draw
              </button>
              <button
                type="button"
                style={activeToolsSection === "teams" ? coachHubTabButtonActiveStyle : coachHubTabButtonStyle}
                onClick={() => setActiveToolsSection("teams")}
              >
                Teams
              </button>
              <button
                type="button"
                style={activeToolsSection === "items" ? coachHubTabButtonActiveStyle : coachHubTabButtonStyle}
                onClick={() => setActiveToolsSection("items")}
              >
                Items
              </button>
              <button
                type="button"
                style={activeToolsSection === "board" ? coachHubTabButtonActiveStyle : coachHubTabButtonStyle}
                onClick={() => setActiveToolsSection("board")}
              >
                Board
              </button>
            </div>

            {activeToolsSection === "draw" ? (
              <div style={COACH_HUB_SECTION_STYLE}>
                <p style={coachHubSectionTitleStyle}>Draw</p>
                <div className="coach-hub-tool-grid" style={COACH_HUB_TOOL_GRID_STYLE}>
                  <button
                    type="button"
                    style={tacticalTool === "move" && !textToolActive ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("move")}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    style={textToolActive ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={activateTextTool}
                  >
                    Label
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "line" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("line")}
                  >
                    Plain
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "arrow" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("arrow")}
                  >
                    Straight
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "curved" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("curved")}
                  >
                    Curved
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "dashed" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("dashed")}
                  >
                    Dashed
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "wavy" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("wavy")}
                  >
                    Wavy
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "freePen" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("freePen")}
                  >
                    Free Pen
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "rectangleZone" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("rectangleZone")}
                  >
                    Rect Zone
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "circleZone" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("circleZone")}
                  >
                    Circle Zone
                  </button>
                  <button
                    type="button"
                    style={tacticalTool === "eraser" ? coachHubToolButtonActiveStyle : coachHubToolButtonStyle}
                    onClick={() => applyTacticalToolFromMenu("eraser")}
                  >
                    Eraser
                  </button>
                </div>
                {isCompactLandscapeTools ? <p style={coachHubSectionTitleStyle}>Colour</p> : null}
                <div style={coachHubColorGridStyle}>
                  {WHITEBOARD_PEN_COLOR_CHOICES.map((choice) => {
                    const isActive = activeTacticalPenColor === choice.value;
                    return (
                      <button
                        key={`tactical-color-${choice.label.toLowerCase()}`}
                        type="button"
                        aria-label={`Set tactical drawing colour ${choice.label}`}
                        style={{
                          ...coachHubColorButtonStyle,
                          ...(isActive
                            ? {
                                boxShadow: "0 0 0 2px rgba(125, 211, 252, 0.88)",
                                border: "1px solid rgba(125, 211, 252, 0.8)",
                              }
                            : null),
                        }}
                        onClick={() => applyTacticalPenColor(choice.value)}
                      >
                        <span style={{ ...coachHubColorSwatchStyle, background: choice.css }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {activeToolsSection === "teams" ? (
              <div style={COACH_HUB_SECTION_STYLE}>
                <p style={coachHubSectionTitleStyle}>Teams</p>
                <p style={{ ...coachHubSectionTitleStyle, color: "#93c5fd", marginTop: 4 }}>
                  Team A — {bluePlayerCount}/15
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "3px" }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => (
                    <button
                      key={`blue-${n}`}
                      type="button"
                      disabled={isPlaybackLocked}
                      style={blueActiveNumbers.has(n)
                        ? { ...COACH_HUB_TOOL_BUTTON_STYLE, border: "1px solid rgba(147,197,253,0.70)", background: "rgba(30,58,138,0.70)", color: "#e0f2fe" }
                        : COACH_HUB_TOOL_BUTTON_STYLE}
                      onClick={() => togglePlayerNumber("BLUE", n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ ...COACH_HUB_ACTION_GRID_STYLE, marginTop: 3 }}>
                  <button type="button" style={coachHubActionButtonStyle} disabled={isPlaybackLocked} onClick={() => fillTeam("BLUE")}>
                    Fill 15
                  </button>
                  <button type="button" style={coachHubActionButtonStyle} disabled={isPlaybackLocked} onClick={() => clearTeam("BLUE")}>
                    Clear All
                  </button>
                </div>
                <p style={{ ...coachHubSectionTitleStyle, color: "#fca5a5", marginTop: 6 }}>
                  Team B — {redPlayerCount}/15
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "3px" }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => (
                    <button
                      key={`red-${n}`}
                      type="button"
                      disabled={isPlaybackLocked}
                      style={redActiveNumbers.has(n)
                        ? { ...COACH_HUB_TOOL_BUTTON_STYLE, border: "1px solid rgba(252,165,165,0.70)", background: "rgba(127,29,29,0.70)", color: "#fee2e2" }
                        : COACH_HUB_TOOL_BUTTON_STYLE}
                      onClick={() => togglePlayerNumber("RED", n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ ...COACH_HUB_ACTION_GRID_STYLE, marginTop: 3 }}>
                  <button type="button" style={coachHubActionButtonStyle} disabled={isPlaybackLocked} onClick={() => fillTeam("RED")}>
                    Fill 15
                  </button>
                  <button type="button" style={coachHubActionButtonStyle} disabled={isPlaybackLocked} onClick={() => clearTeam("RED")}>
                    Clear All
                  </button>
                </div>
              </div>
            ) : null}

            {activeToolsSection === "items" ? (
              <div style={COACH_HUB_SECTION_STYLE}>
                <p style={coachHubSectionTitleStyle}>Items</p>
                <div style={COACH_HUB_ACTION_GRID_STYLE}>
                  <button
                    type="button"
                    style={{ ...coachHubActionButtonStyle, gridColumn: "1 / -1" }}
                    disabled={isPlaybackLocked}
                    onClick={() => setItemMode((previous) => (previous === "edit" ? "locked" : "edit"))}
                  >
                    {effectiveItemMode === "edit" ? "Lock Items" : "Edit Items"}
                  </button>
                  <button
                    type="button"
                    style={{ ...coachHubActionButtonStyle, gridColumn: "1 / -1" }}
                    disabled={isPlaybackLocked}
                    onClick={freeBall}
                  >
                    Free Ball
                  </button>
                  {TACTICAL_ITEM_CHOICES.map((choice) => (
                    <button
                      key={`item-${choice.type}`}
                      type="button"
                      style={coachHubActionButtonStyle}
                      disabled={isPlaybackLocked}
                      onClick={() => addItem(choice.type)}
                    >
                      + {choice.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    style={{ ...coachHubActionButtonStyle, gridColumn: "1 / -1" }}
                    disabled={isPlaybackLocked}
                    onClick={clearItems}
                  >
                    Clear Items
                  </button>
                </div>
              </div>
            ) : null}

            {activeToolsSection === "board" ? (
              <div style={COACH_HUB_SECTION_STYLE}>
                <p style={coachHubSectionTitleStyle}>Board</p>
                <div style={COACH_HUB_ACTION_GRID_STYLE}>
                  <button type="button" style={coachHubActionButtonStyle} onClick={handleNewBoard}>
                    New Board
                  </button>
                  <button type="button" style={coachHubActionButtonStyle} onClick={clearTacticalDrawings}>
                    Clear Drawings
                  </button>
                  <button type="button" style={coachHubActionButtonStyle} onClick={resetBoardFromTools}>
                    Reset Board
                  </button>
                  <button type="button" style={coachHubActionButtonStyle} onClick={goHome}>
                    Home
                  </button>
                  <button type="button" style={coachHubActionButtonStyle} onClick={openMenuFromTools}>
                    Menu
                  </button>
                </div>
              </div>
            ) : null}
              </div>
            </div>
              ),
            overlayPortalRoot,
          )
          : null}
        {!isWhiteboardMode && actionsOpen ? (
          <div ref={actionsMenuRef} style={actionsPopoutStyle}>
            <div style={TOKEN_STYLE_MENU_SECTION_STYLE}>
              <p style={TOKEN_STYLE_MENU_LABEL_STYLE}>Token Style</p>
              <div style={TOKEN_STYLE_MENU_ROW_STYLE}>
                {TOKEN_STYLE_CHOICES.map((choice) => (
                  <button
                    key={`token-style-${choice.value}`}
                    type="button"
                    className="control-button"
                    style={tacticalTokenStyle === choice.value ? TOKEN_STYLE_MENU_BUTTON_ACTIVE_STYLE : TOKEN_STYLE_MENU_BUTTON_STYLE}
                    onClick={() => setTacticalTokenStyle(choice.value)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="control-button" style={ACTIONS_MENU_BUTTON_STYLE} onClick={openQuickShareEntry}>
              Share Board
            </button>
            <button type="button" className="control-button" style={ACTIONS_MENU_BUTTON_STYLE} onClick={openMyBoardsEntry}>
              My Boards
            </button>
            <button
              type="button"
              className="control-button"
              style={isPortraitViewingMode ? DISABLED_CONTROL_BUTTON_STYLE : ACTIONS_MENU_BUTTON_STYLE}
              onClick={handleNewBoard}
              disabled={isPortraitViewingMode}
            >
              New Board
            </button>
            <button type="button" className="control-button" style={ACTIONS_MENU_BUTTON_STYLE} onClick={goHome}>
              Home
            </button>
          </div>
        ) : null}
        {!isWhiteboardMode && myBoardsOpen ? (
          <div ref={myBoardsPopoverRef} style={myBoardsPopoverStyle} role="dialog" aria-modal="false" aria-label="My Boards">
            <div style={MY_BOARDS_HEADER_STYLE}>
              <p style={MY_BOARDS_TITLE_STYLE}>My Boards</p>
              <button type="button" className="control-button" style={MY_BOARDS_SAVE_BUTTON_STYLE} onClick={handleSaveCurrentBoard}>
                Save Current
              </button>
            </div>
            {savedBoards.length <= 0 ? (
              <p style={MY_BOARDS_EMPTY_STYLE}>No saved boards yet. Save your current setup to build your board roll.</p>
            ) : (
              savedBoards.map((board) => (
                <div key={board.id} style={MY_BOARDS_CARD_STYLE}>
                  {board.thumbnail ? (
                    <img src={board.thumbnail} alt={`${board.name} preview`} style={MY_BOARDS_THUMBNAIL_STYLE} loading="lazy" />
                  ) : (
                    <div style={{ ...MY_BOARDS_THUMBNAIL_STYLE, display: "grid", placeItems: "center", color: "#93afc4", fontSize: "9px" }}>
                      No Preview
                    </div>
                  )}
                  <p style={MY_BOARDS_META_STYLE}>{board.name}</p>
                  <p style={MY_BOARDS_TIMESTAMP_STYLE}>Updated {formatBoardUpdatedAt(board.updatedAt)}</p>
                  <div style={MY_BOARDS_ACTION_ROW_STYLE}>
                    <button type="button" className="control-button" style={MY_BOARDS_ACTION_BUTTON_STYLE} onClick={() => handleOpenSavedBoard(board.id)}>
                      Open
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      style={MY_BOARDS_ACTION_BUTTON_STYLE}
                      onClick={() => handleRenameBoard(board.id, board.name)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      style={MY_BOARDS_ACTION_BUTTON_STYLE}
                      onClick={() => handleDuplicateBoard(board.id)}
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      className="control-button"
                      style={MY_BOARDS_ACTION_BUTTON_STYLE}
                      onClick={() => handleDeleteBoard(board.id, board.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
            <button type="button" className="control-button" style={MY_BOARDS_ACTION_BUTTON_STYLE} onClick={closeMyBoardsMenu}>
              Close
            </button>
          </div>
        ) : null}
        {!isWhiteboardMode ? (
          <button
            ref={actionsBubbleButtonRef}
            type="button"
            className="floating-bubble"
            style={actionsBubbleStyle}
            aria-label="Open actions"
            onClick={() =>
              setActionsOpen((open) => {
                const next = !open;
                if (next) {
                  setControlsOpen(false);
                  setQuickShareOpen(false);
                  setMyBoardsOpen(false);
                }
                return next;
              })
            }
          >
            ⋯
          </button>
        ) : null}
        {!isWhiteboardMode && !isPortraitViewingMode ? (
          <button
            type="button"
            className="floating-bubble"
            style={LEFT_BUBBLE_STYLE}
            aria-label="Open controls"
            onClick={() =>
              setControlsOpen((open) => {
                const next = !open;
                if (next) {
                  setActionsOpen(false);
                  setQuickShareOpen(false);
                  setMyBoardsOpen(false);
                }
                return next;
              })
            }
          >
            Ctrl
          </button>
        ) : null}
        {!isWhiteboardMode && !isPortraitViewingMode ? (
          <button
            ref={toolsBubbleButtonRef}
            type="button"
            className={isCompactLandscapeTools ? "floating-bubble" : "floating-bubble floating-bubble-tool"}
            style={isCompactLandscapeTools ? MOBILE_TOOLS_BUBBLE_STYLE : TOOL_BUBBLE_STYLE}
            aria-label={toolsOpen ? "Close tools" : "Open tools"}
            aria-expanded={toolsOpen}
            onClick={() =>
              setToolsOpen((open) => {
                const next = !open;
                if (next) {
                  setActiveToolsSection("draw");
                  setActionsOpen(false);
                  setQuickShareOpen(false);
                  setMyBoardsOpen(false);
                  setControlsOpen(false);
                }
                return next;
              })
            }
          >
            <span className="tool-bubble-icon" aria-hidden="true">
              <img className="tool-bubble-logo" src="/pv-logo-icon.svg" alt="PáircVision menu" />
              <span className="tool-bubble-label">☰ Tools</span>
            </span>
          </button>
        ) : null}
        {!isWhiteboardMode && quickShareOnboardingOpen ? (
          <div
            style={{
              ...QUICK_SHARE_ONBOARDING_OVERLAY_STYLE,
              opacity: quickShareOnboardingEntered ? 1 : 0,
            }}
            role="presentation"
          >
            <div
              ref={quickShareOnboardingCardRef}
              style={{
                ...QUICK_SHARE_ONBOARDING_CARD_STYLE,
                opacity: quickShareOnboardingEntered ? 1 : 0,
                transform: quickShareOnboardingEntered ? "scale(1)" : "scale(0.98)",
              }}
              role="dialog"
              aria-modal="false"
              aria-label="Share Board onboarding"
            >
              <p style={QUICK_SHARE_ONBOARDING_TITLE_STYLE}>Share Board</p>
              <p style={QUICK_SHARE_ONBOARDING_BODY_STYLE}>
                Use your phone&apos;s screen recorder.
                <br />
                Share the saved video directly to WhatsApp.
              </p>
              <button
                type="button"
                className="control-button"
                style={QUICK_SHARE_ONBOARDING_BUTTON_STYLE}
                onClick={() => dismissQuickShareOnboarding(true)}
              >
                Continue to Share Board
              </button>
            </div>
          </div>
        ) : null}
        {!isWhiteboardMode && quickShareOpen ? (
          <div ref={quickSharePopoverRef} style={quickSharePopoverStyle} role="dialog" aria-modal="false" aria-label="Share Board">
            <p style={QUICK_SHARE_TITLE_STYLE}>Share Board</p>
            <button type="button" className="control-button" style={QUICK_SHARE_OPTION_BUTTON_STYLE} onClick={handleQuickShareSnapshot}>
              <span style={QUICK_SHARE_OPTION_TITLE_STYLE}>📸 Snapshot</span>
              <span style={QUICK_SHARE_OPTION_SUBTITLE_STYLE}>Save or share the current board.</span>
            </button>
            <div style={{ height: "1px", background: "rgba(212, 228, 244, 0.12)", margin: "1px 0" }} />
            {slateRecordPhase === "idle" ? (
              <button type="button" className="control-button" style={QUICK_SHARE_OPTION_BUTTON_STYLE} onClick={handleQuickShareRecordClip}>
                <span style={QUICK_SHARE_OPTION_TITLE_STYLE}>🎥 Record</span>
                <span style={QUICK_SHARE_OPTION_SUBTITLE_STYLE}>Record the board.</span>
              </button>
            ) : null}
            {slateRecordPhase === "panel" ? (
              <div style={{ display: "grid", gap: "5px" }}>
                <span style={{ ...QUICK_SHARE_OPTION_TITLE_STYLE, padding: "2px 0" }}>🎥 Record</span>
                <span style={{ ...QUICK_SHARE_OPTION_SUBTITLE_STYLE, color: "rgba(180, 210, 255, 0.55)" }}>Record the board. Stop when finished — auto-stops at 10 min.</span>
                <div style={{ display: "flex", gap: "4px", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="control-button"
                    style={{ ...QUICK_SHARE_OPTION_BUTTON_STYLE, height: "28px", flex: 1, border: "1px solid rgba(255, 80, 80, 0.50)", color: "rgba(255, 190, 190, 0.95)" }}
                    onClick={slateStartCountdown}
                  >
                    🎥 Record
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    style={{ ...QUICK_SHARE_OPTION_BUTTON_STYLE, height: "28px", flex: 1, border: "1px solid rgba(180, 120, 255, 0.55)", color: "rgba(220, 190, 255, 0.95)" }}
                    onClick={() => { void slateStartCountdownWithVoice(); }}
                  >
                    🎙 Voice Record
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    style={{ ...QUICK_SHARE_OPTION_BUTTON_STYLE, height: "28px" }}
                    onClick={slateDismissRecord}
                  >
                    ✕
                  </button>
                </div>
                {slateMicStatus === "denied" ? (
                  <span style={{ ...QUICK_SHARE_OPTION_SUBTITLE_STYLE, color: "rgba(255, 180, 100, 0.85)" }}>
                    Mic access denied — recording silently
                  </span>
                ) : null}
                {slateMicStatus === "unavailable" ? (
                  <span style={{ ...QUICK_SHARE_OPTION_SUBTITLE_STYLE, color: "rgba(255, 180, 100, 0.85)" }}>
                    Microphone not available — recording silently
                  </span>
                ) : null}
              </div>
            ) : null}
            {slateRecordBlob ? (
              <div style={{ display: "grid", gap: "6px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "rgba(200, 225, 255, 0.90)", fontFamily: "Inter, system-ui, sans-serif", letterSpacing: "0.02em" }}>Clip Ready</div>
                {slateRecordBlobUrl && !slateRecordHasAudio ? (
                  <video
                    key={slateRecordBlobUrl}
                    src={slateRecordBlobUrl}
                    preload="metadata"
                    controls
                    playsInline
                    onLoadStart={(e) => {
                      const vid = e.currentTarget as HTMLVideoElement;
                      console.debug("[PV REC] slate video loadstart rs:", vid.readyState, "ns:", vid.networkState);
                      if (IS_DIAG_PREVIEW) setSlateClipDiag((p) => ({ ...p, events: [...p.events, "loadstart"], rs: vid.readyState, ns: vid.networkState, src: vid.currentSrc }));
                    }}
                    onLoadedMetadata={(e) => {
                      const vid = e.currentTarget as HTMLVideoElement;
                      const d = vid.duration;
                      console.debug("[PV REC] slate video loadedmetadata dur:", d, "readyState:", vid.readyState, "vw:", vid.videoWidth, "vh:", vid.videoHeight);
                      setSlateClipVideoReady(true);
                      setSlateClipBlankWarning(false);
                      if (slateClipBlankTimerRef.current) { clearTimeout(slateClipBlankTimerRef.current); slateClipBlankTimerRef.current = null; }
                      if (IS_DIAG_PREVIEW) {
                        try { vid.currentTime = 0.001; } catch { /* seek may throw */ }
                        setSlateClipDiag((p) => ({ ...p, events: [...p.events, "loadedmetadata"], rs: vid.readyState, ns: vid.networkState, src: vid.currentSrc, dur: d, vw: vid.videoWidth, vh: vid.videoHeight, seeked: true }));
                      }
                    }}
                    onLoadedData={(e) => {
                      const vid = e.currentTarget as HTMLVideoElement;
                      console.debug("[PV REC] slate video loadeddata rs:", vid.readyState);
                      setSlateClipVideoReady(true);
                      setSlateClipBlankWarning(false);
                      if (slateClipBlankTimerRef.current) { clearTimeout(slateClipBlankTimerRef.current); slateClipBlankTimerRef.current = null; }
                      if (IS_DIAG_PREVIEW) setSlateClipDiag((p) => ({ ...p, events: [...p.events, "loadeddata"], rs: vid.readyState, ns: vid.networkState }));
                    }}
                    onCanPlay={(e) => {
                      const vid = e.currentTarget as HTMLVideoElement;
                      console.debug("[PV REC] slate video canplay rs:", vid.readyState);
                      setSlateClipVideoReady(true);
                      setSlateClipBlankWarning(false);
                      if (slateClipBlankTimerRef.current) { clearTimeout(slateClipBlankTimerRef.current); slateClipBlankTimerRef.current = null; }
                      if (IS_DIAG_PREVIEW) setSlateClipDiag((p) => ({ ...p, events: [...p.events, "canplay"], rs: vid.readyState, ns: vid.networkState }));
                    }}
                    onSeeked={(e) => {
                      const vid = e.currentTarget as HTMLVideoElement;
                      console.debug("[PV REC] slate video seeked rs:", vid.readyState);
                      if (IS_DIAG_PREVIEW) setSlateClipDiag((p) => ({ ...p, events: [...p.events, "seeked"], rs: vid.readyState }));
                    }}
                    onStalled={(e) => {
                      const vid = e.currentTarget as HTMLVideoElement;
                      console.debug("[PV REC] slate video stalled rs:", vid.readyState, "ns:", vid.networkState);
                      if (IS_DIAG_PREVIEW) setSlateClipDiag((p) => ({ ...p, events: [...p.events, "stalled"], rs: vid.readyState, ns: vid.networkState }));
                    }}
                    onAbort={(e) => {
                      const vid = e.currentTarget as HTMLVideoElement;
                      console.debug("[PV REC] slate video abort rs:", vid.readyState);
                      if (IS_DIAG_PREVIEW) setSlateClipDiag((p) => ({ ...p, events: [...p.events, "abort"], rs: vid.readyState }));
                    }}
                    onError={(e) => {
                      const vid = e.currentTarget as HTMLVideoElement;
                      const errMsg = vid.error ? `${vid.error.code}: ${vid.error.message}` : "unknown";
                      console.debug("[PV REC] slate video error code:", vid.error?.code, "msg:", vid.error?.message, "src:", vid.src.slice(0, 40));
                      if (IS_DIAG_PREVIEW) setSlateClipDiag((p) => ({ ...p, events: [...p.events, "error"], rs: vid.readyState, ns: vid.networkState, err: errMsg }));
                    }}
                    style={{ width: "100%", maxHeight: "110px", borderRadius: "6px", background: "#000", display: "block" }}
                  />
                ) : null}
                {/* Clip info — coach-friendly, no codec strings */}
                {(() => {
                  const hasH264 = slateRecordMimeType.includes("avc1") || slateRecordMimeType.toLowerCase().includes("h264");
                  const mimeBase = slateRecordMimeType.split(";")[0].trim().toLowerCase();
                  const mismatch = mimeBase === "video/mp4" && !hasH264;
                  const size = slateRecordBlob.size >= 1_048_576
                    ? `${(slateRecordBlob.size / 1_048_576).toFixed(1)} MB`
                    : `${Math.round(slateRecordBlob.size / 1024)} KB`;
                  const durStr = slateRecordElapsed > 0 ? formatRecordTime(slateRecordElapsed) : null;
                  return (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                      {slateRecordHasAudio
                        ? <span style={{ ...QUICK_SHARE_OPTION_SUBTITLE_STYLE, color: "rgba(160, 255, 160, 0.85)", fontWeight: 650 }}>🎙 Voice</span>
                        : <span style={{ ...QUICK_SHARE_OPTION_SUBTITLE_STYLE, color: "rgba(180, 210, 255, 0.45)" }}>Silent</span>}
                      {durStr ? <span style={{ ...QUICK_SHARE_OPTION_SUBTITLE_STYLE }}>Duration: {durStr}</span> : null}
                      <span style={{ ...QUICK_SHARE_OPTION_SUBTITLE_STYLE }}>Size: {size}</span>
                      {mismatch ? <span style={{ fontSize: "7.5px", color: "rgba(255, 200, 100, 0.65)", fontFamily: "Inter, system-ui, sans-serif" }}>⚠ sharing as .webm</span> : null}
                    </div>
                  );
                })()}
                {/* Diagnostics panel — visible only when ?diag is in the URL */}
                {IS_DIAG_PREVIEW ? (
                  <div style={{ fontFamily: "'SF Mono', 'Roboto Mono', 'Courier New', monospace", fontSize: "8.5px", color: "rgba(180, 255, 180, 0.85)", background: "rgba(0, 20, 0, 0.70)", borderRadius: "5px", padding: "5px 6px", display: "grid", gap: "2px", lineHeight: 1.5, border: "1px solid rgba(100, 200, 100, 0.20)" }}>
                    <div style={{ fontWeight: 700, color: "rgba(140, 255, 140, 0.95)", marginBottom: "2px" }}>◉ Recorder Diagnostics</div>
                    <div>requestedMime: <span style={{ color: "rgba(255, 220, 120, 0.95)" }}>{slateRecordMimeType || "—"}</span></div>
                    <div>blob.type: <span style={{ color: "rgba(255, 220, 120, 0.95)" }}>{slateRecordBlob?.type || "—"}</span></div>
                    <div>blob.size: <span style={{ color: "rgba(255, 220, 120, 0.95)" }}>{slateRecordBlob ? `${slateRecordBlob.size.toLocaleString()} bytes` : "—"}</span></div>
                    <div>objectUrl: <span style={{ color: slateRecordBlobUrl ? "rgba(100, 255, 120, 0.95)" : "rgba(255, 100, 100, 0.90)" }}>{slateRecordBlobUrl ? "yes" : "no"}</span></div>
                    <div>video.currentSrc: <span style={{ color: slateClipDiag.src ? "rgba(100, 255, 120, 0.95)" : "rgba(255, 100, 100, 0.90)" }}>{slateClipDiag.src ? "yes" : "no"}</span></div>
                    <div>readyState: <span style={{ color: "rgba(255, 220, 120, 0.95)" }}>{slateClipDiag.rs >= 0 ? `${slateClipDiag.rs} (${DIAG_RS[slateClipDiag.rs] ?? "?"})` : "—"}</span></div>
                    <div>networkState: <span style={{ color: "rgba(255, 220, 120, 0.95)" }}>{slateClipDiag.ns >= 0 ? `${slateClipDiag.ns} (${DIAG_NS[slateClipDiag.ns] ?? "?"})` : "—"}</span></div>
                    <div>error: <span style={{ color: slateClipDiag.err ? "rgba(255, 100, 100, 0.95)" : "rgba(100, 255, 120, 0.95)" }}>{slateClipDiag.err ?? "none"}</span></div>
                    <div>duration: <span style={{ color: "rgba(255, 220, 120, 0.95)" }}>{Number.isFinite(slateClipDiag.dur) ? `${slateClipDiag.dur.toFixed(2)}s` : "—"}</span></div>
                    <div>videoWidth×Height: <span style={{ color: "rgba(255, 220, 120, 0.95)" }}>{slateClipDiag.vw > 0 ? `${slateClipDiag.vw}×${slateClipDiag.vh}` : "—"}</span></div>
                    <div>seeked (first frame): <span style={{ color: slateClipDiag.seeked ? "rgba(100, 255, 120, 0.95)" : "rgba(255, 200, 100, 0.80)" }}>{slateClipDiag.seeked ? "yes" : "no"}</span></div>
                    <div>hasAudio: <span style={{ color: "rgba(255, 220, 120, 0.95)" }}>{slateRecordHasAudio ? "yes" : "no"}</span></div>
                    <div>events: <span style={{ color: "rgba(180, 230, 255, 0.90)" }}>{slateClipDiag.events.length > 0 ? slateClipDiag.events.join(" → ") : "—"}</span></div>
                    <button
                      type="button"
                      style={{ marginTop: "3px", height: "20px", borderRadius: "4px", border: "1px solid rgba(100, 200, 100, 0.35)", background: "rgba(0, 60, 20, 0.60)", color: "rgba(140, 255, 140, 0.90)", fontFamily: "'SF Mono', 'Roboto Mono', monospace", fontSize: "8.5px", fontWeight: 600, cursor: "pointer", letterSpacing: "0.03em" }}
                      onClick={() => { if (slateRecordBlobUrl) window.open(slateRecordBlobUrl, "_blank"); }}
                    >
                      Open Clip ↗
                    </button>
                  </div>
                ) : null}
                {/* Primary action — Share full-width */}
                <button
                  type="button"
                  className="control-button"
                  disabled={slateIsSharing}
                  style={{ width: "100%", height: "38px", borderRadius: "9px", border: "1px solid rgba(80, 160, 255, 0.50)", background: slateIsSharing ? "rgba(8, 28, 58, 0.60)" : "rgba(16, 48, 96, 0.82)", color: slateIsSharing ? "rgba(170, 210, 255, 0.45)" : "rgba(180, 222, 255, 0.96)", fontFamily: "Inter, system-ui, sans-serif", fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em", cursor: slateIsSharing ? "default" : "pointer", minWidth: 0 }}
                  onClick={() => { void slateShareClip(); }}
                >
                  {slateIsSharing ? "Preparing coaching clip…" : "Share"}
                </button>
                {/* Secondary actions — 2-column grid, no width:100% inheritance issues */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px" }}>
                  <button
                    type="button"
                    className="control-button"
                    style={{ height: "32px", borderRadius: "8px", border: "1px solid rgba(100, 160, 255, 0.28)", background: "rgba(8, 24, 52, 0.64)", color: "rgba(160, 202, 255, 0.84)", fontFamily: "Inter, system-ui, sans-serif", fontSize: "10px", fontWeight: 650, letterSpacing: "0.04em", cursor: "pointer", minWidth: 0, width: "auto" }}
                    onClick={slateSaveClip}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="control-button"
                    style={{ height: "32px", borderRadius: "8px", border: "1px solid rgba(160, 60, 60, 0.28)", background: "transparent", color: "rgba(255, 130, 130, 0.68)", fontFamily: "Inter, system-ui, sans-serif", fontSize: "10px", fontWeight: 600, letterSpacing: "0.04em", cursor: "pointer", minWidth: 0, width: "auto" }}
                    onClick={slateDismissRecord}
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {!isWhiteboardMode && slateRecordPhase === "countdown" ? (
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 30, fontSize: "100px", fontWeight: 900, color: "rgba(255, 255, 255, 0.94)", fontFamily: "Inter, system-ui, sans-serif", textShadow: "0 4px 32px rgba(0, 0, 0, 0.90)", pointerEvents: "none", userSelect: "none", lineHeight: 1 }}>
            {slateRecordCountdown}
          </div>
        ) : null}
        {!isWhiteboardMode && slateRecordPhase === "recording" ? (() => {
          const urgent = slateRecordElapsed >= 570;
          return (
            <div style={{ position: "fixed", top: "max(10px, calc(env(safe-area-inset-top, 0px) + 8px))", right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))", zIndex: 25, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", background: "rgba(8, 14, 10, 0.88)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderRadius: "20px", padding: "5px 10px 5px 7px", border: `1px solid ${urgent ? "rgba(255, 180, 60, 0.40)" : "rgba(255, 48, 48, 0.32)"}`, pointerEvents: "none" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: urgent ? "#ffb83c" : "#ff3030", boxShadow: urgent ? "0 0 6px 1px rgba(255, 184, 60, 0.70)" : "0 0 6px 1px rgba(255, 48, 48, 0.70)", animation: "tp-rec-pulse 1.1s ease-in-out infinite", flexShrink: 0 }} />
                <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em", color: urgent ? "rgba(255, 200, 100, 0.95)" : "rgba(255, 190, 190, 0.95)", fontFamily: "Inter, system-ui, sans-serif" }}>REC</span>
                {slateMicStatus === "active" ? <span style={{ fontSize: "11px", lineHeight: 1 }}>🎙</span> : null}
                <span style={{ fontSize: "10px", fontWeight: 600, fontFamily: "'SF Mono', 'Roboto Mono', 'Courier New', monospace", color: urgent ? "rgba(255, 200, 100, 0.95)" : "rgba(240, 220, 220, 0.80)", letterSpacing: "0.02em" }}>
                  {formatRecordTime(slateRecordElapsed)}
                </span>
              </div>
              <span style={{ fontSize: "8px", color: "rgba(180, 210, 255, 0.35)", fontFamily: "Inter, system-ui, sans-serif", paddingRight: "4px", pointerEvents: "none" }}>Auto-stops 10:00</span>
              <button
                type="button"
                onClick={slateStopRecording}
                style={{ padding: "6px 14px", borderRadius: "14px", border: "1px solid rgba(255, 70, 70, 0.55)", background: "rgba(36, 6, 6, 0.90)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: "rgba(255, 160, 160, 0.96)", fontFamily: "Inter, system-ui, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer" }}
              >
                ■ Stop
              </button>
            </div>
          );
        })() : null}
        {!isWhiteboardMode && shareTipMessage ? (
          <div style={SHARE_TIP_TOAST_STYLE} role="status" aria-live="polite">
            <p style={SHARE_TIP_TEXT_STYLE}>{shareTipMessage}</p>
          </div>
        ) : null}
        {!isWhiteboardMode && quickBoardFeedback ? (
          <div style={{ ...SHARE_TIP_TOAST_STYLE, top: "max(18px, calc(env(safe-area-inset-top, 0px) + 14px))" }} role="status" aria-live="polite">
            <p style={{ ...SHARE_TIP_TEXT_STYLE, whiteSpace: "pre-line" }}>{quickBoardFeedback}</p>
          </div>
        ) : null}
        {!isWhiteboardMode && pendingRecoveredBoardDraft && isRecoveredBoardPromptVisible ? (
          <div
            style={{
              ...SHARE_TIP_TOAST_STYLE,
              top: "max(72px, calc(env(safe-area-inset-top, 0px) + 68px))",
              width: "min(88vw, 320px)",
              pointerEvents: "auto",
              display: "grid",
              gap: "8px",
            }}
            role="dialog"
            aria-label="Recovered board draft"
          >
            <p style={{ ...SHARE_TIP_TEXT_STYLE, margin: 0 }}>Recovered unsaved board — Resume or Discard</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="control-button" style={QUICK_SHARE_OPTION_BUTTON_STYLE} onClick={resumeRecoveredBoardDraft}>
                Resume
              </button>
              <button
                type="button"
                className="control-button"
                style={QUICK_SHARE_OPTION_BUTTON_STYLE}
                onClick={discardRecoveredBoardDraft}
              >
                Discard
              </button>
            </div>
          </div>
        ) : null}
        {!isWhiteboardMode && (lastBoardSavedLabel || loadedBoardName) ? (
          <div
            style={{
              position: "absolute",
              top: "max(16px, calc(env(safe-area-inset-top, 0px) + 10px))",
              left: "max(14px, calc(env(safe-area-inset-left, 0px) + 10px))",
              zIndex: 30,
              padding: "6px 10px",
              borderRadius: "10px",
              background: "rgba(15, 23, 42, 0.62)",
              color: "rgba(241, 245, 249, 0.92)",
              fontSize: "11px",
              lineHeight: 1.25,
              pointerEvents: "none",
              maxWidth: "64vw",
            }}
          >
            {lastBoardSavedLabel ? <div>Last saved: {lastBoardSavedLabel}</div> : null}
            {loadedBoardName ? <div>Loaded: {loadedBoardName}</div> : null}
          </div>
        ) : null}
        {isWhiteboardMode ? (
          <>
            <button
              ref={whiteboardHomeButtonRef}
              type="button"
              style={WHITEBOARD_HOME_BUTTON_STYLE}
              onClick={openWhiteboardHomeConfirm}
              aria-label="Go to Home"
              aria-expanded={whiteboardHomeConfirmOpen}
            >
              ⌂
            </button>
            {whiteboardHomeConfirmOpen ? (
              <div ref={whiteboardHomeConfirmRef} style={WHITEBOARD_HOME_CONFIRM_STYLE} role="dialog" aria-modal="false">
                <p style={WHITEBOARD_HOME_CONFIRM_TITLE_STYLE}>Leave PáircVision Board?</p>
                <p style={WHITEBOARD_HOME_CONFIRM_MESSAGE_STYLE}>Your current board may not be saved.</p>
                <div style={WHITEBOARD_HOME_CONFIRM_ACTIONS_STYLE}>
                  <button type="button" style={WHITEBOARD_HOME_CONFIRM_BUTTON_STYLE} onClick={closeWhiteboardHomeConfirm}>
                    Cancel
                  </button>
                  <button type="button" style={WHITEBOARD_HOME_CONFIRM_GO_BUTTON_STYLE} onClick={confirmWhiteboardGoHome}>
                    Go Home
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </OrientationGate>
  );
}
