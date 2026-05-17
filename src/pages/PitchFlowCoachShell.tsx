import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import {
  AGE_FILTER_OPTIONS,
  AGE_LABELS,
  LIBRARY_CATEGORY_LABELS,
  LIBRARY_ITEMS,
  PROBLEM_OPTIONS,
  PROBLEM_TAB_OPTIONS,
  SPORT_FILTER_OPTIONS,
  SPORT_LABELS,
  type AgeGroupFilter,
  type LibraryCategory,
  type LibraryItem,
  type ProblemTag,
  type SportFilter,
} from "../data/libraryContent";
import { loadAllBoards } from "../features/quickboard/storage/quickboard-storage";
import type { SavedQuickBoard } from "../features/quickboard/storage/quickboard-types";

export type PitchFlowTab = "home" | "notes" | "library" | "sessions" | "plans";

type PitchFlowCoachShellProps = {
  initialTab: PitchFlowTab;
};

type BottomNavItem = {
  id: "home" | "flowlab" | "flowstats" | "notes";
  label: string;
  short: string;
  path: string;
};

type ProblemTabId = (typeof PROBLEM_TAB_OPTIONS)[number]["id"];
type QuickBrowseId = "systems" | "sessions" | "eight-week-plans" | "season-plans" | "underage" | "sport-filters";

const BOTTOM_NAV_ITEMS: ReadonlyArray<BottomNavItem> = [
  { id: "home", label: "Home", short: "H", path: "/board" },
  { id: "flowlab", label: "Board", short: "V", path: "/vision-board" },
  { id: "flowstats", label: "Stats", short: "S", path: "/flowstats" },
  { id: "notes", label: "Notes", short: "N", path: "/notes" },
];

const VISION_BOARD_PATH = "/vision-board";
const HOME_RECENT_BOARDS_LIMIT = 3;
const SESSION_CATEGORIES = ["Warm-Ups", "Skill Development", "Attack", "Defence"];
const PLAN_TYPES = [
  "Pre-Season",
  "Early Season",
  "Championship Prep",
  "Skill Blocks",
  "Underage Development",
  "Team Identity Plans",
];

const QUICK_BROWSE_OPTIONS: ReadonlyArray<{ id: QuickBrowseId; label: string }> = [
  { id: "systems", label: "Systems" },
  { id: "sessions", label: "Sessions" },
  { id: "eight-week-plans", label: "8 Week Plans" },
  { id: "season-plans", label: "Season Plans" },
  { id: "underage", label: "Underage" },
  { id: "sport-filters", label: "Sport Filters" },
];

const QUICK_BROWSE_CATEGORY_MAP: Partial<Record<QuickBrowseId, LibraryCategory>> = {
  systems: "systems",
  sessions: "training-sessions",
  "eight-week-plans": "eight-week-plans",
  "season-plans": "full-season-plans",
  underage: "underage-club-development",
};

const QUICK_BROWSE_TITLES: Record<QuickBrowseId, string> = {
  systems: "Systems",
  sessions: "Sessions",
  "eight-week-plans": "8 Week Plans",
  "season-plans": "Season Plans",
  underage: "Underage & Club Development",
  "sport-filters": "Sport Filters",
};

const PROBLEM_LABELS: Record<ProblemTag, string> = {
  "struggling-to-score": "Struggling to score",
  "losing-kickouts-puckouts": "Losing kickouts / puckouts",
  "too-slow-in-attack": "Too slow in attack",
  "conceding-too-easy": "Conceding too easy",
};

const SPORT_FILTER_VIEW_LABELS: Record<SportFilter, string> = {
  "gaelic-football": "Football",
  "ladies-football": "Ladies Football",
  hurling: "Hurling",
  camogie: "Camogie",
};

type WrittenNote = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  selectedDate?: string;
};

const WRITTEN_NOTES_STORAGE_KEY = "pitchflow_written_notes_v1";
const MAX_WRITTEN_NOTES = 200;

function newWrittenNoteId(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeWrittenNoteDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  return trimmed;
}

function sanitizeWrittenNotes(notes: readonly WrittenNote[]): WrittenNote[] {
  const normalized = notes
    .filter((note) => typeof note.id === "string" && note.id.trim().length > 0)
    .map((note) => {
      const title = note.title.trim().slice(0, 80);
      const body = note.body.trim().slice(0, 2000);
      const createdAt = Number.isFinite(note.createdAt) ? Math.max(0, Math.floor(note.createdAt)) : Date.now();
      const updatedAt = Number.isFinite(note.updatedAt) ? Math.max(createdAt, Math.floor(note.updatedAt)) : createdAt;
      return {
        ...note,
        id: note.id.trim(),
        title,
        body,
        createdAt,
        updatedAt,
        ...(normalizeWrittenNoteDate(note.selectedDate) ? { selectedDate: normalizeWrittenNoteDate(note.selectedDate) } : {}),
      };
    })
    .filter((note) => note.title.length > 0 || note.body.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const seenIds = new Set<string>();
  return normalized
    .filter((note) => {
      if (seenIds.has(note.id)) return false;
      seenIds.add(note.id);
      return true;
    })
    .slice(0, MAX_WRITTEN_NOTES);
}

function parseStoredWrittenNotes(input: string | null): WrittenNote[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed)) return [];
    const notes = parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const maybe = item as Record<string, unknown>;
        if (
          typeof maybe.id !== "string" ||
          typeof maybe.title !== "string" ||
          typeof maybe.body !== "string" ||
          typeof maybe.createdAt !== "number" ||
          typeof maybe.updatedAt !== "number"
        ) {
          return null;
        }
        const selectedDate = normalizeWrittenNoteDate(maybe.selectedDate);
        return {
          id: maybe.id,
          title: maybe.title,
          body: maybe.body,
          createdAt: maybe.createdAt,
          updatedAt: maybe.updatedAt,
          ...(selectedDate ? { selectedDate } : {}),
        } satisfies WrittenNote;
      })
      .filter((note): note is WrittenNote => note != null);
    return sanitizeWrittenNotes(notes);
  } catch {
    return [];
  }
}

function persistWrittenNotes(notes: readonly WrittenNote[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WRITTEN_NOTES_STORAGE_KEY, JSON.stringify(sanitizeWrittenNotes(notes)));
}

function formatWrittenNoteTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "Unknown";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hour}:${minute}`;
}

const SHELL_CSS = `
.pf-shell {
  --pf-bg: #06150F;
  --pf-bg-deep: #03100B;
  --pf-header: #123821;
  --pf-surface: #10291B;
  --pf-card: #173D28;
  --pf-card-soft: #143421;
  --pf-card-hover: #1B4A30;
  --pf-border: #275C3B;
  --pf-primary: #7CFF72;
  --pf-primary-strong: #22C55E;
  --pf-primary-soft: rgba(124,255,114,0.14);
  --pf-primary-glow: rgba(124,255,114,0.32);
  --pf-text: #F1F7F0;
  --pf-text-muted: #8FA099;
  --pf-text-dim: #65736C;
  --pf-warning: #F5A623;
  --pf-danger: #EF4444;
  --pf-bottom-nav: rgba(6,21,15,0.92);
  min-height: 100dvh;
  background:
    radial-gradient(circle at 14% 0%, rgba(124,255,114,0.08), transparent 34%),
    radial-gradient(circle at 86% 4%, rgba(34,197,94,0.07), transparent 30%),
    linear-gradient(180deg, var(--pf-bg-deep) 0%, var(--pf-bg) 42%, #072016 100%);
  color: var(--pf-text);
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 14px calc(94px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.pf-shell * {
  box-sizing: border-box;
}

.pf-content {
  max-width: 520px;
  margin: 0 auto;
  display: grid;
  gap: 12px;
  overflow-x: clip;
  padding-bottom: 92px;
}

.pf-header-card,
.pf-card {
  border-radius: 18px;
  border: 1px solid var(--pf-border);
  background: linear-gradient(180deg, rgba(23,61,40,0.86) 0%, rgba(16,41,27,0.95) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 14px 28px rgba(0,0,0,0.28);
  backdrop-filter: blur(8px);
}

.pf-header-card {
  padding: 14px 16px;
  background: linear-gradient(180deg, rgba(18,56,33,0.96) 0%, rgba(16,41,27,0.95) 100%);
  position: relative;
}

.pf-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 10px;
}

.pf-wordmark {
  display: inline-grid;
  justify-items: start;
  gap: 7px;
}

.pf-wordmark-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.pf-logo {
  width: 46px;
  height: 46px;
  object-fit: contain;
  align-self: center;
  display: block;
  image-rendering: -webkit-optimize-contrast;
  image-rendering: crisp-edges;
  filter: drop-shadow(0 4px 10px rgba(2, 8, 15, 0.22));
}

.pf-home-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--pf-border);
  background: rgba(16,41,27,0.84);
  color: var(--pf-text);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.pf-home-icon-btn:active {
  transform: scale(0.97);
}

.pf-title {
  margin: 0;
  font-size: clamp(28px, 7vw, 34px);
  font-weight: 820;
  line-height: 0.98;
  letter-spacing: 0.02em;
  color: #f4f7f5;
}

.pf-title-accent {
  width: min(170px, 46vw);
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(242, 201, 76, 0.92), rgba(242, 201, 76, 0.58));
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.34));
}

.pf-subtitle {
  margin: 4px 0 0;
  color: var(--pf-text-muted);
  font-size: 14px;
  line-height: 1.35;
}

.pf-pill,
.pf-btn,
.pf-search,
.pf-tab {
  border-radius: 999px;
  border: 1px solid var(--pf-border);
  color: var(--pf-text);
  font-size: 13px;
  font-weight: 600;
}

.pf-pill {
  padding: 8px 12px;
  background: rgba(18,56,33,0.92);
}

.pf-btn {
  background: linear-gradient(180deg, rgba(34,197,94,0.36) 0%, rgba(27,74,48,0.95) 100%);
  box-shadow: 0 0 0 1px var(--pf-primary-soft), 0 0 12px var(--pf-primary-glow);
  padding: 8px 12px;
}

.pf-section-title {
  margin: 2px 4px 0;
  font-size: 14px;
  color: var(--pf-text-muted);
  font-weight: 650;
}

.pf-card {
  padding: 14px;
}

.pf-card + .pf-card {
  margin-top: 10px;
}

.pf-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.pf-card-text {
  margin: 6px 0 0;
  color: var(--pf-text-muted);
  font-size: 13px;
  line-height: 1.35;
}

.pf-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.pf-list-item {
  border-radius: 14px;
  border: 1px solid var(--pf-border);
  background: linear-gradient(180deg, rgba(20,52,33,0.95) 0%, rgba(16,41,27,0.9) 100%);
  padding: 11px 12px;
  color: var(--pf-text);
  font-size: 13px;
  font-weight: 600;
}

.pf-search {
  width: 100%;
  background: rgba(16,41,27,0.85);
  padding: 11px 14px;
  color: var(--pf-text);
  outline: none;
}

.pf-search::placeholder {
  color: var(--pf-text-dim);
}

.pf-tabs {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.pf-tab {
  background: rgba(16,41,27,0.85);
  padding: 8px 12px;
  white-space: nowrap;
}

.pf-tab.is-active {
  border-color: var(--pf-primary-strong);
  color: var(--pf-primary);
  background: var(--pf-primary-soft);
  box-shadow: 0 0 0 1px var(--pf-primary-soft), 0 0 10px var(--pf-primary-glow);
}

.pf-chip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.pf-chip {
  border-radius: 12px;
  border: 1px solid var(--pf-border);
  background: rgba(20,52,33,0.92);
  padding: 10px 9px;
  color: var(--pf-text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}

.pf-home-primary-wrap {
  margin-top: 12px;
}

.pf-home-primary-btn {
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--pf-primary-strong);
  background: linear-gradient(180deg, rgba(34,197,94,0.45) 0%, rgba(26,74,48,0.96) 100%);
  color: var(--pf-text);
  text-align: left;
  padding: 16px 14px;
  min-height: 68px;
  cursor: pointer;
  box-shadow: 0 0 0 1px var(--pf-primary-soft), 0 0 12px rgba(124,255,114,0.22);
  transition: transform 110ms ease, box-shadow 160ms ease, opacity 130ms ease;
  will-change: transform;
}

.pf-home-primary-btn:active {
  transform: scale(0.97);
  opacity: 0.96;
  box-shadow: 0 0 0 1px var(--pf-primary-soft), 0 0 16px rgba(124,255,114,0.32);
}

.pf-home-primary-label {
  display: block;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.4px;
}

.pf-home-primary-sub {
  display: block;
  margin-top: 4px;
  color: var(--pf-text-muted);
  font-size: 12px;
  font-weight: 600;
}

.pf-home-secondary-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.pf-home-secondary-btn {
  border-radius: 12px;
  border: 1px solid var(--pf-border);
  background: rgba(20,52,33,0.92);
  color: var(--pf-text);
  text-align: left;
  padding: 10px 10px;
  min-height: 58px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  transition: transform 100ms ease, background-color 130ms ease;
}

.pf-home-secondary-btn:active {
  transform: scale(0.985);
}

.pf-home-secondary-btn span {
  display: block;
}

.pf-home-secondary-btn small {
  display: block;
  margin-top: 4px;
  color: var(--pf-text-dim);
  font-size: 10px;
  font-weight: 500;
}

.pf-card.pf-card-soft {
  background: linear-gradient(180deg, rgba(14,34,23,0.82) 0%, rgba(11,28,18,0.86) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.03), 0 10px 18px rgba(0,0,0,0.2);
  padding: 12px;
}

.pf-list-item.pf-list-item-soft {
  background: rgba(17,43,28,0.75);
  color: var(--pf-text-muted);
  padding: 9px 10px;
  min-height: 44px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pf-home-section-title-actions {
  margin-top: 10px;
}

.pf-home-section-title-recent {
  margin-top: 14px;
}

.pf-library-problem-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.pf-library-problem-btn {
  border-radius: 14px;
  border: 1px solid var(--pf-border);
  background: linear-gradient(180deg, rgba(24,61,41,0.96) 0%, rgba(18,48,32,0.92) 100%);
  color: var(--pf-text);
  text-align: left;
  padding: 12px;
  min-height: 68px;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.25;
}

.pf-library-problem-btn.is-active {
  border-color: var(--pf-primary-strong);
  background: var(--pf-primary-soft);
  color: var(--pf-primary);
}

.pf-library-browse-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.pf-library-browse-btn {
  border-radius: 12px;
  border: 1px solid var(--pf-border);
  background: rgba(20,52,33,0.92);
  color: var(--pf-text);
  padding: 11px 10px;
  text-align: left;
  font-size: 12px;
  font-weight: 650;
}

.pf-library-browse-btn.is-active {
  border-color: var(--pf-primary-strong);
  color: var(--pf-primary);
  background: var(--pf-primary-soft);
}

.pf-library-chip-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.pf-library-chip-btn {
  border-radius: 999px;
  border: 1px solid var(--pf-border);
  background: rgba(20,52,33,0.9);
  color: var(--pf-text-muted);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
  padding: 8px 11px;
}

.pf-library-chip-btn.is-active {
  border-color: var(--pf-primary-strong);
  color: var(--pf-primary);
  background: var(--pf-primary-soft);
}

.pf-library-age-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.pf-library-filter-toggle-wrap {
  display: none;
}

.pf-library-filter-toggle {
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--pf-border);
  background: rgba(20,52,33,0.9);
  color: var(--pf-text);
  font-size: 12px;
  font-weight: 650;
  text-align: left;
  padding: 9px 11px;
}

.pf-library-filter-toggle.is-open {
  border-color: var(--pf-primary-strong);
  color: var(--pf-primary);
  background: var(--pf-primary-soft);
}

.pf-library-filters-inline {
  display: grid;
  gap: 8px;
}

.pf-library-filters-label {
  margin: 0;
  color: var(--pf-text-dim);
  font-size: 11px;
  font-weight: 650;
}

.pf-library-problem-view-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.pf-library-clear-btn {
  border-radius: 999px;
  border: 1px solid var(--pf-border);
  background: rgba(20,52,33,0.9);
  color: var(--pf-text-muted);
  font-size: 11px;
  font-weight: 650;
  padding: 6px 10px;
}

.pf-library-results-wrap {
  display: grid;
  gap: 10px;
}

.pf-library-result-card {
  border-radius: 14px;
  border: 1px solid var(--pf-border);
  background: linear-gradient(180deg, rgba(20,52,33,0.95) 0%, rgba(16,41,27,0.9) 100%);
  padding: 12px;
  cursor: pointer;
}

.pf-library-result-card:active {
  transform: scale(0.995);
}

.pf-library-result-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}

.pf-library-result-summary {
  margin: 6px 0 0;
  color: var(--pf-text-muted);
  font-size: 12px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.pf-library-result-meta {
  margin: 7px 0 0;
  color: var(--pf-text-dim);
  font-size: 11px;
  line-height: 1.3;
}

.pf-library-result-badges {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pf-library-result-badge {
  border-radius: 999px;
  border: 1px solid var(--pf-border);
  background: rgba(16,41,27,0.72);
  color: var(--pf-text-muted);
  font-size: 10px;
  font-weight: 650;
  padding: 4px 8px;
}

.pf-library-result-details {
  margin-top: 10px;
  border-top: 1px solid rgba(39, 92, 59, 0.45);
  padding-top: 10px;
  display: grid;
  gap: 8px;
}

.pf-library-result-detail-line {
  margin: 0;
  color: var(--pf-text-muted);
  font-size: 12px;
  line-height: 1.35;
}

.pf-library-result-detail-line strong {
  color: var(--pf-text);
  font-weight: 650;
}

.pf-library-empty {
  border-radius: 14px;
  border: 1px dashed var(--pf-border);
  background: rgba(15,37,24,0.72);
  color: var(--pf-text-muted);
  font-size: 12px;
  line-height: 1.4;
  padding: 12px;
}

.pf-bottom-nav {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(10px + env(safe-area-inset-bottom, 0px));
  width: min(520px, calc(100vw - 18px));
  border: 1px solid var(--pf-border);
  border-radius: 16px;
  background: var(--pf-bottom-nav);
  backdrop-filter: blur(12px);
  box-shadow: 0 14px 28px rgba(0,0,0,0.36);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 5px;
  z-index: 50;
}

.pf-nav-item {
  position: relative;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--pf-text-muted);
  display: grid;
  gap: 3px;
  justify-items: center;
  padding: 8px 2px 7px;
  font-size: 11px;
  font-weight: 600;
  width: 100%;
  min-width: 0;
}

.pf-nav-label {
  display: block;
  width: 100%;
  text-align: center;
  line-height: 1.15;
  font-size: 10.5px;
}

.pf-nav-icon {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid currentColor;
  display: grid;
  place-items: center;
  font-size: 10px;
  line-height: 1;
}

.pf-nav-item.is-active {
  color: var(--pf-primary);
  background: var(--pf-primary-soft);
  box-shadow: 0 0 0 1px var(--pf-primary-soft), 0 0 12px var(--pf-primary-glow);
}

.pf-nav-item.is-active::before {
  content: "";
  position: absolute;
  top: 0;
  left: 18%;
  right: 18%;
  height: 2px;
  border-radius: 999px;
  background: var(--pf-primary);
}

@media (orientation: portrait) {
  .pf-content {
    gap: 8px;
    padding-bottom: 108px;
  }

  .pf-header-card,
  .pf-card {
    padding: 12px;
  }

  .pf-section-title {
    margin: 1px 2px 0;
    font-size: 13px;
  }

  .pf-library-filter-toggle-wrap {
    display: block;
  }

  .pf-library-problem-grid,
  .pf-library-browse-grid {
    gap: 6px;
  }

  .pf-library-problem-btn {
    min-height: 58px;
    padding: 10px;
    font-size: 12px;
  }

  .pf-library-browse-btn {
    padding: 10px 9px;
    font-size: 11px;
  }

  .pf-library-result-card {
    padding: 9px 10px;
  }

  .pf-library-result-title {
    font-size: 13px;
  }

  .pf-library-result-summary {
    margin-top: 3px;
    font-size: 11px;
    -webkit-line-clamp: 1;
  }

  .pf-library-result-meta {
    margin-top: 4px;
    font-size: 10px;
  }

  .pf-library-result-badges {
    margin-top: 6px;
    gap: 4px;
  }

  .pf-library-result-badge {
    font-size: 9px;
    padding: 3px 6px;
  }

  .pf-home-secondary-grid {
    grid-template-columns: 1fr;
  }

  .pf-home-primary-btn {
    min-height: 72px;
  }

  .pf-home-secondary-btn {
    min-height: 56px;
  }
}
`;

function navigateTo(path: string) {
  if (window.location.pathname === path) return;
  window.location.assign(path);
}

function navigateToVisionBoard(boardId?: string) {
  const nextPath = boardId ? `${VISION_BOARD_PATH}?boardId=${encodeURIComponent(boardId)}` : VISION_BOARD_PATH;
  if (`${window.location.pathname}${window.location.search}` === nextPath) return;
  window.location.assign(nextPath);
}

function BoardPage() {
  const [recentBoards, setRecentBoards] = useState<SavedQuickBoard[]>(() => {
    if (typeof window === "undefined") return [];
    return loadAllBoards().slice(0, HOME_RECENT_BOARDS_LIMIT);
  });

  useEffect(() => {
    setRecentBoards(loadAllBoards().slice(0, HOME_RECENT_BOARDS_LIMIT));
  }, []);

  return (
    <>
      <div className="pf-header-card">
        <div className="pf-header-top">
          <div className="pf-wordmark">
            <div className="pf-wordmark-brand">
              <img className="pf-logo" src="/pv-logo-icon.svg" alt="PáircVision symbol" />
              <h1 className="pf-title">PáircVision</h1>
            </div>
            <span className="pf-title-accent" aria-hidden="true" />
          </div>
        </div>
        <p className="pf-subtitle">
          Built for GAA coaches.
          <br />
          <br />
          Create the vision.
          <br />
          Track the game.
          <br />
          Capture matchday.
        </p>
        <div className="pf-home-primary-wrap">
          <button type="button" className="pf-home-primary-btn" onClick={() => navigateTo("/flowstats")}>
            <span className="pf-home-primary-label">START MATCH</span>
            <span className="pf-home-primary-sub">Launch PáircVision Stats</span>
          </button>
        </div>
      </div>
      <p className="pf-section-title pf-home-section-title-actions">Quick Actions</p>
      <div className="pf-card">
        <div className="pf-home-secondary-grid">
          <button type="button" className="pf-home-secondary-btn" onClick={() => navigateToVisionBoard()}>
            <span>PáircVision Board</span>
            <small>Open PáircVision Board</small>
          </button>
          <button type="button" className="pf-home-secondary-btn" onClick={() => navigateTo("/notes")}>
            <span>Written Notes</span>
            <small>Open Notes</small>
          </button>
          <button type="button" className="pf-home-secondary-btn" onClick={() => navigateTo("/player-performance-tracker")}>
            <span>Vision Training</span>
            <small>Player Performance Tracker</small>
          </button>
        </div>
      </div>
      <p className="pf-section-title pf-home-section-title-recent">Recent Boards</p>
      <div className="pf-card pf-card-soft">
        <p className="pf-card-title">Recent Boards</p>
        {recentBoards.length <= 0 ? (
          <p className="pf-card-text" style={{ marginTop: "10px" }}>
            No saved boards yet. Save a board in PáircVision Board to see it here.
          </p>
        ) : (
          <div className="pf-list">
            {recentBoards.map((board) => (
              <button
                key={board.id}
                type="button"
                className="pf-list-item pf-list-item-soft"
                onClick={() => navigateToVisionBoard(board.id)}
                title={board.name}
              >
                {board.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function NotesPage() {
  const [notes, setNotes] = useState<WrittenNote[]>(() => {
    if (typeof window === "undefined") return [];
    return parseStoredWrittenNotes(window.localStorage.getItem(WRITTEN_NOTES_STORAGE_KEY));
  });
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    persistWrittenNotes(notes);
  }, [notes]);

  useEffect(() => {
    if (!saveFeedback) return;
    const timer = window.setTimeout(() => {
      setSaveFeedback(null);
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [saveFeedback]);

  const startNewNote = () => {
    setActiveNoteId(null);
    setTitleDraft("");
    setBodyDraft("");
    setDateDraft("");
    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const openNote = (note: WrittenNote) => {
    setActiveNoteId(note.id);
    setTitleDraft(note.title);
    setBodyDraft(note.body);
    setDateDraft(note.selectedDate ?? "");
    setSaveFeedback(null);
  };

  const saveNote = () => {
    const nextTitle = titleDraft.trim().slice(0, 80);
    const nextBody = bodyDraft.trim().slice(0, 2000);
    const nextDate = normalizeWrittenNoteDate(dateDraft);
    if (nextTitle.length === 0 && nextBody.length === 0) {
      setSaveFeedback("Add a title or note before saving.");
      return;
    }
    const now = Date.now();
    setNotes((previous) => {
      const existing = activeNoteId ? previous.find((note) => note.id === activeNoteId) : null;
      const id = existing?.id ?? newWrittenNoteId();
      const createdAt = existing?.createdAt ?? now;
      const nextNote: WrittenNote = {
        id,
        title: nextTitle,
        body: nextBody,
        createdAt,
        updatedAt: now,
        ...(nextDate ? { selectedDate: nextDate } : {}),
      };
      setActiveNoteId(id);
      return sanitizeWrittenNotes([nextNote, ...previous.filter((note) => note.id !== id)]);
    });
    setSaveFeedback("Note saved");
  };

  const deleteNote = () => {
    if (!activeNoteId) return;
    const selected = notes.find((note) => note.id === activeNoteId);
    if (!selected) return;
    const confirmed = window.confirm(`Delete "${selected.title || "Untitled note"}"?`);
    if (!confirmed) return;
    setNotes((previous) => previous.filter((note) => note.id !== activeNoteId));
    startNewNote();
    setSaveFeedback("Note deleted");
  };

  return (
    <>
      <div className="pf-header-card">
        <h1 className="pf-title">Notes</h1>
        <p className="pf-subtitle">Quick written notes from matches and training.</p>
      </div>

      <div className="pf-card pf-card-soft">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <p className="pf-card-title" style={{ margin: 0 }}>Saved Notes</p>
          <button type="button" className="pf-btn" onClick={startNewNote}>
            + New Note
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="pf-card-text" style={{ marginTop: "10px" }}>
            No notes yet. Tap <strong>+ New Note</strong> to add your first coaching note.
          </p>
        ) : (
          <div className="pf-list">
            {notes.map((note) => {
              const preview = note.body.replace(/\s+/g, " ").trim();
              const dateLabel = note.selectedDate ? `📅 ${note.selectedDate}` : null;
              return (
                <button
                  key={note.id}
                  type="button"
                  className="pf-list-item pf-list-item-soft"
                  style={{
                    textAlign: "left",
                    display: "grid",
                    gap: "4px",
                    border: note.id === activeNoteId ? "1px solid rgba(124,255,114,0.58)" : undefined,
                  }}
                  onClick={() => openNote(note)}
                >
                  <strong style={{ fontSize: "13px" }}>{note.title || "Untitled note"}</strong>
                  <span style={{ fontSize: "11px", color: "var(--pf-text-muted)" }}>
                    {dateLabel ? `${dateLabel} · ` : ""}
                    Created {formatWrittenNoteTimestamp(note.createdAt)}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--pf-text-dim)" }}>
                    {preview.length > 0 ? `${preview.slice(0, 96)}${preview.length > 96 ? "…" : ""}` : "No body text"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="pf-card"
        style={{
          paddingBottom: "max(14px, calc(env(safe-area-inset-bottom, 0px) + 12px))",
        }}
      >
        <p className="pf-card-title">{activeNoteId ? "Edit Note" : "New Note"}</p>
        <input
          ref={titleInputRef}
          className="pf-search"
          placeholder="Title"
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          style={{ marginTop: "10px" }}
        />
        <label style={{ display: "grid", gap: "6px", marginTop: "10px", fontSize: "12px", color: "var(--pf-text-muted)" }}>
          Optional date
          <input
            type="date"
            className="pf-search"
            value={dateDraft}
            onChange={(event) => setDateDraft(event.target.value)}
          />
        </label>
        <label style={{ display: "grid", gap: "6px", marginTop: "10px", fontSize: "12px", color: "var(--pf-text-muted)" }}>
          Note
          <textarea
            value={bodyDraft}
            onChange={(event) => setBodyDraft(event.target.value)}
            placeholder="Write your match or training notes..."
            rows={7}
            style={{
              width: "100%",
              borderRadius: "12px",
              border: "1px solid var(--pf-border)",
              background: "rgba(16,41,27,0.9)",
              color: "var(--pf-text)",
              font: "inherit",
              lineHeight: 1.4,
              padding: "10px",
              resize: "vertical",
            }}
          />
        </label>
        <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
          <button type="button" className="pf-btn" onClick={saveNote}>
            Save Note
          </button>
          {activeNoteId ? (
            <button type="button" className="pf-btn" onClick={deleteNote}>
              Delete Note
            </button>
          ) : null}
        </div>
        {saveFeedback ? (
          <p className="pf-card-text" style={{ marginTop: "8px" }}>
            {saveFeedback}
          </p>
        ) : null}
      </div>
    </>
  );
}

function LibraryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProblem, setSelectedProblem] = useState<ProblemTag | null>(null);
  const [selectedProblemTab, setSelectedProblemTab] = useState<ProblemTabId>("sessions");
  const [selectedQuickBrowse, setSelectedQuickBrowse] = useState<QuickBrowseId | null>(null);
  const [selectedSport, setSelectedSport] = useState<SportFilter | null>(null);
  const [selectedAge, setSelectedAge] = useState<AgeGroupFilter | null>(null);
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const isUnderageQuickBrowse = selectedQuickBrowse === "underage";
  const activeProblemTab = PROBLEM_TAB_OPTIONS.find((tab) => tab.id === selectedProblemTab) ?? PROBLEM_TAB_OPTIONS[1];
  const selectedQuickBrowseCategory = selectedQuickBrowse ? (QUICK_BROWSE_CATEGORY_MAP[selectedQuickBrowse] ?? "all") : "all";
  const categoryFilter: LibraryCategory | "all" = selectedProblem ? activeProblemTab.category : selectedQuickBrowseCategory;
  const selectedProblemLabel = selectedProblem ? PROBLEM_LABELS[selectedProblem] : "";
  const selectedViewTitle = selectedProblem
    ? selectedProblemLabel
    : selectedQuickBrowse
      ? QUICK_BROWSE_TITLES[selectedQuickBrowse]
      : "";

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let next = [...LIBRARY_ITEMS];

    if (selectedProblem) {
      next = next.filter((item) => item.problemTags.includes(selectedProblem));
    }

    if (isUnderageQuickBrowse) {
      next = next.filter(
        (item) => item.category === "underage-club-development" || item.sectionLabel === "Underage & Club Development",
      );
    } else if (categoryFilter !== "all") {
      next = next.filter((item) => item.category === categoryFilter);
    }

    if (selectedSport) {
      const footballFamily = selectedSport === "gaelic-football" || selectedSport === "ladies-football";
      const oppositeFamily: SportFilter[] = footballFamily
        ? ["hurling", "camogie"]
        : ["gaelic-football", "ladies-football"];

      next = next.filter(
        (item) =>
          item.sports.includes(selectedSport) && !item.sports.some((sport) => oppositeFamily.includes(sport)),
      );
    }

    if (selectedAge) {
      next = next.filter((item) => item.ageGroups.includes(selectedAge));
    }

    if (query.length > 0) {
      next = next.filter((item) => {
        const searchableText = [
          item.title,
          item.summary,
          LIBRARY_CATEGORY_LABELS[item.category],
          ...item.sports.map((sport) => SPORT_LABELS[sport]),
          ...item.ageGroups.map((age) => AGE_LABELS[age]),
          ...item.problemTags.map((tag) => PROBLEM_LABELS[tag]),
          ...item.keywords,
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      });
    }

    return next;
  }, [categoryFilter, isUnderageQuickBrowse, searchQuery, selectedAge, selectedProblem, selectedSport]);

  const toggleSport = (sport: SportFilter) => {
    setSelectedSport((previous) => (previous === sport ? null : sport));
  };

  const toggleAge = (age: AgeGroupFilter) => {
    setSelectedAge((previous) => (previous === age ? null : age));
  };

  const toggleQuickBrowse = (id: QuickBrowseId) => {
    setExpandedItemIds([]);
    setSelectedProblem(null);
    setSelectedProblemTab("sessions");
    setSelectedSport(null);
    setSelectedAge(null);
    setSelectedQuickBrowse((previous) => (previous === id ? null : id));
  };

  const handleProblemTap = (problem: ProblemTag) => {
    setExpandedItemIds([]);
    setSelectedQuickBrowse(null);
    setSelectedSport(null);
    setSelectedAge(null);
    setSelectedProblemTab("sessions");
    setSelectedProblem((previous) => (previous === problem ? null : problem));
  };

  const clearFilteredView = () => {
    setSelectedProblem(null);
    setSelectedQuickBrowse(null);
    setSelectedSport(null);
    setSelectedAge(null);
    setSelectedProblemTab("sessions");
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedItemIds((previous) =>
      previous.includes(itemId) ? previous.filter((id) => id !== itemId) : [...previous, itemId],
    );
  };

  const onResultCardKeyDown = (event: KeyboardEvent<HTMLDivElement>, itemId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpanded(itemId);
    }
  };

  return (
    <>
      <div className="pf-header-card">
        <h1 className="pf-title">Library</h1>
        <p className="pf-subtitle">Systems · Sessions · Plans</p>
      </div>

      <input
        className="pf-search"
        placeholder="Search systems, sessions, plans..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
      />

      <p className="pf-section-title">Fix My Team</p>
      <div className="pf-card">
        <div className="pf-library-problem-grid">
          {PROBLEM_OPTIONS.map((problem) => {
            const isActive = selectedProblem === problem.id;
            return (
              <button
                key={problem.id}
                type="button"
                className={isActive ? "pf-library-problem-btn is-active" : "pf-library-problem-btn"}
                onClick={() => handleProblemTap(problem.id)}
              >
                {problem.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="pf-section-title">Quick Browse</p>
      <div className="pf-card">
        <div className="pf-library-browse-grid">
          {QUICK_BROWSE_OPTIONS.map((option) => {
            const isActive = !selectedProblem && selectedQuickBrowse === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={isActive ? "pf-library-browse-btn is-active" : "pf-library-browse-btn"}
                onClick={() => toggleQuickBrowse(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="pf-section-title">Results</p>
      <div className="pf-card pf-library-results-wrap">
        {(selectedProblem || selectedQuickBrowse) ? (
          <div>
            <div className="pf-library-problem-view-head">
              <p className="pf-card-title">{selectedViewTitle}</p>
              <button type="button" className="pf-library-clear-btn" onClick={clearFilteredView}>
                Clear
              </button>
            </div>
            {selectedProblem ? (
              <div className="pf-tabs" role="tablist" aria-label="Problem categories">
                {PROBLEM_TAB_OPTIONS.map((tab) => {
                  const isActive = selectedProblemTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={isActive ? "pf-tab is-active" : "pf-tab"}
                      onClick={() => setSelectedProblemTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {selectedQuickBrowse === "sport-filters" ? (
              <div className="pf-library-filters-inline">
                <p className="pf-library-filters-label">Sports</p>
                <div className="pf-library-chip-row">
                  {SPORT_FILTER_OPTIONS.map((sport) => {
                    const isActive = selectedSport === sport.id;
                    return (
                      <button
                        key={sport.id}
                        type="button"
                        className={isActive ? "pf-library-chip-btn is-active" : "pf-library-chip-btn"}
                        onClick={() => toggleSport(sport.id)}
                      >
                        {SPORT_FILTER_VIEW_LABELS[sport.id]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {selectedQuickBrowse === "underage" ? (
              <div className="pf-library-filters-inline">
                <p className="pf-library-filters-label">Sports</p>
                <div className="pf-library-chip-row">
                  {SPORT_FILTER_OPTIONS.map((sport) => {
                    const isActive = selectedSport === sport.id;
                    return (
                      <button
                        key={sport.id}
                        type="button"
                        className={isActive ? "pf-library-chip-btn is-active" : "pf-library-chip-btn"}
                        onClick={() => toggleSport(sport.id)}
                      >
                        {SPORT_FILTER_VIEW_LABELS[sport.id]}
                      </button>
                    );
                  })}
                </div>
                <p className="pf-library-filters-label">Age Groups</p>
                <div className="pf-library-age-grid">
                  {AGE_FILTER_OPTIONS.map((age) => {
                    const isActive = selectedAge === age.id;
                    return (
                      <button
                        key={age.id}
                        type="button"
                        className={isActive ? "pf-library-chip-btn is-active" : "pf-library-chip-btn"}
                        onClick={() => toggleAge(age.id)}
                      >
                        {age.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {filteredItems.length === 0 ? (
          <div className="pf-library-empty">
            No content found for these filters. Clear one filter and try again.
          </div>
        ) : (
          filteredItems.map((item: LibraryItem) => {
            const isExpanded = expandedItemIds.includes(item.id);
            return (
              <div
                key={item.id}
                className="pf-library-result-card"
                role="button"
                tabIndex={0}
                onClick={() => toggleExpanded(item.id)}
                onKeyDown={(event) => onResultCardKeyDown(event, item.id)}
              >
                <p className="pf-library-result-title">{item.title}</p>
                <p className="pf-library-result-summary">{item.summary}</p>
                <p className="pf-library-result-meta">{LIBRARY_CATEGORY_LABELS[item.category]}</p>
                <div className="pf-library-result-badges">
                  {item.sports.map((sport) => (
                    <span key={`${item.id}-${sport}`} className="pf-library-result-badge">
                      {SPORT_FILTER_VIEW_LABELS[sport]}
                    </span>
                  ))}
                  {item.ageGroups.map((age) => (
                    <span key={`${item.id}-${age}`} className="pf-library-result-badge">
                      {AGE_LABELS[age]}
                    </span>
                  ))}
                </div>
                {(item.duration || item.difficulty) ? (
                  <div className="pf-library-result-badges">
                    {item.duration ? <span className="pf-library-result-badge">{item.duration}</span> : null}
                    {item.difficulty ? <span className="pf-library-result-badge">{item.difficulty}</span> : null}
                  </div>
                ) : null}
                {isExpanded ? (
                  <div className="pf-library-result-details">
                    <p className="pf-library-result-detail-line">
                      <strong>Setup:</strong> {item.setup}
                    </p>
                    <p className="pf-library-result-detail-line">
                      <strong>How it works:</strong> {item.howItWorks}
                    </p>
                    <p className="pf-library-result-detail-line">
                      <strong>Coaching points:</strong> {item.coachingPoints}
                    </p>
                    <p className="pf-library-result-detail-line">
                      <strong>Progression:</strong> {item.progression}
                    </p>
                    <p className="pf-library-result-detail-line">
                      <strong>Match use:</strong> {item.matchUse}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function SessionsPage() {
  return (
    <>
      <div className="pf-header-card">
        <h1 className="pf-title">Sessions</h1>
        <p className="pf-subtitle">Ready-to-run training sessions</p>
      </div>
      <button
        type="button"
        className="pf-btn"
        style={{ justifySelf: "start" }}
        onClick={() => navigateTo("/quickboard")}
      >
        + Create Session
      </button>
      <div className="pf-card">
        <p className="pf-card-title">Share your session</p>
        <p className="pf-card-text">Capture what worked and what to improve.</p>
        <button type="button" className="pf-btn" style={{ marginTop: "10px" }} onClick={() => navigateTo("/notes")}>
          Open Notes
        </button>
      </div>
      <div className="pf-card">
        <p className="pf-card-title">Categories</p>
        <div className="pf-list">
          {SESSION_CATEGORIES.map((item) => (
            <div key={item} className="pf-list-item">
              {item}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PlansPage() {
  return (
    <>
      <div className="pf-header-card">
        <h1 className="pf-title">Plans</h1>
        <p className="pf-subtitle">Pre-season to championship</p>
      </div>
      <div className="pf-card">
        <p className="pf-card-title">Plan Types</p>
        <div className="pf-list">
          {PLAN_TYPES.map((item) => (
            <div key={item} className="pf-list-item">
              {item}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function renderPage(activeTab: PitchFlowTab) {
  if (activeTab === "notes") return <NotesPage />;
  if (activeTab === "library") return <LibraryPage />;
  if (activeTab === "sessions") return <SessionsPage />;
  if (activeTab === "plans") return <PlansPage />;
  return <BoardPage />;
}

export default function PitchFlowCoachShell({ initialTab }: PitchFlowCoachShellProps) {
  const normalizedPath =
    typeof window === "undefined" ? "/board" : window.location.pathname.replace(/\/+$/, "") || "/";
  const activeNav: BottomNavItem["id"] =
    normalizedPath === "/vision-board" ||
    normalizedPath === "/flowlab" ||
    normalizedPath === "/quickboard" ||
    normalizedPath === "/simulator" ||
    normalizedPath === "/tacticalpad-lite" ||
    normalizedPath === "/tacticalpad-lite-clean" ||
    normalizedPath === "/whiteboard"
      ? "flowlab"
      : normalizedPath === "/flowstats" || normalizedPath === "/stats"
        ? "flowstats"
        : normalizedPath === "/notes" ||
            normalizedPath === "/library" ||
            normalizedPath === "/sessions" ||
            normalizedPath === "/plans" ||
            initialTab === "notes" ||
            initialTab === "library" ||
            initialTab === "sessions" ||
            initialTab === "plans"
          ? "notes"
          : "home";

  return (
    <main className="pf-shell">
      <style>{SHELL_CSS}</style>
      <div className="pf-content">{renderPage(initialTab)}</div>
      <nav className="pf-bottom-nav" aria-label="Bottom navigation">
        {BOTTOM_NAV_ITEMS.map((item) => {
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={isActive ? "pf-nav-item is-active" : "pf-nav-item"}
              onClick={() => navigateTo(item.path)}
            >
              <span className="pf-nav-icon" aria-hidden="true">
                {item.short}
              </span>
              <span className="pf-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </main>
  );
}
