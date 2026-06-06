import VisionStadiumBackground from "../components/VisionStadiumBackground";

const VT_CSS = `
.vt-page-shell {
  position: relative;
  min-height: 100dvh;
  background: #050c14;
  overflow-x: hidden;
}

.vt-shell {
  position: relative;
  z-index: 1;
  min-height: 100dvh;
  color: #fff;
  font-family: Inter, system-ui, sans-serif;
}

.vt-container {
  max-width: 430px;
  margin: 0 auto;
  padding:
    calc(14px + env(safe-area-inset-top, 0px))
    14px
    calc(36px + env(safe-area-inset-bottom, 0px));
  display: grid;
  gap: 6px;
}

.vt-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding-bottom: 8px;
}

.vt-back-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid #17324a;
  background: rgba(10, 33, 52, 0.85);
  color: #cbd5e1;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-top: 3px;
  transition: opacity 120ms ease;
}

.vt-back-btn:active {
  opacity: 0.65;
}

.vt-heading {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.2px;
}

.vt-subheading {
  margin: 5px 0 0;
  font-size: 12px;
  color: #7a95ad;
  font-weight: 500;
  line-height: 1.3;
}

.vt-section-label {
  margin: 10px 2px 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #5a7080;
}

.vt-hub-panel {
  border: 1px solid #17324a;
  border-radius: 18px;
  background: #0a2134;
  padding: 14px;
  display: grid;
  gap: 10px;
}

.vt-hub-panel-head {
  display: grid;
  gap: 2px;
}

.vt-hub-panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #d0dde8;
}

.vt-hub-panel-sub {
  margin: 0;
  font-size: 11px;
  color: #5e7a8a;
  font-weight: 500;
}

.vt-hub-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.vt-hub-card {
  border: 1px solid #17324a;
  border-radius: 14px;
  background: #081726;
  padding: 12px 10px;
  text-align: left;
  min-height: 68px;
  opacity: 0.45;
  cursor: default;
  display: grid;
  align-content: start;
  gap: 4px;
}

.vt-hub-card--wide {
  grid-column: 1 / -1;
  min-height: 52px;
}

.vt-hub-card-name {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #c8d8e8;
  line-height: 1.2;
}

.vt-hub-card-sub {
  display: block;
  font-size: 10px;
  font-weight: 600;
  color: #4a6070;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.vt-tracker-panel {
  border: 1px solid #1c3d5c;
  border-radius: 18px;
  background: linear-gradient(180deg, #0d2438 0%, #09192a 100%);
  padding: 16px;
  display: grid;
  gap: 12px;
}

.vt-tracker-panel-head {
  display: grid;
  gap: 3px;
}

.vt-tracker-panel-title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #eef4ff;
}

.vt-tracker-panel-sub {
  margin: 0;
  font-size: 12px;
  color: #7a96b0;
  line-height: 1.4;
}

.vt-tracker-open-btn {
  width: 100%;
  border: 1px solid #16a34a;
  border-radius: 12px;
  background: #0a9349;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  padding: 14px;
  text-align: center;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 120ms ease, transform 100ms ease;
}

.vt-tracker-open-btn:active {
  opacity: 0.85;
  transform: scale(0.98);
}
`;

const HUB_CARDS = [
  { name: "New Session", sub: "Start tonight's training log" },
  { name: "Squad Attendance", sub: "Mark who trained" },
  { name: "Player Notes", sub: "Quick notes per player" },
  { name: "Session Review", sub: "End-of-night summary" },
] as const;

function navigate(path: string) {
  window.location.assign(path);
}

export default function VisionTrainingHome() {
  return (
    <div className="vt-page-shell">
      <style>{VT_CSS}</style>
      <VisionStadiumBackground variant="training" />
      <div className="vt-shell">
        <div className="vt-container">

          <div className="vt-header">
            <button
              type="button"
              className="vt-back-btn"
              aria-label="Back to home"
              onClick={() => navigate("/board")}
            >
              ←
            </button>
            <div>
              <h1 className="vt-heading">Vision Training</h1>
              <p className="vt-subheading">Training Hub · Player Performance</p>
            </div>
          </div>

          <p className="vt-section-label">Training Hub</p>
          <div className="vt-hub-panel">
            <div className="vt-hub-panel-head">
              <p className="vt-hub-panel-title">Training Hub</p>
              <p className="vt-hub-panel-sub">Record what happened at tonight's session</p>
            </div>
            <div className="vt-hub-grid">
              {HUB_CARDS.map((card) => (
                <div key={card.name} className="vt-hub-card" aria-disabled="true">
                  <span className="vt-hub-card-name">{card.name}</span>
                  <span className="vt-hub-card-sub">Coming Soon</span>
                </div>
              ))}
              <div className="vt-hub-card vt-hub-card--wide" aria-disabled="true">
                <span className="vt-hub-card-name">History</span>
                <span className="vt-hub-card-sub">Coming Soon</span>
              </div>
            </div>
          </div>

          <p className="vt-section-label">Performance Tracker</p>
          <div className="vt-tracker-panel">
            <div className="vt-tracker-panel-head">
              <p className="vt-tracker-panel-title">Performance Tracker</p>
              <p className="vt-tracker-panel-sub">
                Track player decisions, scores, work rate and mistakes
              </p>
            </div>
            <button
              type="button"
              className="vt-tracker-open-btn"
              onClick={() => navigate("/vision-training/performance")}
            >
              Open Tracker
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
