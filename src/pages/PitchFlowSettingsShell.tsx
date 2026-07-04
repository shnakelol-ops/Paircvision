import { useState } from "react";
import { BackupRestoreView } from "../backup/BackupRestoreView";

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsView = "landing" | "backup" | "privacy" | "terms" | "storage" | "contact";

function initialSettingsView(): SettingsView {
  if (typeof window === "undefined") return "landing";
  const params = new URLSearchParams(window.location.search);
  return params.get("view") === "backup" ? "backup" : "landing";
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APP_VERSION = "0.1.0 Beta";
const CONTACT_EMAIL = "paircvision@gmail.com";
const HOME_PATH = "/board";

// ─── CSS ─────────────────────────────────────────────────────────────────────

const SETTINGS_CSS = `
.ps-shell {
  --ps-bg: #06150F;
  --ps-bg-deep: #03100B;
  --ps-surface: #10291B;
  --ps-border: #275C3B;
  --ps-primary: #7CFF72;
  --ps-primary-strong: #22C55E;
  --ps-primary-soft: rgba(124,255,114,0.14);
  --ps-text: #F1F7F0;
  --ps-text-muted: #8FA099;
  --ps-text-dim: #65736C;
  --ps-warning: #F5A623;
  min-height: 100dvh;
  background:
    radial-gradient(circle at 14% 0%, rgba(124,255,114,0.08), transparent 34%),
    radial-gradient(circle at 86% 4%, rgba(34,197,94,0.07), transparent 30%),
    linear-gradient(180deg, var(--ps-bg-deep) 0%, var(--ps-bg) 42%, #072016 100%);
  color: var(--ps-text);
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  box-sizing: border-box;
}

.ps-shell * { box-sizing: border-box; }

/* ── Sub-page fixed header ──────────────────────────────────────────────── */

.ps-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: calc(52px + env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
  background: rgba(3,16,11,0.96);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--ps-border);
  display: flex;
  align-items: center;
  gap: 10px;
  padding-left: 8px;
  padding-right: 16px;
  z-index: 100;
}

.ps-header-back {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  border: 1px solid var(--ps-border);
  background: rgba(16,41,27,0.7);
  color: var(--ps-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
}

.ps-header-back:active { transform: scale(0.95); }

.ps-header-title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--ps-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Landing ────────────────────────────────────────────────────────────── */

.ps-landing {
  padding: calc(env(safe-area-inset-top, 0px) + 14px) 14px
    calc(env(safe-area-inset-bottom, 0px) + 40px);
  max-width: 520px;
  margin: 0 auto;
}

.ps-landing-header {
  border-radius: 18px;
  border: 1px solid var(--ps-border);
  background: linear-gradient(180deg, rgba(18,56,33,0.96) 0%, rgba(16,41,27,0.95) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 14px 28px rgba(0,0,0,0.28);
  backdrop-filter: blur(8px);
  padding: 14px 16px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.ps-landing-back {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--ps-border);
  background: rgba(16,41,27,0.7);
  color: var(--ps-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
}

.ps-landing-back:active { transform: scale(0.95); }

.ps-landing-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--ps-text);
}

.ps-landing-subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--ps-text-muted);
  line-height: 1.35;
}

/* ── Settings list ──────────────────────────────────────────────────────── */

.ps-section-label {
  margin: 0 4px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ps-text-dim);
}

.ps-list {
  border-radius: 16px;
  border: 1px solid var(--ps-border);
  background: linear-gradient(180deg, rgba(23,61,40,0.86) 0%, rgba(16,41,27,0.95) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 20px rgba(0,0,0,0.22);
  overflow: hidden;
}

.ps-list-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid rgba(39,92,59,0.45);
  background: none;
  color: var(--ps-text);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: background 120ms ease;
  min-height: 60px;
}

.ps-list-item:last-child { border-bottom: none; }
.ps-list-item:active { background: rgba(124,255,114,0.06); }

.ps-list-icon {
  font-size: 18px;
  width: 28px;
  text-align: center;
  flex-shrink: 0;
}

.ps-list-text { flex: 1; min-width: 0; }

.ps-list-item-title {
  display: block;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.2;
}

.ps-list-item-desc {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  color: var(--ps-text-muted);
  line-height: 1.3;
}

.ps-chevron {
  color: var(--ps-text-dim);
  font-size: 18px;
  flex-shrink: 0;
}

/* ── Footer ─────────────────────────────────────────────────────────────── */

.ps-footer {
  margin-top: 28px;
  text-align: center;
}

.ps-footer-version {
  display: block;
  font-size: 12px;
  color: var(--ps-text-dim);
}

.ps-footer-attr {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--ps-text-dim);
}

/* ── Sub-page scroll area ───────────────────────────────────────────────── */

.ps-scroll {
  padding-top: calc(52px + env(safe-area-inset-top, 0px) + 20px);
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: calc(48px + env(safe-area-inset-bottom, 0px));
  max-width: 520px;
  margin: 0 auto;
}

/* ── Legal typography ───────────────────────────────────────────────────── */

.ps-legal-intro {
  margin: 0 0 20px;
  font-size: 12px;
  color: var(--ps-text-dim);
  font-style: italic;
}

.ps-legal-section { margin-bottom: 4px; }

.ps-legal-h2 {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 750;
  color: var(--ps-text);
  line-height: 1.25;
}

.ps-legal-h3 {
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--ps-text);
}

.ps-legal-p {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--ps-text-muted);
  line-height: 1.6;
}

.ps-legal-p:last-child { margin-bottom: 0; }

.ps-legal-ul {
  margin: 4px 0 10px;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.ps-legal-li {
  font-size: 13px;
  color: var(--ps-text-muted);
  line-height: 1.5;
  padding-left: 16px;
  position: relative;
}

.ps-legal-li::before {
  content: "–";
  position: absolute;
  left: 0;
  color: var(--ps-text-dim);
}

.ps-note {
  border-left: 3px solid var(--ps-warning);
  background: rgba(245,166,35,0.08);
  border-radius: 0 10px 10px 0;
  padding: 12px 14px;
  margin: 12px 0;
}

.ps-note-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 750;
  color: var(--ps-warning);
}

.ps-note-body {
  margin: 0;
  font-size: 13px;
  color: var(--ps-text);
  line-height: 1.55;
}

.ps-legal-divider {
  height: 1px;
  background: var(--ps-border);
  margin: 20px 0;
  opacity: 0.5;
}

.ps-info-card {
  border-radius: 10px;
  border: 1px solid var(--ps-border);
  background: rgba(16,41,27,0.6);
  padding: 11px 12px;
  margin-bottom: 8px;
}

.ps-info-card-label {
  margin: 0 0 4px;
  font-size: 10px;
  font-weight: 750;
  color: var(--ps-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ps-info-card-body {
  margin: 0;
  font-size: 13px;
  color: var(--ps-text-muted);
  line-height: 1.55;
}

.ps-info-card-value {
  margin: 0;
  font-size: 13px;
  color: var(--ps-text-muted);
  line-height: 1.4;
}

.ps-info-card-value strong { color: var(--ps-text); font-weight: 650; }

.ps-primary-btn,
.ps-secondary-btn {
  width: 100%;
  min-height: 44px;
  border-radius: 12px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
}

.ps-primary-btn {
  border: 1px solid var(--ps-primary-strong);
  background: linear-gradient(180deg, rgba(34,197,94,0.28) 0%, rgba(16,41,27,0.95) 100%);
  color: var(--ps-text);
}

.ps-primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ps-secondary-btn {
  border: 1px solid var(--ps-border);
  background: rgba(16,41,27,0.75);
  color: var(--ps-text);
}

.ps-primary-btn:active:not(:disabled),
.ps-secondary-btn:active {
  transform: scale(0.99);
}

/* ── Storage & Permissions ──────────────────────────────────────────────── */

.ps-perm-list { display: grid; gap: 10px; }

.ps-perm-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 14px;
  border-radius: 12px;
  border: 1px solid var(--ps-border);
  background: linear-gradient(180deg, rgba(20,52,33,0.92) 0%, rgba(16,41,27,0.88) 100%);
}

.ps-perm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}

.ps-perm-dot--green { background: #22C55E; }
.ps-perm-dot--amber { background: #F5A623; }
.ps-perm-dot--blue  { background: #60A5FA; }

.ps-perm-item-title {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--ps-text);
  margin-bottom: 3px;
}

.ps-perm-item-body {
  display: block;
  font-size: 12px;
  color: var(--ps-text-muted);
  line-height: 1.45;
}

/* ── Contact ────────────────────────────────────────────────────────────── */

.ps-contact-card {
  border-radius: 14px;
  border: 1px solid var(--ps-border);
  background: linear-gradient(180deg, rgba(23,61,40,0.86) 0%, rgba(16,41,27,0.95) 100%);
  padding: 20px 16px;
  text-align: center;
  margin-bottom: 16px;
}

.ps-contact-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ps-text-dim);
}

.ps-contact-email {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--ps-primary);
  word-break: break-all;
}

.ps-contact-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--ps-text-muted);
  line-height: 1.4;
}

.ps-btn-row { display: grid; gap: 10px; }

.ps-btn {
  display: block;
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--ps-primary-strong);
  background: linear-gradient(180deg, rgba(34,197,94,0.36) 0%, rgba(27,74,48,0.95) 100%);
  color: var(--ps-text);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  text-decoration: none;
  transition: transform 100ms ease;
}

.ps-btn:active { transform: scale(0.97); }

.ps-btn-secondary {
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid var(--ps-border);
  background: rgba(20,52,33,0.92);
  color: var(--ps-text);
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  font-family: inherit;
  text-align: center;
  transition: transform 100ms ease;
}

.ps-btn-secondary:active { transform: scale(0.97); }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function navigateTo(path: string) {
  if (window.location.pathname === path) return;
  window.location.assign(path);
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="ps-header">
      <button type="button" className="ps-header-back" onClick={onBack} aria-label="Go back">
        ←
      </button>
      <h1 className="ps-header-title">{title}</h1>
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────

function LandingView({ onNavigate }: { onNavigate: (v: SettingsView) => void }) {
  const dataItems: Array<{ view: SettingsView; icon: string; title: string; desc: string }> = [
    {
      view: "backup",
      icon: "💾",
      title: "Backup & Restore",
      desc: "Save every match, board and squad to a file you control",
    },
  ];

  const items: Array<{ view: SettingsView; icon: string; title: string; desc: string }> = [
    {
      view: "privacy",
      icon: "🔒",
      title: "Privacy Policy",
      desc: "How PáircVision handles your data",
    },
    {
      view: "terms",
      icon: "📄",
      title: "Terms & Conditions",
      desc: "Your rights and responsibilities when using the app",
    },
    {
      view: "storage",
      icon: "📱",
      title: "Storage & Permissions",
      desc: "What the app stores on your device and why",
    },
    {
      view: "contact",
      icon: "✉️",
      title: "Contact Support",
      desc: "Questions, feedback or privacy requests",
    },
  ];

  return (
    <div className="ps-landing">
      <div className="ps-landing-header">
        <button
          type="button"
          className="ps-landing-back"
          onClick={() => navigateTo(HOME_PATH)}
          aria-label="Back to home"
        >
          ←
        </button>
        <div>
          <h1 className="ps-landing-title">Settings</h1>
          <p className="ps-landing-subtitle">Privacy, legal and support</p>
        </div>
      </div>

      <p className="ps-section-label">Your data</p>
      <nav className="ps-list" aria-label="Backup and data" style={{ marginBottom: "20px" }}>
        {dataItems.map((item) => (
          <button
            key={item.view}
            type="button"
            className="ps-list-item"
            onClick={() => onNavigate(item.view)}
          >
            <span className="ps-list-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="ps-list-text">
              <span className="ps-list-item-title">{item.title}</span>
              <span className="ps-list-item-desc">{item.desc}</span>
            </span>
            <span className="ps-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </nav>

      <p className="ps-section-label">Privacy &amp; Legal</p>
      <nav className="ps-list" aria-label="Privacy and legal">
        {items.map((item) => (
          <button
            key={item.view}
            type="button"
            className="ps-list-item"
            onClick={() => onNavigate(item.view)}
          >
            <span className="ps-list-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="ps-list-text">
              <span className="ps-list-item-title">{item.title}</span>
              <span className="ps-list-item-desc">{item.desc}</span>
            </span>
            <span className="ps-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </nav>

      <div className="ps-footer">
        <span className="ps-footer-version">PáircVision {APP_VERSION}</span>
        <span className="ps-footer-attr">Gaelic Games Coaching Hub</span>
      </div>
    </div>
  );
}

// ─── Privacy Policy ───────────────────────────────────────────────────────────

function PrivacyPolicyView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <SubHeader title="Privacy Policy" onBack={onBack} />
      <div className="ps-scroll">
        <p className="ps-legal-intro">Version 1.0 — Beta · Last updated: 16 June 2026</p>

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">1. Who We Are</h2>
          <p className="ps-legal-p">
            PáircVision is a coaching platform for Gaelic games, created and operated by{" "}
            <strong>Seán Kelly</strong>, an independent developer based in Ireland.
          </p>
          <p className="ps-legal-p">
            In this Privacy Policy, "PáircVision", "we", "us" and "our" refer to Seán Kelly, the
            developer and operator of the application.
          </p>
          <p className="ps-legal-p">
            If you have any questions about this Privacy Policy or how PáircVision handles
            information, you can contact us at: <strong>{CONTACT_EMAIL}</strong>
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">2. What This Policy Covers</h2>
          <p className="ps-legal-p">
            This policy explains what information is collected when you use PáircVision, how it is
            handled, where it is stored, and what rights you have under GDPR and applicable Irish
            law.
          </p>
          <p className="ps-legal-p">
            PáircVision is built on an architecture that is deliberately local-first: the coaching
            data you create stays on your own device. It is not uploaded to our servers.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">3. The Short Version</h2>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              PáircVision does not create user accounts and does not ask for your name, email
              address, or any personal details.
            </li>
            <li className="ps-legal-li">
              The coaching data you create — match statistics, player names, voice notes, training
              records, tactical boards — is stored in your browser, on your device, and is never
              sent to us or to any third party.
            </li>
            <li className="ps-legal-li">
              The only personal data processed as part of providing the service is the standard
              technical information associated with delivering the application through our hosting
              provider, Vercel.
            </li>
            <li className="ps-legal-li">
              We do not use analytics, advertising, tracking pixels, or any third-party services
              that profile your behaviour.
            </li>
            <li className="ps-legal-li">We do not set cookies.</li>
          </ul>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">4. Information We Do Not Collect</h2>
          <p className="ps-legal-p">PáircVision does not collect, receive, or store:</p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">Your name or email address</li>
            <li className="ps-legal-li">Login credentials or account information</li>
            <li className="ps-legal-li">Your physical location or GPS data</li>
            <li className="ps-legal-li">Payment card or banking information</li>
            <li className="ps-legal-li">Advertising identifiers or device fingerprints</li>
            <li className="ps-legal-li">
              Usage analytics, session recordings, or behavioural data
            </li>
            <li className="ps-legal-li">The contents of your voice notes</li>
            <li className="ps-legal-li">
              Your coaching data, match records, tactical boards, or training information
            </li>
            <li className="ps-legal-li">
              Player names or any information you enter about players
            </li>
          </ul>
          <p className="ps-legal-p">
            None of this information is transmitted from your device to PáircVision or to any third
            party.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">5. Information Collected When You Visit the App</h2>
          <h3 className="ps-legal-h3">5.1 Server Logs (Vercel)</h3>
          <p className="ps-legal-p">
            When your browser loads PáircVision, your device makes a standard HTTP request to our
            hosting provider, Vercel Inc. (USA). Vercel's servers automatically record:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">Your IP address</li>
            <li className="ps-legal-li">The date and time of the request</li>
            <li className="ps-legal-li">Browser and operating system type (User-Agent string)</li>
            <li className="ps-legal-li">The URL path requested</li>
            <li className="ps-legal-li">The HTTP status code returned</li>
          </ul>
          <p className="ps-legal-p">
            We access these logs only to diagnose technical problems. We process this data on the
            basis of our <strong>legitimate interests</strong> under Article 6(1)(f) GDPR.
          </p>
          <h3 className="ps-legal-h3">5.2 What Does Not Happen</h3>
          <p className="ps-legal-p">
            Once the app has loaded, all further activity takes place entirely within your browser.
            No further data is sent to our servers or to any external service.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">6. Coaching Data You Create</h2>
          <h3 className="ps-legal-h3">6.1 Where It Goes</h3>
          <p className="ps-legal-p">
            All coaching data is stored locally in your browser's built-in storage on your device.
            This includes:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">Saved matches, scores, and event logs</li>
            <li className="ps-legal-li">Team and player names, jersey numbers, and positions</li>
            <li className="ps-legal-li">Squad templates</li>
            <li className="ps-legal-li">Text notes and voice note recordings</li>
            <li className="ps-legal-li">
              Training session records, attendance, and per-player notes
            </li>
            <li className="ps-legal-li">Tactical board diagrams and scenarios</li>
            <li className="ps-legal-li">Player performance records</li>
          </ul>
          <p className="ps-legal-p">
            Unless you choose to export or share it, this data remains stored locally on your
            device. PáircVision never uploads your coaching data to our servers or to any third
            party.
          </p>

          <h3 className="ps-legal-h3">6.2 How It Is Stored</h3>
          <p className="ps-legal-p">
            <strong>localStorage</strong> — a key-value store in your browser where match records,
            notes, squad data, training sessions, and tactical boards are saved as text.
          </p>
          <p className="ps-legal-p">
            <strong>IndexedDB</strong> — a database built into your browser where voice note
            recordings are stored as WebM audio files.
          </p>
          <p className="ps-legal-p">
            Neither of these is a cookie. They are standard browser storage mechanisms used to make
            the app work offline and across sessions.
          </p>

          <div className="ps-note">
            <p className="ps-note-title">Important</p>
            <p className="ps-note-body">
              PáircVision stores your coaching information locally on your device. Clearing your
              browser data, uninstalling the application, resetting your browser, or moving to a
              different device may permanently remove your saved information. Because this
              information is not stored on PáircVision's servers, we cannot recover it for you.
            </p>
          </div>

          <h3 className="ps-legal-h3">6.3 Player Names and Personal Information You Enter</h3>
          <p className="ps-legal-p">
            PáircVision is designed so that coaching data remains on your own device and is not
            transmitted to our servers. In most cases, coaches or clubs remain responsible for the
            personal information they choose to record and manage within the app.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">7. Voice Notes</h2>
          <p className="ps-legal-p">
            If you choose to record a voice note, PáircVision will request microphone access from
            your browser. The app will not record anything until you grant permission.
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">Audio is captured using your device's microphone.</li>
            <li className="ps-legal-li">
              Recordings are stored as WebM audio files in your browser's IndexedDB storage, on
              your device only.
            </li>
            <li className="ps-legal-li">
              Recordings are never uploaded to PáircVision or any server.
            </li>
            <li className="ps-legal-li">
              You can delete individual voice notes at any time within the app.
            </li>
          </ul>
          <p className="ps-legal-p">
            Microphone access is optional. If you decline, all other features continue to work
            normally.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">8. Coaching Clip Recording</h2>
          <p className="ps-legal-p">
            PáircVision includes a feature to record the tactical board as a coaching video clip.
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              The app captures the tactical board canvas as a video stream. Your camera is never
              used.
            </li>
            <li className="ps-legal-li">
              You may optionally add microphone audio to accompany the recording.
            </li>
            <li className="ps-legal-li">
              The resulting video file (MP4 or WebM) is held temporarily in your device's memory
              and downloaded or shared via your OS share function.
            </li>
            <li className="ps-legal-li">
              The video is not stored by PáircVision and is not uploaded anywhere.
            </li>
          </ul>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">9. Exports, Downloads, and Sharing</h2>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              <strong>PDF reports</strong> — Generated entirely within your browser and downloaded
              to your device. Nothing is sent to a server.
            </li>
            <li className="ps-legal-li">
              <strong>PNG images</strong> — Tactical board screenshots generated within your
              browser and downloaded or shared via your OS share sheet.
            </li>
            <li className="ps-legal-li">
              <strong>Video clips</strong> — As described in Section 8.
            </li>
            <li className="ps-legal-li">
              <strong>Web Share</strong> — Where available, the app uses your operating system's
              native share function. You choose the destination. PáircVision has no visibility into
              where you share it.
            </li>
          </ul>
          <p className="ps-legal-p">
            All export and sharing activity is initiated explicitly by you. Nothing is shared
            automatically in the background.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">10. Browser Permissions</h2>
          <div className="ps-info-card">
            <p className="ps-info-card-label">Microphone</p>
            <p className="ps-info-card-value">
              Requested when you tap the voice note record button. Used to capture audio memos.{" "}
              <strong>Optional</strong> — the app works fully without it.
            </p>
          </div>
          <div className="ps-info-card">
            <p className="ps-info-card-label">Storage (localStorage / IndexedDB)</p>
            <p className="ps-info-card-value">
              Used automatically on first use to save coaching data locally.{" "}
              <strong>Required</strong> — necessary for the app to function.
            </p>
          </div>
          <div className="ps-info-card">
            <p className="ps-info-card-label">Service Worker / Cache</p>
            <p className="ps-info-card-value">
              Used automatically to cache app files for offline use.{" "}
              <strong>Optional</strong> — standard PWA behaviour.
            </p>
          </div>
          <p className="ps-legal-p">
            PáircVision does not request camera access, location data, notifications, or clipboard
            access.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">11. Coaches and Player Data</h2>
          <p className="ps-legal-p">
            PáircVision is designed so that coaching data remains on your own device and is not
            transmitted to our servers. In most cases, coaches or clubs remain responsible for the
            personal information they choose to record and manage within the app.
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              You should have a legitimate reason to collect and use player information.
            </li>
            <li className="ps-legal-li">
              You should not record more information about players than is necessary for coaching
              purposes.
            </li>
            <li className="ps-legal-li">
              If players or their parents ask about the information you hold, you should be able to
              respond.
            </li>
            <li className="ps-legal-li">
              If a player or their parent or guardian asks you to delete their information, you
              should do so.
            </li>
          </ul>
          <p className="ps-legal-p">
            PáircVision provides the tools to delete squad data, training records, and notes within
            the app.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">12. Children and Young Players</h2>
          <p className="ps-legal-p">
            PáircVision is a coaching tool intended for use by adults in a coaching role.
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              You, as the coach or club, are responsible for ensuring your use of minor players'
              information is appropriate and consistent with your obligations.
            </li>
            <li className="ps-legal-li">
              Special care should be taken with any notes that touch on a player's health, injury,
              or personal circumstances.
            </li>
            <li className="ps-legal-li">
              PáircVision does not impose age restrictions on the app itself, but coaches using it
              with youth squads carry responsibility for how they use the information they enter.
            </li>
          </ul>
          <p className="ps-legal-p">
            The Data Protection Commission (www.dataprotection.ie) and Sport Ireland's safeguarding
            resources provide further guidance.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">13. Third-Party Services</h2>
          <p className="ps-legal-p">
            The only third-party service involved in the operation of PáircVision is{" "}
            <strong>Vercel Inc.</strong>, which hosts and delivers the application files to your
            browser.
          </p>
          <div className="ps-info-card">
            <p className="ps-info-card-label">Vercel Inc. (USA) — Hosting Provider</p>
            <p className="ps-info-card-value">
              Receives: IP address, browser type, timestamp, URL, HTTP status — standard web server
              logs. Privacy policy: vercel.com/legal/privacy-policy
            </p>
          </div>
          <p className="ps-legal-p">
            No other third-party services, analytics tools, advertising networks, or external APIs
            are used.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">14. Open-Source Software</h2>
          <p className="ps-legal-p">
            PáircVision makes use of a number of open-source software libraries to provide
            functionality within the application. These libraries operate entirely within your
            browser and do not receive, collect, or transmit your coaching data.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">15. Cookies</h2>
          <p className="ps-legal-p">PáircVision does not set cookies.</p>
          <p className="ps-legal-p">
            The app uses browser localStorage and IndexedDB to store your coaching data locally.
            These are not cookies and are not used for tracking or advertising. They are used solely
            to make the app function.
          </p>
          <p className="ps-legal-p">
            Under Irish data protection law, storing information in a user's browser is permitted
            without consent where it is strictly necessary for the provision of the service
            requested. The storage PáircVision uses falls within this category.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">16. Your Rights Under GDPR</h2>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              <strong>Right of access</strong> — You have the right to know what personal data is
              held about you.
            </li>
            <li className="ps-legal-li">
              <strong>Right to erasure</strong> — You have the right to request deletion of your
              personal data.
            </li>
            <li className="ps-legal-li">
              <strong>Right to rectification</strong> — You have the right to have inaccurate data
              corrected.
            </li>
            <li className="ps-legal-li">
              <strong>Right to restriction</strong> — You have the right to limit how your data is
              used.
            </li>
            <li className="ps-legal-li">
              <strong>Right to data portability</strong> — You have the right to receive your
              personal data in a portable format.
            </li>
            <li className="ps-legal-li">
              <strong>Right to object</strong> — You have the right to object to processing based
              on legitimate interests.
            </li>
          </ul>
          <h3 className="ps-legal-h3">How These Rights Apply in Practice</h3>
          <p className="ps-legal-p">
            The only personal data that PáircVision processes as part of delivering the service is
            the server log data described in Section 5.1. To exercise any of the above rights in
            relation to that data, please contact us at <strong>{CONTACT_EMAIL}</strong>.
          </p>
          <p className="ps-legal-p">
            For the coaching data you create within the app, that data exists only on your device.
            You can exercise control over it directly:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              Delete individual voice notes, matches, boards, and training sessions from within the
              app.
            </li>
            <li className="ps-legal-li">
              Clear all app data by clearing your browser's local storage and site data in browser
              settings.
            </li>
            <li className="ps-legal-li">
              Export coaching data using the PDF and PNG export features within the app.
            </li>
          </ul>
          <h3 className="ps-legal-h3">Complaints</h3>
          <p className="ps-legal-p">
            You have the right to make a complaint to the{" "}
            <strong>Data Protection Commission (DPC)</strong>:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">Website: www.dataprotection.ie</li>
            <li className="ps-legal-li">Phone: +353 (0)761 104 800</li>
            <li className="ps-legal-li">
              Post: 21 Fitzwilliam Square South, Dublin 2, D02 RD28
            </li>
          </ul>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">17. Data Retention</h2>
          <p className="ps-legal-p">
            <strong>Server log data (Vercel):</strong> Retained according to Vercel's standard log
            retention practices. We access these logs only to investigate technical issues.
          </p>
          <p className="ps-legal-p">
            <strong>Coaching data on your device:</strong> There is no automatic expiry. Your data
            persists until you delete it within the app or clear your browser's stored data.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">18. Changes to This Policy</h2>
          <p className="ps-legal-p">
            If we make material changes, we will update the "Last updated" date and, where
            appropriate, display a notice within the app. We will not reduce your privacy rights
            without giving you clear notice.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">19. Contact</h2>
          <p className="ps-legal-p">
            For any question about this policy: <strong>{CONTACT_EMAIL}</strong>
          </p>
          <p className="ps-legal-p">
            PáircVision is created and operated by Seán Kelly, an independent developer based in
            Ireland.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Terms & Conditions ───────────────────────────────────────────────────────

function TermsView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <SubHeader title="Terms & Conditions" onBack={onBack} />
      <div className="ps-scroll">
        <p className="ps-legal-intro">Version 1.0 — Beta · Last updated: 16 June 2026</p>

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">1. Acceptance of Terms</h2>
          <p className="ps-legal-p">
            By accessing or using PáircVision, you agree to be bound by these Terms & Conditions.
            If you do not agree, you should not use the application.
          </p>
          <p className="ps-legal-p">
            No separate sign-up or account registration is required, as PáircVision does not
            operate user accounts.
          </p>
          <p className="ps-legal-p">
            These Terms should be read alongside our Privacy Policy, which explains how PáircVision
            handles data. In the event of any conflict on a data-related matter, the Privacy Policy
            prevails.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">2. About PáircVision</h2>
          <p className="ps-legal-p">
            PáircVision is a coaching platform for Gaelic games, created and operated by{" "}
            <strong>Seán Kelly</strong>, an independent developer based in Ireland.
          </p>
          <p className="ps-legal-p">
            PáircVision is a Progressive Web Application (PWA) that runs entirely within your
            browser. All coaching data you create is stored locally on your device. PáircVision
            does not use cloud accounts, does not sync data between devices, and does not transmit
            your coaching information to any server.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">3. Beta Software</h2>
          <p className="ps-legal-p">
            <strong>PáircVision is currently in public beta.</strong> You should be aware of the
            following before relying on PáircVision for important coaching work:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              <strong>Features may change.</strong> Functionality that exists today may be altered,
              improved, or removed without prior notice.
            </li>
            <li className="ps-legal-li">
              <strong>Bugs may occur.</strong> Errors, unexpected behaviour, and performance issues
              may arise.
            </li>
            <li className="ps-legal-li">
              <strong>Data loss is possible.</strong> All coaching data is stored in your browser's
              local storage. Clearing browser data, uninstalling the app, or moving to a different
              device may permanently remove it.
            </li>
            <li className="ps-legal-li">
              <strong>Exports and reports are tools, not records.</strong> PDFs, PNG images, and
              video clips should not be treated as your sole record of important coaching
              information. Maintain your own independent records.
            </li>
            <li className="ps-legal-li">
              <strong>The service may change significantly.</strong> We reserve the right to alter
              or discontinue PáircVision during the beta period. Where possible, we will provide
              reasonable advance notice.
            </li>
          </ul>
          <p className="ps-legal-p">
            We are making PáircVision available in beta because we believe it is already useful.
            These disclosures are about being honest with the people who use it.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">4. Eligibility</h2>
          <p className="ps-legal-p">
            PáircVision is designed for use by coaches, analysts, and sports administrators working
            with Gaelic games teams and squads.
          </p>
          <p className="ps-legal-p">
            There is no minimum age requirement. However,{" "}
            <strong>
              users under 18 should use PáircVision under the guidance of a parent, guardian,
              teacher, club official, or other responsible adult
            </strong>{" "}
            where this is appropriate to the context.
          </p>
          <p className="ps-legal-p">
            If you are using PáircVision on behalf of a club, association, or other organisation,
            you confirm that you have the authority to accept these Terms on that organisation's
            behalf.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">5. How PáircVision Works</h2>
          <p className="ps-legal-p">
            PáircVision is a <strong>local-first application</strong>. This means:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">There are no user accounts and no login process.</li>
            <li className="ps-legal-li">
              Your coaching data does not leave your device unless you choose to export or share
              it.
            </li>
            <li className="ps-legal-li">
              The application can work offline once it has been loaded.
            </li>
            <li className="ps-legal-li">
              The only external service involved is Vercel Inc., which hosts and delivers the app
              files. Vercel does not receive your coaching data.
            </li>
            <li className="ps-legal-li">
              PáircVision uses no analytics services, no advertising networks, and no tracking.
            </li>
          </ul>
          <p className="ps-legal-p">
            Tools available include: live match statistics, tactical board design, training session
            management, coach notes (text and voice), player performance tracking, PDF report
            generation, PNG board export, and coaching clip recording.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">6. Your Coaching Data</h2>
          <p className="ps-legal-p">
            <strong>You own all coaching data you create within PáircVision.</strong>
          </p>
          <p className="ps-legal-p">
            PáircVision never receives, accesses, or processes the coaching information you enter.
            That information is stored entirely on your own device.
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              Data is available only on the device and browser where you created it.
            </li>
            <li className="ps-legal-li">
              It will not transfer automatically to another device.
            </li>
            <li className="ps-legal-li">
              It may be permanently deleted if you clear your browser's local storage, reset your
              browser, uninstall the application, or change devices.
            </li>
          </ul>
          <div className="ps-note">
            <p className="ps-note-title">Important</p>
            <p className="ps-note-body">
              PáircVision cannot recover your coaching data. If your browser data is cleared or
              your device is lost, your saved information cannot be restored. You are responsible
              for maintaining copies of any coaching records that matter to you.
            </p>
          </div>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">7. Coaches and Player Data</h2>
          <p className="ps-legal-p">
            If you use PáircVision to record information about players, you are collecting personal
            data about those individuals. That data is stored on your device and is not transmitted
            to PáircVision.{" "}
            <strong>
              You are responsible for how you collect, use, and manage this information
            </strong>{" "}
            in accordance with GDPR and applicable Irish data protection law.
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              You should have a legitimate reason to record and use player information.
            </li>
            <li className="ps-legal-li">
              You should not record more information than is necessary for coaching purposes.
            </li>
            <li className="ps-legal-li">
              If a player or their parent or guardian asks about the information you hold, you
              should be able to answer.
            </li>
            <li className="ps-legal-li">
              If asked to delete a player's information, you should do so.
            </li>
          </ul>
          <p className="ps-legal-p">
            <strong>Minor players:</strong> Where you are recording information about players under
            18, take particular care with notes on health, injury, or personal circumstances. You
            are responsible for ensuring your use of such information is appropriate and consistent
            with your safeguarding obligations.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">8. Permitted Use</h2>
          <p className="ps-legal-p">
            Subject to these Terms, PáircVision grants you a{" "}
            <strong>non-exclusive, non-transferable, revocable licence</strong> to use the
            application for coaching, analysis, and sports administration purposes in connection
            with Gaelic games. This licence permits you to:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              Use all features for coaching and analysis purposes.
            </li>
            <li className="ps-legal-li">
              Export match reports, tactical boards, and coaching clips for use within your coaching
              practice.
            </li>
            <li className="ps-legal-li">
              Share exported material with players, coaches, club officials, and others involved in
              your coaching work.
            </li>
          </ul>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">9. Acceptable Use</h2>
          <p className="ps-legal-p">You agree not to use PáircVision in any way that:</p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">Violates any applicable law or regulation.</li>
            <li className="ps-legal-li">
              Infringes the rights of any player, official, or third party, including their right
              to privacy.
            </li>
            <li className="ps-legal-li">
              Involves attempting to reverse-engineer, decompile, or extract the source code of the
              application.
            </li>
            <li className="ps-legal-li">
              Involves attempting to interfere with, disable, or circumvent the technical operation
              of the application.
            </li>
            <li className="ps-legal-li">
              Involves misrepresenting the origin or authenticity of exported reports, images, or
              videos.
            </li>
            <li className="ps-legal-li">
              Involves commercial redistribution or resale without our written permission.
            </li>
          </ul>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">10. Exports and Sharing</h2>
          <p className="ps-legal-p">PáircVision enables you to export coaching work as:</p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              <strong>Match intelligence PDF reports</strong> — generated within your browser and
              downloaded to your device.
            </li>
            <li className="ps-legal-li">
              <strong>Tactical board PNG images</strong> — generated within your browser and
              downloaded or shared via your OS share function.
            </li>
            <li className="ps-legal-li">
              <strong>Coaching clip videos</strong> — recorded from the tactical board canvas (your
              camera is never used) and downloaded or shared.
            </li>
          </ul>
          <p className="ps-legal-p">
            Voice notes and other coaching data stored within the app remain on your device and are
            not exported or shared automatically.
          </p>
          <p className="ps-legal-p">
            <strong>All sharing is initiated by you.</strong> Nothing is shared or transmitted in
            the background. PáircVision has no visibility into where you send shared material or
            who receives it.
          </p>
          <p className="ps-legal-p">
            <strong>Once you export or share material, you are responsible for:</strong>
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">Where the material is sent and who receives it.</li>
            <li className="ps-legal-li">
              Ensuring recipients are entitled to see any player information the material contains.
            </li>
            <li className="ps-legal-li">
              Complying with any data protection obligations that apply to sharing information about
              identifiable individuals.
            </li>
          </ul>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">11. Intellectual Property</h2>
          <p className="ps-legal-p">
            <strong>PáircVision's intellectual property:</strong> The application, including its
            code, design, graphics, layout, features, and functionality, is owned by PáircVision's
            developers and is protected by applicable intellectual property law. These Terms do not
            transfer any ownership to you.
          </p>
          <p className="ps-legal-p">
            <strong>Your coaching content:</strong> All coaching data you create within PáircVision
            belongs to you. PáircVision claims no ownership over the content you create.
          </p>
          <p className="ps-legal-p">
            <strong>Open-source software:</strong> PáircVision uses open-source software libraries
            that operate entirely within your browser and do not transmit data to any third party.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">12. Availability and Service Changes</h2>
          <p className="ps-legal-p">
            PáircVision is provided as a beta product on a best-efforts basis. We do not guarantee:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              That the application will be available at all times or without interruption.
            </li>
            <li className="ps-legal-li">
              That any particular feature will remain available in future versions.
            </li>
            <li className="ps-legal-li">
              That exports produced by future versions will be identical to those produced today.
            </li>
          </ul>
          <p className="ps-legal-p">
            We reserve the right to add, modify, or remove features at any time. We reserve the
            right to discontinue PáircVision at any time, making reasonable efforts to provide
            advance notice so you can export coaching data you wish to retain.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">13. Disclaimers</h2>
          <p className="ps-legal-p">
            <strong>PáircVision is a coaching tool.</strong> It is designed to support coaches and
            analysts in recording, reviewing, and presenting information. It is not a substitute for
            professional coaching judgement.
          </p>
          <p className="ps-legal-p">
            <strong>Statistical outputs depend on user input.</strong> The accuracy of any match
            statistics or reports depends entirely on the accuracy of the data you enter.
          </p>
          <p className="ps-legal-p">
            <strong>Device compatibility.</strong> Some features — including voice note recording,
            coaching clip recording, and the share function — depend on capabilities provided by
            your browser and may not be available on all devices.
          </p>
          <p className="ps-legal-p">
            <strong>No warranty.</strong> To the fullest extent permitted by Irish law, PáircVision
            is provided "as is" and "as available", without any warranty of any kind.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">14. Limitation of Liability</h2>
          <p className="ps-legal-p">
            To the fullest extent permitted by applicable Irish law:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">
              PáircVision will not be liable for any loss or corruption of coaching data stored on
              your device.
            </li>
            <li className="ps-legal-li">
              PáircVision will not be liable for any decision made on the basis of statistics,
              reports, or analysis produced within the application.
            </li>
            <li className="ps-legal-li">
              PáircVision will not be liable for any indirect, consequential, or special losses
              arising from your use of the application.
            </li>
          </ul>
          <p className="ps-legal-p">
            Where liability cannot be excluded by law — including liability for death or personal
            injury caused by our negligence, or liability for fraud — these exclusions do not apply.
            Nothing in these Terms affects your statutory rights under Irish consumer law.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">15. Third-Party Services</h2>
          <p className="ps-legal-p">
            <strong>Vercel Inc.</strong> (USA) provides the hosting infrastructure that delivers
            PáircVision to your browser. Our use of Vercel is governed by Vercel's own terms of
            service and privacy policy.
          </p>
          <p className="ps-legal-p">
            <strong>Share function destinations.</strong> When you share an exported file, your
            operating system handles the transfer. These destinations operate independently of
            PáircVision and are governed by their own terms.
          </p>
          <p className="ps-legal-p">
            <strong>Open-source libraries.</strong> PáircVision uses open-source software libraries
            that run within your browser and do not transmit data to any third party.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">16. Changes to These Terms</h2>
          <p className="ps-legal-p">
            We may update these Terms from time to time. If we make material changes, we will
            update the "Last updated" date and, where appropriate, display a notice within the
            application. Continued use of PáircVision after updated Terms have been published
            constitutes acceptance of those Terms.
          </p>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">17. Governing Law</h2>
          <p className="ps-legal-p">
            These Terms are governed by the laws of Ireland. Any dispute arising from your use of
            PáircVision will be subject to the exclusive jurisdiction of the Irish courts.
          </p>
          <p className="ps-legal-p">
            For data protection matters, the relevant supervisory authority is the{" "}
            <strong>Data Protection Commission (DPC)</strong>:
          </p>
          <ul className="ps-legal-ul">
            <li className="ps-legal-li">Website: www.dataprotection.ie</li>
            <li className="ps-legal-li">Phone: +353 (0)761 104 800</li>
            <li className="ps-legal-li">
              Post: 21 Fitzwilliam Square South, Dublin 2, D02 RD28
            </li>
          </ul>
        </div>

        <div className="ps-legal-divider" />

        <div className="ps-legal-section">
          <h2 className="ps-legal-h2">18. Contact</h2>
          <p className="ps-legal-p">
            If you have any questions about these Terms:{" "}
            <strong>{CONTACT_EMAIL}</strong>
          </p>
          <p className="ps-legal-p">
            PáircVision is created and operated by Seán Kelly, an independent developer based in
            Ireland.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Storage & Permissions ────────────────────────────────────────────────────

const PERM_ITEMS: Array<{
  dot: "green" | "amber" | "blue";
  title: string;
  body: string;
}> = [
  {
    dot: "green",
    title: "Your coaching data stays on your device",
    body: "Match statistics, tactical boards, training sessions, and coach notes are stored in your browser. They never leave your device unless you choose to export or share them.",
  },
  {
    dot: "green",
    title: "PáircVision does not upload your data",
    body: "No coaching data is ever sent to PáircVision's servers. The only external service that receives any information is Vercel, which hosts the app files — not your coaching content.",
  },
  {
    dot: "amber",
    title: "Clearing browser data removes your saved information",
    body: "Because your data is stored locally, clearing browser data, uninstalling the app, or switching devices will permanently remove it. PáircVision cannot recover it.",
  },
  {
    dot: "blue",
    title: "Microphone is only used for voice note recording",
    body: "When you tap the voice note record button, your browser will ask for microphone permission. The recording stays on your device. If you decline, all other features work normally.",
  },
  {
    dot: "green",
    title: "Your camera is never used",
    body: "Coaching clip recording captures only the tactical board canvas on your screen. The camera is never accessed.",
  },
  {
    dot: "green",
    title: "Files are only shared when you choose",
    body: "Exports — PDFs, PNG images, and video clips — are only shared when you tap Share or Export. Nothing is sent automatically or in the background.",
  },
  {
    dot: "green",
    title: "Voice notes stay on your device",
    body: "Voice memos recorded during matches are stored in your browser only. They are not uploaded anywhere and can be deleted individually from within the app.",
  },
  {
    dot: "amber",
    title: "You are responsible for player information you enter",
    body: "Player names, attendance, and coaching notes you enter are stored on your device under your control. As the coach, you are responsible for using this information appropriately.",
  },
];

function StoragePermissionsView({ onBack }: { onBack: () => void }) {
  return (
    <>
      <SubHeader title="Storage & Permissions" onBack={onBack} />
      <div className="ps-scroll">
        <p className="ps-legal-p" style={{ marginBottom: "18px" }}>
          A plain-English summary of what PáircVision stores, what permissions it uses, and what
          stays entirely on your device.
        </p>
        <div className="ps-perm-list">
          {PERM_ITEMS.map((item) => (
            <div key={item.title} className="ps-perm-item">
              <span className={`ps-perm-dot ps-perm-dot--${item.dot}`} aria-hidden="true" />
              <span>
                <span className="ps-perm-item-title">{item.title}</span>
                <span className="ps-perm-item-body">{item.body}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="ps-legal-p" style={{ marginTop: "20px", fontSize: "12px" }}>
          For full details, see the Privacy Policy in this Settings section.
        </p>
      </div>
    </>
  );
}

// ─── Contact ──────────────────────────────────────────────────────────────────

function ContactView({ onBack }: { onBack: () => void }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  function handleCopy() {
    if (!navigator.clipboard) {
      setCopyState("failed");
      return;
    }
    navigator.clipboard.writeText(CONTACT_EMAIL).then(
      () => {
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 2500);
      },
      () => {
        setCopyState("failed");
        setTimeout(() => setCopyState("idle"), 3000);
      },
    );
  }

  return (
    <>
      <SubHeader title="Contact Support" onBack={onBack} />
      <div className="ps-scroll">
        <div className="ps-contact-card">
          <span className="ps-contact-label">Email</span>
          <span className="ps-contact-email">{CONTACT_EMAIL}</span>
          <p className="ps-contact-desc">
            Questions, feedback or privacy requests are welcome.
          </p>
        </div>
        <div className="ps-btn-row">
          <a href={`mailto:${CONTACT_EMAIL}`} className="ps-btn">
            Send Email
          </a>
          <button type="button" className="ps-btn-secondary" onClick={handleCopy}>
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed — email shown above"
                : "Copy Email"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function PitchFlowSettingsShell() {
  const [view, setView] = useState<SettingsView>(initialSettingsView);

  return (
    <main className="ps-shell">
      <style>{SETTINGS_CSS}</style>
      {view === "landing" && <LandingView onNavigate={setView} />}
      {view === "backup" && <BackupRestoreView onBack={() => setView("landing")} />}
      {view === "privacy" && <PrivacyPolicyView onBack={() => setView("landing")} />}
      {view === "terms" && <TermsView onBack={() => setView("landing")} />}
      {view === "storage" && <StoragePermissionsView onBack={() => setView("landing")} />}
      {view === "contact" && <ContactView onBack={() => setView("landing")} />}
    </main>
  );
}
