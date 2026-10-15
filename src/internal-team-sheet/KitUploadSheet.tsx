import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ProTaggerLineupPitchBackground,
  LINEUP_PITCH_PORTRAIT_VIEWBOX,
} from "../pro-tagger/ProTaggerLineupPitchBackground";
import {
  DEFAULT_TOLERANCE,
  MANUAL_ERASE,
  MANUAL_KEEP,
  MAX_TOLERANCE,
  MIN_TOLERANCE,
  assessRemoval,
  buildAlpha,
  computeAutoMask,
  hasTransparency,
  paintBrush,
  type PixelImage,
  type RemovalAssessment,
} from "./kit-image-processing";
import { validateUpload, type KitImageCodec } from "./kit-image-codec";
import { saveUserKit, type KitImageBackend, type UserKitRecord } from "./team-sheet-kit-store";
import type { KitRole } from "./team-sheet-kits";
import { JERSEY_ASPECT } from "./team-sheet-jersey";

// Kit Builder upload flow: Upload → Remove Background → Preview → Save.
// One full-screen sheet. Processing is entirely on-device; this component
// only orchestrates the pure functions in kit-image-processing.ts and the
// browser codec. Automatic removal is applied only when assessRemoval()
// trusts it — otherwise the background is left in and the coach can paint
// it away, so a white jersey is never cut into automatically.

interface Props {
  file: File;
  teamId: string;
  defaultName: string;
  codec: KitImageCodec;
  backend?: KitImageBackend;
  onSaved: (record: UserKitRecord) => void;
  onClose: () => void;
}

type Loaded = { img: PixelImage; transparent: boolean; assessment: RemovalAssessment | null };
type Brush = "none" | "erase" | "restore";

const TILE_SIZE = 46; // matches the Team Sheet's starter jersey size

function statusMessage(loaded: Loaded, removeOn: boolean): { text: string; tone: "ok" | "warn" } {
  if (loaded.transparent) {
    return { text: "This image already has a transparent background, so nothing needed removing.", tone: "ok" };
  }
  const a = loaded.assessment;
  if (a && !a.confident && !removeOn) {
    if (a.reason === "busy-background") {
      return {
        text: "The background is too busy to remove automatically, so it has been left in. Use Erase to paint it away, or retake the photo against a plain wall or sheet.",
        tone: "warn",
      };
    }
    if (a.reason === "nothing-found") {
      return { text: "No plain background was found around the jersey, so nothing was removed.", tone: "warn" };
    }
    return {
      text: "The background is too close to the jersey's colours to remove automatically without cutting into the jersey, so it has been left in. Use Erase to paint it away, or turn removal on and adjust the tolerance.",
      tone: "warn",
    };
  }
  if (removeOn && a?.confident && a.lightBackdrop) {
    return {
      text: "Background removed. Check white parts of the jersey that touch its outline, like white sleeves or trim — they can look the same as a white background. Use Show original to compare, and Restore to bring back anything missing.",
      tone: "warn",
    };
  }
  if (removeOn) return { text: "Background removed. Check the edges, then use Erase or Restore to fix anything missed.", tone: "ok" };
  return { text: "Background removal is off. The whole photo will be used.", tone: "ok" };
}

export function KitUploadSheet({ file, teamId, defaultName, codec, backend, onSaved, onClose }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [removeOn, setRemoveOn] = useState(false);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);
  const manualRef = useRef<Uint8Array | null>(null);
  const [manualVersion, setManualVersion] = useState(0);
  const [brush, setBrush] = useState<Brush>("none");
  const [showOriginal, setShowOriginal] = useState(false);
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState<KitRole>("outfield");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const tileRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const invalid = validateUpload(file);
    if (invalid) {
      setLoadError(invalid);
      return;
    }
    (async () => {
      try {
        const img = await codec.decode(file);
        await new Promise((r) => setTimeout(r, 0)); // let "Preparing…" paint before heavy work
        if (cancelled) return;
        const transparent = hasTransparency(img);
        const assessment = transparent ? null : assessRemoval(img);
        manualRef.current = new Uint8Array(img.width * img.height);
        setLoaded({ img, transparent, assessment });
        setRemoveOn(Boolean(assessment?.confident));
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "This photo couldn't be opened.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, codec]);

  const autoMask = useMemo(() => {
    if (!loaded || !removeOn) return null;
    if (tolerance === DEFAULT_TOLERANCE && loaded.assessment) return loaded.assessment.mask;
    return computeAutoMask(loaded.img, tolerance);
  }, [loaded, removeOn, tolerance]);

  const alpha = useMemo(
    () => (loaded && manualRef.current ? buildAlpha(loaded.img, autoMask, manualRef.current) : null),
    // manualVersion: brush strokes mutate manualRef in place, so it is the dependency that changes
    [loaded, autoMask, manualVersion],
  );

  // "Show original" paints the untouched photo so the coach can compare.
  const opaque = useMemo(() => (loaded ? buildAlpha(loaded.img, null, new Uint8Array(loaded.img.width * loaded.img.height)) : null), [loaded]);

  useEffect(() => {
    if (!loaded || !alpha) return;
    if (previewRef.current) codec.paint(previewRef.current, loaded.img, showOriginal && opaque ? opaque : alpha);
    if (tileRef.current) {
      codec.paint(tileRef.current, loaded.img, alpha, { width: TILE_SIZE, height: Math.round(TILE_SIZE * JERSEY_ASPECT) });
    }
  }, [loaded, alpha, codec, showOriginal, opaque]);

  const paintAt = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!loaded || !manualRef.current || brush === "none") return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((e.clientX - rect.left) / rect.width) * loaded.img.width;
    const y = ((e.clientY - rect.top) / rect.height) * loaded.img.height;
    const radius = Math.max(loaded.img.width, loaded.img.height) * 0.035;
    paintBrush(manualRef.current, loaded.img.width, loaded.img.height, x, y, radius, brush === "erase" ? MANUAL_ERASE : MANUAL_KEEP);
    setManualVersion((v) => v + 1);
  };

  const clearFixes = () => {
    if (!manualRef.current) return;
    manualRef.current.fill(0);
    setManualVersion((v) => v + 1);
  };

  const save = async () => {
    if (!loaded || !alpha || saving) return;
    setSaving(true);
    setSaveError(null);
    let image: Blob;
    let original: Blob;
    try {
      image = await codec.encodeKit(loaded.img, alpha);
      original = await codec.encodeOriginal(loaded.img, loaded.transparent);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't prepare the jersey image.");
      setSaving(false);
      return;
    }
    try {
      const record = await saveUserKit({ teamId, name, role, image, original }, backend);
      // Best effort: ask the browser not to evict saved kits under storage pressure.
      void globalThis.navigator?.storage?.persist?.().catch(() => undefined);
      onSaved(record);
    } catch {
      setSaveError(
        "Couldn't save this jersey on this device — storage may be full or blocked (for example in private browsing). Nothing was saved.",
      );
      setSaving(false);
    }
  };

  const status = loaded ? statusMessage(loaded, removeOn) : null;

  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-label="Add jersey" onClick={(e) => e.stopPropagation()}>
      <div style={S.header}>
        <button type="button" style={S.ghostBtn} onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <span style={S.title}>Add jersey</span>
        <span style={S.headerSpacer} />
      </div>

      <div style={S.body}>
        {loadError ? (
          <div style={S.errorBox} role="alert">
            <p style={S.message}>{loadError}</p>
            <button type="button" style={S.ghostBtn} onClick={onClose}>
              Close
            </button>
          </div>
        ) : !loaded ? (
          <p style={S.message} role="status">
            Preparing photo…
          </p>
        ) : (
          <>
            <div
              style={{
                ...S.previewBox,
                aspectRatio: `${LINEUP_PITCH_PORTRAIT_VIEWBOX.w} / ${LINEUP_PITCH_PORTRAIT_VIEWBOX.h}`,
              }}
            >
              <ProTaggerLineupPitchBackground />
              <canvas
                ref={previewRef}
                data-testid="kit-preview"
                aria-label="Jersey preview"
                style={{ ...S.previewCanvas, cursor: brush === "none" ? "default" : "crosshair" }}
                onPointerDown={(e) => {
                  if (brush === "none") return;
                  drawingRef.current = true;
                  e.currentTarget.setPointerCapture?.(e.pointerId);
                  paintAt(e);
                }}
                onPointerMove={(e) => {
                  if (drawingRef.current) paintAt(e);
                }}
                onPointerUp={() => {
                  drawingRef.current = false;
                }}
                onPointerCancel={() => {
                  drawingRef.current = false;
                }}
              />
            </div>

            <div style={S.tileRow}>
              <div style={S.tilePitch}>
                <canvas ref={tileRef} data-testid="kit-tile-preview" aria-label="Jersey at team sheet size" style={S.tileCanvas} />
              </div>
              <span style={S.tileLabel}>Actual size on the team sheet</span>
            </div>

            {status && (
              <p style={status.tone === "warn" ? { ...S.message, ...S.warn } : S.message} role="status">
                {status.text}
              </p>
            )}

            <div style={S.section}>
              <label style={S.switchRow}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={removeOn}
                  onChange={(e) => setRemoveOn(e.target.checked)}
                  style={S.checkbox}
                />
                Remove background
              </label>
              {removeOn && (
                <label style={S.sliderRow}>
                  <span style={S.label}>Tolerance</span>
                  <input
                    type="range"
                    min={MIN_TOLERANCE}
                    max={MAX_TOLERANCE}
                    value={tolerance}
                    onChange={(e) => setTolerance(Number(e.target.value))}
                    style={S.slider}
                    aria-label="Tolerance"
                  />
                </label>
              )}
            </div>

            <div style={S.section}>
              <span style={S.label}>Fix by hand — choose a brush, then paint on the preview</span>
              <div style={S.row}>
                {(["erase", "restore"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={brush === b}
                    style={brush === b ? { ...S.choiceBtn, ...S.choiceOn } : S.choiceBtn}
                    onClick={() => setBrush((cur) => (cur === b ? "none" : b))}
                  >
                    {b === "erase" ? "Erase" : "Restore"}
                  </button>
                ))}
                <button type="button" style={S.choiceBtn} onClick={clearFixes}>
                  Clear fixes
                </button>
              </div>
              <button
                type="button"
                aria-pressed={showOriginal}
                style={showOriginal ? { ...S.choiceBtn, ...S.choiceOn } : S.choiceBtn}
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? "Showing original photo" : "Show original"}
              </button>
            </div>

            <div style={S.section}>
              <label style={S.fieldRow}>
                <span style={S.label}>Kit name</span>
                <input
                  type="text"
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  style={S.textInput}
                  autoComplete="off"
                />
              </label>
              <div style={S.row} role="radiogroup" aria-label="Use as">
                {(["outfield", "gk"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={role === r}
                    style={role === r ? { ...S.choiceBtn, ...S.choiceOn } : S.choiceBtn}
                    onClick={() => setRole(r)}
                  >
                    {r === "outfield" ? "Outfield" : "Goalkeeper"}
                  </button>
                ))}
              </div>
            </div>

            {saveError && (
              <p style={{ ...S.message, ...S.warn }} role="alert">
                {saveError}
              </p>
            )}

            <button type="button" style={S.saveBtn} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save jersey"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    flexDirection: "column" as const,
    background: "#050c14",
    color: "#dce8f4",
    overflowY: "auto",
    userSelect: "none" as const,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px 8px",
    background: "#0a2134",
    borderBottom: "1px solid #17324a",
    flexShrink: 0,
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  title: { flex: 1, textAlign: "center" as const, fontWeight: 700, fontSize: 14 },
  headerSpacer: { width: 64 },
  body: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 12,
    padding: "16px 16px calc(24px + env(safe-area-inset-bottom, 0px))",
    width: "100%",
    maxWidth: 412,
    margin: "0 auto",
    boxSizing: "border-box" as const,
  },
  previewBox: {
    position: "relative",
    width: "100%",
    maxWidth: 260,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid #17324a",
  },
  previewCanvas: {
    position: "absolute",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    maxWidth: "88%",
    maxHeight: "88%",
    touchAction: "none",
  },
  tileRow: { display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 260 },
  tilePitch: {
    background: "#166534",
    borderRadius: 8,
    padding: "6px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    filter: "drop-shadow(0 0 2px rgba(4, 8, 14, 0.55))",
  },
  tileCanvas: { width: TILE_SIZE, height: Math.round(TILE_SIZE * JERSEY_ASPECT), display: "block" },
  tileLabel: { fontSize: 11, color: "#7a95ad" },
  message: { margin: 0, fontSize: 12, lineHeight: 1.4, color: "#c7d6e4", textAlign: "center" as const, maxWidth: 360 },
  warn: { color: "#fbbf24" },
  errorBox: { display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12, paddingTop: 24 },
  section: { display: "flex", flexDirection: "column" as const, gap: 8, width: "100%" },
  row: { display: "flex", gap: 6, width: "100%" },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "#7a95ad" },
  switchRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600 },
  checkbox: { width: 20, height: 20, accentColor: "#2ea043" },
  sliderRow: { display: "flex", alignItems: "center", gap: 10 },
  slider: { flex: 1, accentColor: "#2ea043" },
  fieldRow: { display: "flex", flexDirection: "column" as const, gap: 4 },
  textInput: {
    background: "rgba(8, 20, 34, 0.55)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    color: "#e7f0f8",
    fontSize: 14,
    padding: "8px 10px",
    outline: "none",
    fontFamily: "inherit",
  },
  choiceBtn: {
    flex: 1,
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 8,
    color: "#7a95ad",
    fontSize: 13,
    fontWeight: 600,
    padding: "9px 8px",
    cursor: "pointer",
    outline: "none",
    fontFamily: "inherit",
  },
  choiceOn: { background: "#0a2134", border: "1px solid #2ea043", color: "#ffffff" },
  ghostBtn: {
    background: "transparent",
    border: "1px solid #1c3a52",
    borderRadius: 6,
    color: "#7a95ad",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    cursor: "pointer",
    outline: "none",
    width: 64,
  },
  saveBtn: {
    width: "100%",
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    padding: "12px 16px",
    cursor: "pointer",
    outline: "none",
    fontFamily: "inherit",
  },
};
