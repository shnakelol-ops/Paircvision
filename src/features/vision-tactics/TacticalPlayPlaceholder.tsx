const PLACEHOLDER_CSS = `
.tpp-shell {
  --tpp-bg-deep: #03100B;
  --tpp-bg: #06150F;
  --tpp-border: #275C3B;
  --tpp-text: #F1F7F0;
  --tpp-text-muted: #8FA099;
  --tpp-text-dim: #65736C;
  --tpp-play-color: rgba(6, 182, 212, 1);

  min-height: 100dvh;
  background:
    radial-gradient(circle at 50% 0%, rgba(6,182,212,0.06), transparent 40%),
    linear-gradient(180deg, var(--tpp-bg-deep) 0%, var(--tpp-bg) 50%, #060f14 100%);
  color: var(--tpp-text);
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding:
    calc(12px + env(safe-area-inset-top, 0px))
    20px
    calc(28px + env(safe-area-inset-bottom, 0px));
}

.tpp-shell * {
  box-sizing: border-box;
}

.tpp-topbar {
  display: flex;
  align-items: center;
  padding-bottom: 4px;
}

.tpp-back-btn {
  background: none;
  border: 1px solid var(--tpp-border);
  color: var(--tpp-text-muted);
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

.tpp-back-btn:active {
  background: rgba(255,255,255,0.05);
  color: var(--tpp-text);
}

.tpp-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 0 4px;
  max-width: 480px;
}

.tpp-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(6,182,212,0.75);
  border: 1px solid rgba(6,182,212,0.22);
  background: rgba(6,182,212,0.08);
  border-radius: 999px;
  padding: 5px 12px;
  margin-bottom: 22px;
  display: inline-block;
}

.tpp-title {
  font-size: clamp(32px, 9vw, 52px);
  font-weight: 860;
  letter-spacing: -0.03em;
  line-height: 0.95;
  margin: 0 0 14px;
}

.tpp-sub {
  font-size: 17px;
  font-weight: 650;
  color: rgba(6,182,212,0.85);
  margin: 0 0 22px;
  line-height: 1.3;
}

.tpp-desc {
  font-size: 15px;
  color: var(--tpp-text-muted);
  line-height: 1.6;
  margin: 0;
  max-width: 360px;
}

@media (min-width: 600px) {
  .tpp-content {
    padding-left: 8px;
  }
}
`;

function navigate(path: string) {
  if (typeof window !== "undefined" && window.location.pathname !== path) {
    window.location.assign(path);
  }
}

export default function TacticalPlayPlaceholder() {
  return (
    <div className="tpp-shell">
      <style>{PLACEHOLDER_CSS}</style>

      <div className="tpp-topbar">
        <button
          type="button"
          className="tpp-back-btn"
          onClick={() => navigate("/vision-tactics")}
          aria-label="Back to Vision Tactics"
        >
          ← Vision Tactics
        </button>
      </div>

      <div className="tpp-content">
        <span className="tpp-badge">Coming Soon</span>
        <h1 className="tpp-title">Tactical Play</h1>
        <p className="tpp-sub">Animate &amp; Teach</p>
        <p className="tpp-desc">
          Routes, playback, possession and passing scenarios will live here.
        </p>
      </div>
    </div>
  );
}
