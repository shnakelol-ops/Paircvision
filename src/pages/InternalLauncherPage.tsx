const INTERNAL_CSS = `
.il-shell {
  --il-bg: #06150F;
  --il-bg-deep: #03100B;
  --il-border: #275C3B;
  --il-card: #173D28;
  --il-card-hover: #1B4A30;
  --il-text: #F1F7F0;
  --il-text-muted: #8FA099;
  --il-text-dim: #65736C;
  --il-primary: #7CFF72;

  min-height: 100dvh;
  background:
    radial-gradient(circle at 14% 0%, rgba(124,255,114,0.06), transparent 34%),
    linear-gradient(180deg, var(--il-bg-deep) 0%, var(--il-bg) 42%, #072016 100%);
  color: var(--il-text);
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  box-sizing: border-box;
  padding:
    calc(14px + env(safe-area-inset-top, 0px))
    16px
    calc(28px + env(safe-area-inset-bottom, 0px));
}

.il-shell * {
  box-sizing: border-box;
}

.il-content {
  max-width: 520px;
  margin: 0 auto;
}

.il-back-btn {
  background: none;
  border: 1px solid var(--il-border);
  color: var(--il-text-muted);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  border-radius: 10px;
  padding: 8px 14px;
  min-height: 40px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.il-back-btn:active {
  background: rgba(255,255,255,0.05);
  color: var(--il-text);
}

.il-header {
  padding: 22px 4px 8px;
}

.il-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--il-text-dim);
  margin: 0 0 8px;
}

.il-title {
  margin: 0;
  font-size: clamp(26px, 7vw, 34px);
  font-weight: 820;
  line-height: 1.02;
  letter-spacing: -0.01em;
}

.il-subtitle {
  margin: 8px 0 0;
  color: var(--il-text-muted);
  font-size: 14px;
  line-height: 1.4;
  max-width: 46ch;
}

.il-list {
  display: grid;
  gap: 10px;
  margin-top: 22px;
}

.il-list-item {
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--il-border);
  background: linear-gradient(180deg, rgba(23,61,40,0.86) 0%, rgba(16,41,27,0.95) 100%);
  color: var(--il-text);
  text-align: left;
  padding: 16px 16px;
  font-family: inherit;
  cursor: pointer;
  display: block;
}

.il-list-item:active {
  background: var(--il-card-hover);
  transform: scale(0.99);
}

.il-list-item-name {
  display: block;
  font-size: 16px;
  font-weight: 750;
}

.il-list-item-sub {
  display: block;
  margin-top: 3px;
  color: var(--il-text-muted);
  font-size: 12.5px;
}
`;

type InternalTool = {
  name: string;
  sub: string;
  path: string;
};

const INTERNAL_TOOLS: readonly InternalTool[] = [
  { name: "Tactical Play", sub: "Movement, possession, passing scenarios", path: "/vision-tactics/play" },
  { name: "Match Stats", sub: "Pitch-first live event capture", path: "/flowstats" },
  { name: "Vision Training", sub: "Training Hub & Player Performance", path: "/vision-training" },
  { name: "Rapid Capture", sub: "Experimental capture surface", path: "/rapid-capture" },
];

function navigate(path: string) {
  if (typeof window !== "undefined" && window.location.pathname !== path) {
    window.location.assign(path);
  }
}

export default function InternalLauncherPage() {
  return (
    <div className="il-shell">
      <style>{INTERNAL_CSS}</style>
      <div className="il-content">
        <button
          type="button"
          className="il-back-btn"
          onClick={() => navigate("/board")}
          aria-label="Back to PáircVision home"
        >
          ← PáircVision
        </button>

        <div className="il-header">
          <p className="il-eyebrow">Owner Access</p>
          <h1 className="il-title">PáircVision Internal</h1>
          <p className="il-subtitle">Internal tools not included in the public V1 navigation.</p>
        </div>

        <div className="il-list">
          {INTERNAL_TOOLS.map((tool) => (
            <button
              key={tool.path}
              type="button"
              className="il-list-item"
              onClick={() => navigate(tool.path)}
            >
              <span className="il-list-item-name">{tool.name}</span>
              <span className="il-list-item-sub">{tool.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
