const HUB_CSS = `
.vt-hub {
  --vt-bg-deep: #03100B;
  --vt-bg: #06150F;
  --vt-border: #275C3B;
  --vt-text: #F1F7F0;
  --vt-text-muted: #8FA099;
  --vt-text-dim: #65736C;

  min-height: 100dvh;
  background:
    radial-gradient(circle at 14% 0%, rgba(124,255,114,0.07), transparent 34%),
    radial-gradient(circle at 86% 4%, rgba(34,197,94,0.06), transparent 30%),
    linear-gradient(180deg, var(--vt-bg-deep) 0%, var(--vt-bg) 42%, #072016 100%);
  color: var(--vt-text);
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding:
    calc(12px + env(safe-area-inset-top, 0px))
    16px
    calc(28px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
}

.vt-hub * {
  box-sizing: border-box;
}

.vt-topbar {
  display: flex;
  align-items: center;
  padding-bottom: 4px;
}

.vt-back-btn {
  background: none;
  border: 1px solid var(--vt-border);
  color: var(--vt-text-muted);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  border-radius: 10px;
  padding: 8px 14px;
  min-height: 40px;
  min-width: 44px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: color 100ms ease, background 100ms ease;
}

.vt-back-btn:active {
  background: rgba(255,255,255,0.05);
  color: var(--vt-text);
}

.vt-header {
  padding: 24px 4px 30px;
}

.vt-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--vt-text-dim);
  margin: 0 0 10px;
}

.vt-title {
  margin: 0;
  font-size: clamp(32px, 9vw, 48px);
  font-weight: 860;
  line-height: 0.95;
  letter-spacing: -0.03em;
  color: var(--vt-text);
}

.vt-tagline {
  margin: 12px 0 0;
  font-size: 15px;
  color: var(--vt-text-muted);
  line-height: 1.4;
}

.vt-cards {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr;
  flex: 1;
  align-content: start;
}

.vt-card {
  background: linear-gradient(180deg, rgba(20,52,33,0.92) 0%, rgba(13,34,22,0.97) 100%);
  border: 1px solid var(--vt-border);
  border-radius: 20px;
  padding: 26px 22px 22px;
  text-align: left;
  color: var(--vt-text);
  font-family: inherit;
  cursor: pointer;
  min-height: 190px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  transition: transform 100ms ease, box-shadow 130ms ease;
}

.vt-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  border-radius: 20px 20px 0 0;
}

.vt-card--slate::before {
  background: linear-gradient(90deg, rgba(34,197,94,0.9), rgba(34,197,94,0.3));
}

.vt-card--play::before {
  background: linear-gradient(90deg, rgba(6,182,212,0.9), rgba(6,182,212,0.3));
}

.vt-card--slate {
  box-shadow:
    0 0 0 0.5px rgba(34,197,94,0.10),
    0 8px 28px rgba(0,0,0,0.30),
    inset 0 1px 0 rgba(255,255,255,0.04);
}

.vt-card--play {
  box-shadow:
    0 0 0 0.5px rgba(6,182,212,0.10),
    0 8px 28px rgba(0,0,0,0.30),
    inset 0 1px 0 rgba(255,255,255,0.04);
}

.vt-card:active {
  transform: scale(0.985);
}

.vt-card-mode {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  margin: 0 0 12px;
  line-height: 1;
}

.vt-card--slate .vt-card-mode { color: rgba(34,197,94,0.80); }
.vt-card--play  .vt-card-mode { color: rgba(6,182,212,0.80);  }

.vt-card-title {
  font-size: clamp(24px, 6vw, 30px);
  font-weight: 820;
  letter-spacing: -0.025em;
  line-height: 1.0;
  margin: 0 0 10px;
}

.vt-card-sub {
  font-size: 13px;
  font-weight: 600;
  color: var(--vt-text-muted);
  margin: 0 0 14px;
}

.vt-card-desc {
  font-size: 13px;
  color: var(--vt-text-dim);
  line-height: 1.55;
  margin: 0;
  flex: 1;
}

.vt-card-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 20px;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  letter-spacing: 0.01em;
  padding: 9px 16px;
  border-radius: 10px;
  width: fit-content;
  border: none;
  cursor: pointer;
}

.vt-card--slate .vt-card-cta {
  background: rgba(34,197,94,0.12);
  color: rgba(34,197,94,0.95);
  outline: 1px solid rgba(34,197,94,0.20);
}

.vt-card--play .vt-card-cta {
  background: rgba(6,182,212,0.12);
  color: rgba(6,182,212,0.95);
  outline: 1px solid rgba(6,182,212,0.20);
}

@media (min-width: 600px) {
  .vt-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .vt-card {
    min-height: 270px;
  }
}

@media (min-width: 900px) {
  .vt-hub {
    max-width: 820px;
    margin: 0 auto;
    padding-top: calc(28px + env(safe-area-inset-top, 0px));
  }

  .vt-card {
    min-height: 310px;
  }

  .vt-card-desc {
    font-size: 14px;
  }
}
`;

function navigate(path: string) {
  if (typeof window !== "undefined" && window.location.pathname !== path) {
    window.location.assign(path);
  }
}

export default function VisionTacticsHub() {
  return (
    <div className="vt-hub">
      <style>{HUB_CSS}</style>

      <div className="vt-topbar">
        <button
          type="button"
          className="vt-back-btn"
          onClick={() => navigate("/board")}
          aria-label="Back to PáircVision home"
        >
          ← PáircVision
        </button>
      </div>

      <header className="vt-header">
        <p className="vt-eyebrow">Coaching Tools</p>
        <h1 className="vt-title">Vision<br />Tactics</h1>
        <p className="vt-tagline">Your tactical workspace.</p>
      </header>

      <div className="vt-cards">
        <button
          type="button"
          className="vt-card vt-card--slate"
          onClick={() => navigate("/vision-tactics/slate")}
          aria-label="Open Tactical Slate"
        >
          <p className="vt-card-mode">Tactical Slate</p>
          <h2 className="vt-card-title">Draw &amp;<br />Explain</h2>
          <p className="vt-card-sub">Static diagrams</p>
          <p className="vt-card-desc">
            Build tactical diagrams with players, arrows, notes, shapes and coaching marks.
          </p>
          <span className="vt-card-cta" aria-hidden="true">Open Slate →</span>
        </button>

        <button
          type="button"
          className="vt-card vt-card--play"
          onClick={() => navigate("/vision-tactics/play")}
          aria-label="Open Tactical Play"
        >
          <p className="vt-card-mode">Tactical Play</p>
          <h2 className="vt-card-title">Animate &amp;<br />Teach</h2>
          <p className="vt-card-sub">Movement &amp; playback</p>
          <p className="vt-card-desc">
            Bring movements to life with routes, playback, possession and future passing scenarios.
          </p>
          <span className="vt-card-cta" aria-hidden="true">Open Play →</span>
        </button>
      </div>
    </div>
  );
}
