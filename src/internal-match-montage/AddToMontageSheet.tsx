// "Add to Montage" panel, opened from Match Clipper with one clip or the
// selected clips. Lists this match's montages and offers a new one. Writes only
// the montage store; Match Clipper's own clip data is never written here.

import { useState } from "react";
import type { ClipSelection } from "../internal-match-clipper/clip-types";
import { addClips, createMontage, defaultMontageName, montagesForSource, totals, upsertMontage, type MontageSource } from "./montage-ops";
import { loadMontages, saveMontages } from "./montage-storage";

function fmt(seconds: number): string {
  const s = Math.round(seconds);
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

export default function AddToMontageSheet({
  clips,
  source,
  onDone,
  onClose,
}: {
  clips: ClipSelection[];
  source: MontageSource;
  /** Called after a successful add with a message for the coach. */
  onDone: (message: string, montageId: string) => void;
  onClose: () => void;
}) {
  const initial = loadMontages();
  const [existing] = useState(() => montagesForSource(initial.store, source.key));
  const [name, setName] = useState(() => defaultMontageName(new Date()));
  const [error, setError] = useState<string | null>(
    initial.status === "unreadable" ? "Saved montages on this device couldn't be read, so nothing can be added until that's fixed." : null,
  );
  const clipWord = `${clips.length} clip${clips.length === 1 ? "" : "s"}`;

  const addTo = (montageId: string | null) => {
    const loaded = loadMontages();
    if (loaded.status === "unreadable") {
      setError("Saved montages on this device couldn't be read, so nothing was added.");
      return;
    }
    const target = montageId ? loaded.store.projects.find((p) => p.id === montageId) : createMontage(name, source);
    if (!target) {
      setError("That montage no longer exists.");
      return;
    }
    const r = addClips(target, clips);
    const saved = saveMontages(upsertMontage(loaded.store, r.project));
    if (!saved.ok) {
      setError(saved.reason === "full" ? "This device's storage is full — the montage wasn't saved." : "The montage couldn't be saved on this device.");
      return;
    }
    const extra = [
      r.skippedDuplicates ? `${r.skippedDuplicates} already in it` : "",
      r.skippedFull ? `${r.skippedFull} didn't fit (montage is full)` : "",
    ].filter(Boolean).join(", ");
    onDone(`Added ${r.added} clip${r.added === 1 ? "" : "s"} to “${r.project.name}”${extra ? ` (${extra})` : ""}.`, r.project.id);
  };

  return (
    <div className="am-sheet" role="dialog" aria-label="Add to montage">
      <style>{CSS}</style>
      <p className="am-title">Add {clipWord} to a montage</p>
      {error && <p className="am-error" role="alert">{error}</p>}
      {existing.length > 0 && (
        <ul className="am-list">
          {existing.map((m) => {
            const t = totals(m);
            return (
              <li key={m.id}>
                <button type="button" className="am-choice" onClick={() => addTo(m.id)} aria-label={`Add to ${m.name}`}>
                  <span className="am-name">{m.name}</span>
                  <span className="am-sub">{t.count} clip{t.count === 1 ? "" : "s"} · {fmt(t.seconds)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <label className="am-label">
        New montage name
        <input className="am-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="New montage name" />
      </label>
      <div className="am-row">
        <button type="button" className="am-primary" onClick={() => addTo(null)}>Create montage and add</button>
        <button type="button" className="am-ghost" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

const CSS = `
.am-sheet { border: 1px solid #7CFF72; background: #0A2216; border-radius: 14px; padding: 14px; display: grid; gap: 10px; color: #F1F7F0; }
.am-title { margin: 0; font-weight: 750; }
.am-error { margin: 0; color: #fca5a5; font-size: 13px; }
.am-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.am-choice { width: 100%; text-align: left; min-height: 52px; border-radius: 10px; border: 1px solid #275C3B; background: #10291B; color: #F1F7F0; padding: 8px 12px; display: grid; gap: 2px; font-family: inherit; cursor: pointer; }
.am-name { font-weight: 700; font-size: 14.5px; }
.am-sub { color: #8FA099; font-size: 12.5px; }
.am-label { display: grid; gap: 4px; font-size: 12px; color: #8FA099; }
.am-input { min-height: 44px; border-radius: 8px; border: 1px solid #275C3B; background: #03100B; color: #F1F7F0; padding: 8px 10px; font-size: 16px; font-family: inherit; }
.am-row { display: flex; gap: 8px; flex-wrap: wrap; }
.am-primary, .am-ghost { min-height: 44px; border-radius: 10px; padding: 0 16px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; }
.am-primary { background: #7CFF72; color: #03100B; border: 0; }
.am-ghost { background: transparent; color: #8FA099; border: 1px solid #275C3B; }
`;
