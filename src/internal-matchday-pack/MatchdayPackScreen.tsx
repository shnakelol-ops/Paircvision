// Internal Matchday Cover screen — /internal/matchday-pack, reached from the
// internal launcher (/internal). Not linked from the public home screen.
//
// Everything heavy is reused, not rebuilt:
//  - the cover is drawn by renderMatchdayCoverCanvas (matchday-cover-renderer.ts);
//  - jerseys come from the existing kit registry / IndexedDB store, and new
//    ones are added with the Team Sheet Kit Builder's KitUploadSheet;
//  - Save Image / Share use the shared imageShare.ts + ShareSheet.tsx.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ShareSheet } from "../features/shared/ShareSheet";
import { saveImageFile, toPngFile } from "../features/shared/imageShare";
import { KitUploadSheet } from "../internal-team-sheet/KitUploadSheet";
import { ACCEPT_ATTRIBUTE, browserKitImageCodec, type KitImageCodec } from "../internal-team-sheet/kit-image-codec";
import type { KitImageBackend, UserKitRecord } from "../internal-team-sheet/team-sheet-kit-store";
import type { TeamSheetKit } from "../internal-team-sheet/team-sheet-kits";
import { useKitImage } from "../internal-team-sheet/useKitImageSrc";
import { JERSEY_ASPECT } from "../internal-team-sheet/team-sheet-jersey";
import {
  loadAvailableKits,
  loadCoverJersey,
  resolveCoverJersey,
  type CoverImage,
  type CoverJerseySource,
} from "./matchday-cover-assets";
import { COVER_HEIGHT, COVER_WIDTH, coverCanvasToPngBlob, renderMatchdayCoverCanvas, type CoverAssets } from "./matchday-cover-renderer";
import {
  DEFAULT_MERIDIEM,
  coverFilename,
  defaultMatchdayPack,
  kitsForClub,
  minuteOptions,
  parseTime24,
  renameSide,
  saveBlocker,
  toTime24,
  updateFixture,
  type Time12,
} from "./matchday-pack-form";
import { formatThrowIn } from "./matchday-cover-text";
import { loadMatchdayPack, saveMatchdayPack } from "./matchday-pack-storage";
import { MATCHDAY_LIMITS, type MatchdayPackV1, type MatchdaySide } from "./matchday-pack-types";

type SideKey = "home" | "away";
type Mode = "preview" | "edit";

export interface RenderedCover {
  canvas: HTMLCanvasElement;
  blob: Blob;
}

interface Props {
  /** Test seams; the app uses the real renderer, kit store and codec. */
  renderCover?: (pack: MatchdayPackV1, assets: CoverAssets) => Promise<RenderedCover | null>;
  loadJersey?: (source: CoverJerseySource) => Promise<CoverImage | null>;
  kitImageBackend?: KitImageBackend;
  kitImageCodec?: KitImageCodec;
}

async function renderWithRenderer(pack: MatchdayPackV1, assets: CoverAssets): Promise<RenderedCover | null> {
  const canvas = await renderMatchdayCoverCanvas(pack, assets);
  if (!canvas) return null;
  const blob = await coverCanvasToPngBlob(canvas);
  return blob ? { canvas, blob } : null;
}

const RENDER_DEBOUNCE_MS = 250;
const SAVE_DEBOUNCE_MS = 400;

function navigateToInternal() {
  if (typeof window !== "undefined") window.location.assign("/internal");
}

export default function MatchdayPackScreen({
  renderCover = renderWithRenderer,
  loadJersey,
  kitImageBackend,
  kitImageCodec = browserKitImageCodec,
}: Props = {}) {
  const [pack, setPack] = useState<MatchdayPackV1>(() => loadMatchdayPack() ?? defaultMatchdayPack());
  const [kits, setKits] = useState<TeamSheetKit[]>(() => loadAvailableKits());
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [cover, setCover] = useState<{ phase: "rendering" } | { phase: "ready" } | { phase: "error"; message: string }>({
    phase: "rendering",
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [upload, setUpload] = useState<{ side: SideKey; file: File } | null>(null);
  const [mode, setMode] = useState<Mode>("preview");

  const previewRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const jerseyCache = useRef(new Map<string, Promise<CoverImage | null>>());
  // The pack + kit list the current preview was drawn from. Switching modes
  // with nothing changed never redraws the cover.
  const renderedFor = useRef<{ pack: MatchdayPackV1; kits: TeamSheetKit[] } | null>(null);

  // Persist fixture details locally (debounced so typing stays smooth).
  useEffect(() => {
    const id = window.setTimeout(() => {
      const blocker = saveBlocker(pack);
      if (blocker) {
        setSaveNote(blocker);
        return;
      }
      setSaveNote(saveMatchdayPack(pack) ? null : "Couldn't save these details on this device — storage may be full or blocked.");
    }, SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [pack]);

  const jersey = useCallback(
    (source: CoverJerseySource): Promise<CoverImage | null> => {
      if (source.kind === "none") return Promise.resolve(null);
      const key = `${source.kind}:${source.kitId}`;
      let cached = jerseyCache.current.get(key);
      if (!cached) {
        cached = (loadJersey ?? ((s: CoverJerseySource) => loadCoverJersey(s, { backend: kitImageBackend })))(source);
        jerseyCache.current.set(key, cached);
      }
      return cached;
    },
    [loadJersey, kitImageBackend],
  );

  // Render the real 1080×1350 cover while it's on screen (Preview mode) and
  // only when the pack or kit list changed since the last render — editing
  // in Edit mode costs no image processing. The PNG is produced here, ahead
  // of any tap, so Share runs inside the tap's user gesture on iPhone Safari.
  useEffect(() => {
    if (mode !== "preview") return;
    const last = renderedFor.current;
    if (last && last.pack === pack && last.kits === kits) return;
    let cancelled = false;
    setCover({ phase: "rendering" });
    const id = window.setTimeout(async () => {
      try {
        const [homeJersey, awayJersey] = await Promise.all([
          jersey(resolveCoverJersey(pack.home, kits)),
          jersey(resolveCoverJersey(pack.away, kits)),
        ]);
        const rendered = await renderCover(pack, { homeJersey, awayJersey });
        if (cancelled) {
          if (rendered) rendered.canvas.width = 0;
          return;
        }
        if (!rendered) {
          blobRef.current = null;
          setCover({ phase: "error", message: "This device couldn't draw the cover." });
          return;
        }
        rendered.canvas.setAttribute("data-testid", "matchday-cover-canvas");
        rendered.canvas.setAttribute("role", "img");
        rendered.canvas.setAttribute("aria-label", `Matchday cover: ${pack.home.name} v ${pack.away.name}`);
        Object.assign(rendered.canvas.style, { width: "100%", height: "auto", display: "block" });
        previewRef.current?.replaceChildren(rendered.canvas);
        if (canvasRef.current && canvasRef.current !== rendered.canvas) canvasRef.current.width = 0; // free the old bitmap
        canvasRef.current = rendered.canvas;
        blobRef.current = rendered.blob;
        renderedFor.current = { pack, kits };
        setCover({ phase: "ready" });
      } catch {
        if (!cancelled) setCover({ phase: "error", message: "This device couldn't draw the cover." });
      }
    }, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [mode, pack, kits, jersey, renderCover]);

  const switchMode = (next: Mode) => {
    setMode(next);
    window.scrollTo({ top: 0 });
  };

  const filename = useMemo(() => coverFilename(pack), [pack]);

  const saveImage = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const outcome = await saveImageFile(toPngFile(blob, filename));
    setNotice(outcome.status === "saved" ? "Image saved." : outcome.message);
  };

  const setSide = (key: SideKey, side: MatchdaySide) => setPack((p) => ({ ...p, [key]: side }));

  const onKitSaved = (record: UserKitRecord) => {
    const side = upload?.side;
    const fresh = loadAvailableKits();
    setKits(fresh);
    setUpload(null);
    if (!side) return;
    if (record.role === "outfield") {
      setPack((p) => ({ ...p, [side]: { ...p[side], outfieldKitId: record.id } }));
    } else {
      setNotice("Saved as a goalkeeper jersey — the cover uses outfield jerseys, so it isn't selected here.");
    }
  };

  return (
    <div className="mp-shell">
      <style>{CSS}</style>
      <div className="mp-header">
        <button type="button" className="mp-ghost" onClick={navigateToInternal}>
          ← Internal
        </button>
        <h1 className="mp-title">Matchday Cover</h1>
        <span className="mp-spacer" />
      </div>
      <div className="mp-modes" role="tablist" aria-label="Matchday Cover mode">
        {(["preview", "edit"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`mp-tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`mp-panel-${m}`}
            className={mode === m ? "mp-mode mp-mode-on" : "mp-mode"}
            onClick={() => switchMode(m)}
          >
            {m === "preview" ? "Cover" : "Edit details"}
          </button>
        ))}
      </div>

      <div className="mp-layout">
        <section
          className="mp-preview-col"
          id="mp-panel-preview"
          role="tabpanel"
          aria-labelledby="mp-tab-preview"
          hidden={mode !== "preview"}
        >
          <div className="mp-preview" ref={previewRef} style={{ aspectRatio: `${COVER_WIDTH} / ${COVER_HEIGHT}` }} />
          <p className="mp-status" role="status" data-testid="cover-status" data-phase={cover.phase}>
            {cover.phase === "rendering" ? "Updating cover…" : cover.phase === "ready" ? `${COVER_WIDTH}×${COVER_HEIGHT} image` : cover.message}
          </p>
          <div className="mp-actions">
            <button type="button" className="mp-primary" onClick={() => void saveImage()} disabled={cover.phase !== "ready"}>
              Save Image
            </button>
            <button type="button" className="mp-secondary" onClick={() => setShareOpen(true)} disabled={cover.phase !== "ready"}>
              Share
            </button>
          </div>
          {notice && (
            <p className="mp-notice" role="status">
              {notice}
            </p>
          )}
          <button type="button" className="mp-edit" onClick={() => switchMode("edit")}>
            ✎ Edit details
          </button>
        </section>

        <section className="mp-form" id="mp-panel-edit" role="tabpanel" aria-labelledby="mp-tab-edit" hidden={mode !== "edit"}>
          <fieldset className="mp-card">
            <legend className="mp-legend">Fixture</legend>
            <Field label="Competition">
              <input
                className="mp-input"
                value={pack.fixture.competition}
                maxLength={MATCHDAY_LIMITS.competition}
                placeholder="Limerick Senior Football Championship"
                onChange={(e) => setPack((p) => updateFixture(p, { competition: e.target.value }))}
              />
            </Field>
            <Field label="Round">
              <input
                className="mp-input"
                value={pack.fixture.round}
                maxLength={MATCHDAY_LIMITS.round}
                placeholder="Quarter-Final"
                onChange={(e) => setPack((p) => updateFixture(p, { round: e.target.value }))}
              />
            </Field>
            <Field label="Date">
              <input
                className="mp-input"
                type="date"
                value={pack.fixture.date}
                onChange={(e) => setPack((p) => updateFixture(p, { date: e.target.value }))}
              />
            </Field>
            <ThrowInPicker value={pack.fixture.throwIn} onChange={(throwIn) => setPack((p) => updateFixture(p, { throwIn }))} />
            <Field label="Venue">
              <input
                className="mp-input"
                value={pack.fixture.venue}
                maxLength={MATCHDAY_LIMITS.venue}
                placeholder="Kilmallock GAA Grounds"
                onChange={(e) => setPack((p) => updateFixture(p, { venue: e.target.value }))}
              />
            </Field>
          </fieldset>

          {(["home", "away"] as const).map((key) => (
            <ClubCard
              key={key}
              sideKey={key}
              title={key === "home" ? "Home club" : "Away club"}
              side={pack[key]}
              kits={kitsForClub(kits, pack[key].teamId)}
              backend={kitImageBackend}
              onRename={(name) => setSide(key, renameSide(pack[key], name, kits))}
              onPickKit={(kitId) => setSide(key, { ...pack[key], outfieldKitId: kitId })}
              onColours={(colours) => setSide(key, { ...pack[key], colours })}
              onUpload={(file) => setUpload({ side: key, file })}
            />
          ))}

          {saveNote && (
            <p className="mp-warn" role="alert">
              {saveNote}
            </p>
          )}
          <p className="mp-hint">Saved on this device only. Jerseys come from the Team Sheet Kit Builder.</p>
          <div className="mp-dock">
            <button type="button" className="mp-primary mp-dock-btn" onClick={() => switchMode("preview")}>
              View cover
            </button>
          </div>
        </section>
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        heading="Share matchday cover"
        input={{
          getBlob: async () => {
            if (!blobRef.current) throw new Error("Cover not ready");
            return blobRef.current;
          },
          filename,
          title: `${pack.home.name} v ${pack.away.name}`,
        }}
      />

      {upload && (
        <KitUploadSheet
          file={upload.file}
          teamId={pack[upload.side].teamId}
          defaultName={`${pack[upload.side].name} kit`.slice(0, 40)}
          codec={kitImageCodec}
          backend={kitImageBackend}
          onSaved={onKitSaved}
          onClose={() => setUpload(null)}
        />
      )}
    </div>
  );
}

/**
 * 12-hour throw-in picker with an explicit AM/PM choice. Stores the same
 * 24-hour "HH:mm" as before, so saved fixtures load unchanged; a saved
 * morning time shows AM selected and is flagged so it can't slip through.
 */
function ThrowInPicker({ value, onChange }: { value: string; onChange: (hhmm: string) => void }) {
  const t = parseTime24(value);
  const set = (patch: Partial<Time12>) => {
    const base: Time12 = t ?? { hour: 3, minute: 0, period: DEFAULT_MERIDIEM };
    onChange(toTime24({ ...base, ...patch }));
  };
  const shown = formatThrowIn(value).toUpperCase();
  return (
    <div className="mp-field">
      <span className="mp-label" id="mp-throwin-label">
        Throw-in
      </span>
      <div className="mp-time" role="group" aria-labelledby="mp-throwin-label">
        <select
          className="mp-input mp-select"
          aria-label="Throw-in hour"
          value={t ? String(t.hour) : ""}
          onChange={(e) => (e.target.value === "" ? onChange("") : set({ hour: Number(e.target.value) }))}
        >
          <option value="">--</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="mp-colon" aria-hidden="true">
          :
        </span>
        <select
          className="mp-input mp-select"
          aria-label="Throw-in minutes"
          value={t ? String(t.minute) : ""}
          disabled={!t}
          onChange={(e) => set({ minute: Number(e.target.value) })}
        >
          {!t && <option value="">--</option>}
          {minuteOptions(t?.minute ?? null).map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, "0")}
            </option>
          ))}
        </select>
        <div className="mp-ampm" role="radiogroup" aria-label="AM or PM">
          {(["AM", "PM"] as const).map((period) => (
            <button
              key={period}
              type="button"
              role="radio"
              aria-checked={t?.period === period}
              disabled={!t}
              className={t?.period === period ? "mp-ampm-btn mp-ampm-on" : "mp-ampm-btn"}
              onClick={() => set({ period })}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      <p className={t?.period === "AM" ? "mp-time-note mp-time-am" : "mp-time-note"} data-testid="throwin-note">
        {t ? `On the cover: ${shown}${t.period === "AM" ? " — a morning throw-in" : ""}` : "No throw-in time on the cover"}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mp-field">
      <span className="mp-label">{label}</span>
      {children}
    </label>
  );
}

function ClubCard({
  sideKey,
  title,
  side,
  kits,
  backend,
  onRename,
  onPickKit,
  onColours,
  onUpload,
}: {
  sideKey: SideKey;
  title: string;
  side: MatchdaySide;
  kits: TeamSheetKit[];
  backend?: KitImageBackend;
  onRename: (name: string) => void;
  onPickKit: (kitId: string | null) => void;
  onColours: (colours: MatchdaySide["colours"]) => void;
  onUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = side.outfieldKitId && kits.some((k) => k.id === side.outfieldKitId) ? side.outfieldKitId : null;
  return (
    <fieldset className="mp-card">
      <legend className="mp-legend">{title}</legend>
      <Field label="Club name">
        <input
          className="mp-input"
          value={side.name}
          maxLength={MATCHDAY_LIMITS.teamName}
          autoComplete="off"
          onChange={(e) => onRename(e.target.value)}
        />
      </Field>
      <div className="mp-field">
        <span className="mp-label" id={`mp-${sideKey}-jersey`}>
          {title} jersey
        </span>
        <div className="mp-kits" role="radiogroup" aria-labelledby={`mp-${sideKey}-jersey`}>
          {kits.map((kit) => (
            <KitChoice key={kit.id} kit={kit} backend={backend} selected={kit.id === selected} onSelect={() => onPickKit(kit.id)} />
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={selected === null}
            className={selected === null ? "mp-kit mp-kit-on" : "mp-kit"}
            onClick={() => onPickKit(null)}
          >
            <span className="mp-swatch" style={{ background: `linear-gradient(135deg, ${side.colours.primary} 50%, ${side.colours.secondary} 50%)` }} />
            <span className="mp-kit-name">Club colours</span>
          </button>
          <button type="button" className="mp-kit mp-kit-add" onClick={() => fileRef.current?.click()}>
            + Add jersey
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            hidden
            data-testid={`${sideKey}-kit-file`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </div>
      </div>
      <div className="mp-row">
        <Field label="Main colour">
          <input
            className="mp-colour"
            type="color"
            value={side.colours.primary}
            onChange={(e) => onColours({ ...side.colours, primary: e.target.value })}
          />
        </Field>
        <Field label="Trim colour">
          <input
            className="mp-colour"
            type="color"
            value={side.colours.secondary}
            onChange={(e) => onColours({ ...side.colours, secondary: e.target.value })}
          />
        </Field>
      </div>
    </fieldset>
  );
}

function KitChoice({ kit, backend, selected, onSelect }: { kit: TeamSheetKit; backend?: KitImageBackend; selected: boolean; onSelect: () => void }) {
  const { src, status } = useKitImage(kit, backend);
  // useKitImage falls back to a Ballylanders preset while a user kit loads or
  // if its image is missing — never show that as this club's jersey.
  const showImage = kit.source === "preset" || status === "ready";
  return (
    <button type="button" role="radio" aria-checked={selected} className={selected ? "mp-kit mp-kit-on" : "mp-kit"} onClick={onSelect}>
      {showImage ? (
        <img src={src} alt="" width={26} height={Math.round(26 * JERSEY_ASPECT)} className="mp-kit-img" draggable={false} />
      ) : (
        <span className="mp-swatch mp-swatch-empty" aria-hidden="true" />
      )}
      <span className="mp-kit-name">{status === "missing" ? `${kit.name} (image missing)` : kit.name}</span>
    </button>
  );
}

const CSS = `
.mp-shell {
  min-height: 100dvh;
  background: #050c14;
  color: #dce8f4;
  font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif;
  box-sizing: border-box;
  padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
}
.mp-shell *, .mp-shell *::before, .mp-shell *::after { box-sizing: border-box; }
.mp-header {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; gap: 8px;
  padding: calc(9px + env(safe-area-inset-top, 0px)) 16px 8px;
  background: #0a2134; border-bottom: 1px solid #17324a;
}
.mp-title { flex: 1; min-width: 0; margin: 0; text-align: center; font-size: 15px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-spacer { width: 86px; flex-shrink: 0; }
.mp-ghost {
  width: 86px; flex-shrink: 0; white-space: nowrap; background: transparent; border: 1px solid #1c3a52; border-radius: 6px;
  color: #a9bccf; font-size: 13px; font-weight: 600; padding: 6px 8px; cursor: pointer; font-family: inherit;
}
.mp-shell [hidden] { display: none !important; }
.mp-modes {
  position: sticky; top: calc(49px + env(safe-area-inset-top, 0px)); z-index: 4;
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px;
  padding: 8px 16px; background: #050c14; border-bottom: 1px solid #10263a;
}
.mp-mode {
  min-height: 40px; border-radius: 999px; border: 1px solid #23435f; background: transparent;
  color: #a9bccf; font-size: 15px; font-weight: 700; font-family: inherit; cursor: pointer;
}
.mp-mode-on { background: #12304a; border-color: #e8c06a; color: #fff; }
.mp-layout {
  display: flex; flex-direction: column; gap: 16px;
  max-width: 560px; margin: 0 auto; padding: 12px 16px 0;
}
/* Fit the whole cover plus Save / Share on screen, even on an iPhone SE. */
.mp-preview {
  width: min(100%, calc((100dvh - 290px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) * 0.8));
  min-width: 220px; margin: 0 auto;
  border-radius: 10px; overflow: hidden; background: #0b1220;
  box-shadow: 0 10px 30px rgba(0,0,0,0.45);
}
.mp-edit {
  width: 100%; min-height: 48px; margin-top: 10px; border-radius: 10px; border: 1px dashed #2b5373;
  background: transparent; color: #e7f0f8; font-size: 16px; font-weight: 700; font-family: inherit; cursor: pointer;
}
.mp-dock {
  position: sticky; bottom: 0; z-index: 3; margin: 0 -16px;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, rgba(5,12,20,0) 0%, #050c14 30%);
}
.mp-dock-btn { width: 100%; }
.mp-time { display: flex; align-items: center; gap: 6px; }
.mp-select { width: auto; flex: 1 1 0; min-width: 64px; padding-right: 6px; -webkit-appearance: menulist; appearance: auto; }
.mp-colon { font-size: 20px; font-weight: 700; color: #a9bccf; }
.mp-ampm { display: flex; flex: 0 0 auto; border: 1px solid #23435f; border-radius: 8px; overflow: hidden; }
.mp-ampm-btn {
  min-width: 52px; min-height: 44px; border: 0; background: #0b2238; color: #a9bccf;
  font-size: 16px; font-weight: 700; font-family: inherit; cursor: pointer;
}
.mp-ampm-btn + .mp-ampm-btn { border-left: 1px solid #23435f; }
.mp-ampm-on { background: #e8c06a; color: #0b1220; }
.mp-ampm-btn:disabled { opacity: 0.5; cursor: default; }
.mp-time-note { margin: 2px 0 0; font-size: 13px; color: #a9bccf; }
.mp-time-am { color: #fbbf24; font-weight: 600; }
.mp-status { margin: 8px 0 0; font-size: 12px; color: #7a95ad; text-align: center; min-height: 16px; }
.mp-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.mp-primary, .mp-secondary {
  min-height: 48px; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.mp-primary { background: #238636; border: 1px solid #2ea043; color: #fff; }
.mp-secondary { background: #0a2134; border: 1px solid #2b5373; color: #e7f0f8; }
.mp-primary:disabled, .mp-secondary:disabled { opacity: 0.5; cursor: default; }
.mp-notice { margin: 8px 0 0; font-size: 13px; color: #a9bccf; text-align: center; }
.mp-form { display: flex; flex-direction: column; gap: 14px; }
.mp-card { margin: 0; border: 1px solid #17324a; border-radius: 12px; padding: 12px 14px 14px; background: #08182a; min-width: 0; }
.mp-legend { padding: 0 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #e8c06a; }
.mp-field { display: flex; flex-direction: column; gap: 5px; margin-top: 10px; min-width: 0; flex: 1; }
.mp-label { font-size: 12px; font-weight: 600; color: #a9bccf; }
.mp-input {
  width: 100%; min-height: 44px; font-size: 16px; /* 16px: iPhone Safari won't zoom on focus */
  color: #f1f7f0; background: #0b2238; border: 1px solid #23435f; border-radius: 8px; padding: 8px 10px;
  font-family: inherit; -webkit-appearance: none; appearance: none;
}
.mp-input:focus { outline: 2px solid #e8c06a; outline-offset: 1px; }
.mp-input::-webkit-date-and-time-value { text-align: left; }
.mp-row { display: flex; gap: 10px; }
.mp-colour { width: 100%; height: 44px; padding: 2px; background: #0b2238; border: 1px solid #23435f; border-radius: 8px; }
.mp-kits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.mp-kit {
  display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 6px 10px; min-width: 0;
  background: #0b2238; border: 1px solid #23435f; border-radius: 10px; color: #c7d6e4;
  font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; text-align: left;
}
.mp-kit-on { border-color: #e8c06a; background: #12304a; color: #fff; box-shadow: inset 0 0 0 1px #e8c06a; }
.mp-kit-add { justify-content: center; border-style: dashed; color: #a9bccf; }
.mp-kit-img { flex-shrink: 0; object-fit: contain; pointer-events: none; }
.mp-kit-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mp-swatch { flex-shrink: 0; width: 26px; height: 32px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); }
.mp-swatch-empty { background: repeating-linear-gradient(45deg, #1b3550, #1b3550 4px, #0b2238 4px, #0b2238 8px); }
.mp-warn { margin: 0; font-size: 13px; color: #fbbf24; }
.mp-hint { margin: 0; font-size: 12px; color: #5e7a8a; text-align: center; }
`;
