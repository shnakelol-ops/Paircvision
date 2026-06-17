import { useState, type CSSProperties } from "react";

import type {
  BallType,
  MovementBoardRoute,
  RouteMetadata,
  TacticalPassEvent,
} from "../../movement-board/shell/types";

type PlayerActionSheetProps = {
  playerId: string;
  playerNumber: number;
  hasBall: boolean;
  hasRoute: boolean;
  routeMeta: RouteMetadata | null;
  routes: MovementBoardRoute[];
  passEventsFromPlayer: TacticalPassEvent[];
  tokenNumberById: Record<string, number>;
  awayTokenIds: Set<string>;
  onClose: () => void;
  onGiveBall: () => void;
  onDrawRun: () => void;
  onSetRunDelay: (delayMs: number) => void;
  onSetRunTrigger: (triggeredById: string | null) => void;
  onAddPass: (toId: string, delayMs: number) => void;
  onAddShot: (delayMs: number) => void;
  sport: "football" | "hurling";
  onEditRun: () => void;
  onResetRun: () => void;
  onBallChoice: (ballType: BallType) => void;
  onFreeBall?: () => void;
  onPlay: () => void;
  onBehaviour: () => void;
};

type ExpandedSection = "run-timing" | "pass" | "ball" | null;

const SHOOT_SENTINEL = "__shoot__";

const DELAY_OPTIONS = [
  { ms: 0,    label: "Now"  },
  { ms: 500,  label: "+0.5s" },
  { ms: 1000, label: "+1s"  },
  { ms: 2000, label: "+2s"  },
  { ms: 3000, label: "+3s"  },
] as const;

const PASS_DELAY_OPTIONS = [
  { ms: 0,    label: "Now"  },
  { ms: 1000, label: "+1s"  },
  { ms: 2000, label: "+2s"  },
  { ms: 3000, label: "+3s"  },
] as const;

const BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 39,
  background: "rgba(0, 0, 0, 0.48)",
  pointerEvents: "none",
};

const SHEET: CSSProperties = {
  position: "fixed",
  bottom: "max(60px, calc(env(safe-area-inset-bottom, 0px) + 58px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 40,
  width: "min(380px, calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  background: "rgba(4, 10, 24, 0.97)",
  backdropFilter: "blur(22px)",
  WebkitBackdropFilter: "blur(22px)",
  border: "1px solid rgba(180, 210, 255, 0.16)",
  borderRadius: "14px",
  boxShadow: "0 18px 44px rgba(0, 0, 0, 0.72), 0 6px 16px rgba(0, 0, 0, 0.40)",
  padding: "10px 10px 12px",
  display: "grid",
  gap: "6px",
  fontFamily: "Inter, system-ui, sans-serif",
};

const HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingBottom: "4px",
  borderBottom: "1px solid rgba(180, 210, 255, 0.10)",
};

const HEADER_TITLE: CSSProperties = {
  color: "rgba(180, 210, 255, 0.55)",
  fontSize: "8px",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  userSelect: "none",
};

const CLOSE_BTN: CSSProperties = {
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  border: "1px solid rgba(180, 210, 255, 0.15)",
  background: "rgba(10, 20, 42, 0.60)",
  color: "rgba(180, 210, 255, 0.50)",
  fontSize: "13px",
  lineHeight: "1",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const BTN_ROW: CSSProperties = {
  display: "flex",
  gap: "5px",
  flexWrap: "wrap",
};

const ACTION_BTN: CSSProperties = {
  height: "30px",
  minWidth: "70px",
  borderRadius: "8px",
  border: "1px solid rgba(180, 210, 255, 0.18)",
  background: "rgba(10, 22, 50, 0.72)",
  color: "rgba(200, 225, 255, 0.90)",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "0 10px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  flex: "1 1 auto",
};

const ACTION_BTN_ACTIVE: CSSProperties = {
  ...ACTION_BTN,
  border: "1px solid rgba(124, 255, 114, 0.50)",
  background: "rgba(18, 56, 34, 0.80)",
  color: "#e8ffe6",
};

const ACTION_BTN_GREEN: CSSProperties = {
  ...ACTION_BTN,
  border: "1px solid rgba(74, 222, 128, 0.45)",
  background: "rgba(16, 48, 30, 0.80)",
  color: "rgba(180, 255, 160, 0.92)",
};

const SUB_LABEL: CSSProperties = {
  color: "rgba(180, 210, 255, 0.40)",
  fontSize: "7px",
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  userSelect: "none",
  alignSelf: "center",
  whiteSpace: "nowrap",
};

const CHIP: CSSProperties = {
  height: "24px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.18)",
  background: "rgba(8, 18, 40, 0.70)",
  color: "rgba(200, 230, 255, 0.82)",
  fontSize: "9px",
  fontWeight: 600,
  padding: "0 9px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const CHIP_ACTIVE: CSSProperties = {
  ...CHIP,
  border: "1px solid rgba(124, 255, 114, 0.52)",
  background: "rgba(18, 56, 34, 0.82)",
  color: "#c8ffc0",
};

const CHIP_ROW: CSSProperties = {
  display: "flex",
  gap: "4px",
  flexWrap: "wrap",
  alignItems: "center",
};

const SUB_SECTION: CSSProperties = {
  display: "grid",
  gap: "5px",
  paddingTop: "2px",
  borderTop: "1px solid rgba(180, 210, 255, 0.08)",
};

const CONFIRM_BTN: CSSProperties = {
  height: "28px",
  borderRadius: "8px",
  border: "1px solid rgba(74, 222, 128, 0.40)",
  background: "rgba(16, 48, 30, 0.82)",
  color: "rgba(160, 255, 140, 0.92)",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "0 12px",
  cursor: "pointer",
  alignSelf: "flex-start",
};

export default function PlayerActionSheet({
  playerId,
  playerNumber,
  hasBall,
  hasRoute,
  routeMeta,
  routes,
  tokenNumberById,
  awayTokenIds,
  onClose,
  onGiveBall,
  onDrawRun,
  onSetRunDelay,
  onSetRunTrigger,
  onAddPass,
  onAddShot,
  sport,
  onEditRun,
  onResetRun,
  onBallChoice,
  onFreeBall,
  onPlay,
  onBehaviour,
}: PlayerActionSheetProps) {
  const [expanded, setExpanded] = useState<ExpandedSection>(null);
  const [passToId, setPassToId] = useState<string | null>(null);
  const [passDelayMs, setPassDelayMs] = useState(0);

  const toggle = (section: ExpandedSection) =>
    setExpanded((prev) => (prev === section ? null : section));

  const homePlayerEntries = Object.entries(tokenNumberById)
    .filter(([id]) => !awayTokenIds.has(id))
    .sort((a, b) => a[1] - b[1]);

  const triggerCandidates = routes.filter(
    (r) => !awayTokenIds.has(r.playerId) && r.playerId !== playerId,
  );

  const ballTypeOptions: Array<{ type: BallType; label: string }> =
    sport === "hurling"
      ? [
          { type: "sliotarSmall",  label: "Sliotar S" },
          { type: "sliotarMedium", label: "Sliotar M" },
        ]
      : [
          { type: "footballSmall",  label: "Ball S" },
          { type: "footballMedium", label: "Ball M" },
        ];

  const currentRunDelayMs = routeMeta?.delayMs ?? 0;
  const currentRunTriggerId = routeMeta?.triggeredBy ?? null;

  return (
    <>
      <div style={BACKDROP} onClick={onClose} />
      <div style={SHEET} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={HEADER}>
          <span style={HEADER_TITLE}>P{playerNumber}</span>
          <button type="button" style={CLOSE_BTN} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {/* Primary action row */}
        <div style={BTN_ROW}>
          <button
            type="button"
            style={hasBall ? { ...ACTION_BTN, opacity: 0.4, cursor: "default" } : ACTION_BTN_GREEN}
            disabled={hasBall}
            onClick={() => { onGiveBall(); onClose(); }}
          >
            Give Ball
          </button>
          <button
            type="button"
            style={ACTION_BTN}
            onClick={() => { onDrawRun(); onClose(); }}
          >
            Draw Run
          </button>
          <button
            type="button"
            style={ACTION_BTN}
            onClick={() => { onBehaviour(); }}
          >
            Behaviour
          </button>
        </div>

        {/* Route actions row — only when player has a route */}
        {hasRoute && (
          <div style={BTN_ROW}>
            <button
              type="button"
              style={ACTION_BTN}
              onClick={() => { onEditRun(); }}
            >
              Edit Run
            </button>
            <button
              type="button"
              style={{ ...ACTION_BTN, border: "1px solid rgba(255, 100, 100, 0.30)", color: "rgba(255, 180, 180, 0.80)" }}
              onClick={() => { onResetRun(); }}
            >
              Reset Run
            </button>
          </div>
        )}

        {/* Second action row */}
        <div style={BTN_ROW}>
          <button
            type="button"
            style={expanded === "run-timing" ? ACTION_BTN_ACTIVE : (hasRoute ? ACTION_BTN : { ...ACTION_BTN, opacity: 0.4, cursor: "default" })}
            disabled={!hasRoute}
            onClick={() => { if (hasRoute) toggle("run-timing"); }}
          >
            Run Timing
          </button>
          <button
            type="button"
            style={expanded === "ball" ? ACTION_BTN_ACTIVE : ACTION_BTN}
            onClick={() => toggle("ball")}
          >
            Ball
          </button>
          <button
            type="button"
            style={expanded === "pass" ? ACTION_BTN_ACTIVE : ACTION_BTN}
            onClick={() => toggle("pass")}
          >
            Pass
          </button>
          <button
            type="button"
            style={ACTION_BTN_GREEN}
            onClick={() => { onPlay(); onClose(); }}
          >
            Play
          </button>
        </div>

        {/* Run Timing sub-section */}
        {expanded === "run-timing" && (
          <div style={SUB_SECTION}>
            <div style={CHIP_ROW}>
              <span style={SUB_LABEL}>Delay</span>
              {DELAY_OPTIONS.map((opt) => (
                <button
                  key={opt.ms}
                  type="button"
                  style={currentRunTriggerId == null && currentRunDelayMs === opt.ms ? CHIP_ACTIVE : CHIP}
                  onClick={() => onSetRunDelay(opt.ms)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {triggerCandidates.length > 0 && (
              <div style={CHIP_ROW}>
                <span style={SUB_LABEL}>After</span>
                {currentRunTriggerId != null && (
                  <button type="button" style={CHIP} onClick={() => onSetRunTrigger(null)}>
                    ×
                  </button>
                )}
                {triggerCandidates.map((r) => {
                  const num = tokenNumberById[r.playerId] ?? "?";
                  return (
                    <button
                      key={r.playerId}
                      type="button"
                      style={currentRunTriggerId === r.playerId ? CHIP_ACTIVE : CHIP}
                      onClick={() => onSetRunTrigger(r.playerId)}
                    >
                      P{num}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Ball sub-section */}
        {expanded === "ball" && (
          <div style={SUB_SECTION}>
            <div style={CHIP_ROW}>
              <span style={SUB_LABEL}>Type</span>
              {ballTypeOptions.map((opt) => (
                <button
                  key={opt.type}
                  type="button"
                  style={CHIP}
                  onClick={() => { onBallChoice(opt.type); setExpanded(null); }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {hasBall && onFreeBall && (
              <div style={CHIP_ROW}>
                <button
                  type="button"
                  style={CHIP}
                  onClick={() => { onFreeBall(); setExpanded(null); }}
                >
                  Free Ball
                </button>
              </div>
            )}
          </div>
        )}

        {/* Pass sub-section */}
        {expanded === "pass" && (
          <div style={SUB_SECTION}>
            <div style={CHIP_ROW}>
              <span style={SUB_LABEL}>To</span>
              {homePlayerEntries
                .filter(([id]) => id !== playerId)
                .map(([id, num]) => (
                  <button
                    key={id}
                    type="button"
                    style={passToId === id ? CHIP_ACTIVE : CHIP}
                    onClick={() => setPassToId((prev) => (prev === id ? null : id))}
                  >
                    P{num}
                  </button>
                ))}
              <button
                type="button"
                style={passToId === SHOOT_SENTINEL ? CHIP_ACTIVE : CHIP}
                onClick={() => setPassToId((prev) => (prev === SHOOT_SENTINEL ? null : SHOOT_SENTINEL))}
              >
                Shoot
              </button>
            </div>
            {passToId && (
              <div style={CHIP_ROW}>
                <span style={SUB_LABEL}>Time</span>
                {PASS_DELAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.ms}
                    type="button"
                    style={passDelayMs === opt.ms ? CHIP_ACTIVE : CHIP}
                    onClick={() => setPassDelayMs(opt.ms)}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  style={CONFIRM_BTN}
                  onClick={() => {
                    if (passToId === SHOOT_SENTINEL) {
                      onAddShot(passDelayMs);
                    } else {
                      onAddPass(passToId, passDelayMs);
                    }
                    setPassToId(null);
                    setPassDelayMs(0);
                    setExpanded(null);
                  }}
                >
                  {passToId === SHOOT_SENTINEL ? "Add Shoot" : "Add Pass"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
