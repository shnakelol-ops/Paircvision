// Club crest sheet (Club Crest V1, Checkpoint 1): upload, preview, save,
// replace and remove the crest of ONE Saved Team, identified by its id.
//
// All storage goes through crest-store.ts (IndexedDB only). This component
// never touches localStorage, Saved Teams records or matches.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ChangeEvent } from "react";
import {
  CREST_ACCEPT_ATTRIBUTE,
  browserCrestCodec,
  crestAlpha,
  crestNeedsBacking,
  assessCrestBackgroundRemoval,
  type BackgroundRemovalOffer,
  type CrestCodec,
  type PixelImage,
} from "./crest-image";
import {
  getDefaultCrestBackend,
  isCrestStorageSupported,
  loadClubCrest,
  removeClubCrest,
  saveClubCrest,
  type ClubCrestRecord,
  type CrestBackend,
} from "./crest-store";

/** The dark Match Analysis background, so the preview shows the crest as it will be drawn. */
export const CREST_PREVIEW_BG = "#0b1428";

export type CrestSheetProps = {
  team: { id: string; teamName: string };
  onClose: () => void;
  /** Called after a crest was saved or removed (committed). */
  onChanged?: (teamId: string) => void;
  codec?: CrestCodec;
  backend?: CrestBackend;
  storageSupported?: boolean;
};

type Current = { status: "loading" } | { status: "none" } | { status: "saved"; record: ClubCrestRecord };

type Draft =
  | { phase: "processing" }
  | {
      phase: "ready";
      img: PixelImage;
      originalAlpha: Uint8ClampedArray;
      removedAlpha: Uint8ClampedArray | null;
      offer: BackgroundRemovalOffer;
    };

type Notice = { kind: "error" | "success"; text: string } | null;

function canMakeObjectUrl(): boolean {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

/** Object URL for a stored crest, revoked whenever the blob changes or the component unmounts. */
function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || !canMakeObjectUrl()) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

/** Why "Remove plain background" is not offered, in the coach's terms. */
export function unavailableRemovalMessage(offer: BackgroundRemovalOffer): string {
  if (!("reason" in offer)) return "";
  switch (offer.reason) {
    case "already-transparent":
      return "Transparent background kept.";
    case "busy-background":
      return "Automatic background removal isn't available: the background isn't plain enough. For the cleanest look, use a PNG with a transparent background.";
    case "similar-colours":
      return "Automatic background removal isn't available: parts of the crest are too close in colour to the background. For the cleanest look, use a PNG with a transparent background.";
    case "nothing-found":
      return "No plain background was found around this crest, so it will be used as it is.";
  }
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function CrestPreviewCanvas({
  codec,
  img,
  alpha,
  label,
  selected,
}: {
  codec: CrestCodec;
  img: PixelImage;
  alpha: Uint8ClampedArray;
  label: string;
  selected: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      codec.paint(ref.current, img, alpha);
    } catch {
      // A preview that can't be painted just stays blank; saving reports its own errors.
    }
  }, [codec, img, alpha]);
  return (
    <figure style={{ ...S.previewFigure, ...(selected ? S.previewSelected : {}) }}>
      <div style={S.previewStage}>
        <canvas ref={ref} style={S.previewImage} aria-label={`${label} crest preview`} />
      </div>
      <figcaption style={S.previewCaption}>{label}</figcaption>
    </figure>
  );
}

export function CrestSheet({ team, onClose, onChanged, codec = browserCrestCodec, backend, storageSupported }: CrestSheetProps) {
  const supported = storageSupported ?? isCrestStorageSupported();
  const store = backend ?? (supported ? getDefaultCrestBackend() : null);

  const [current, setCurrent] = useState<Current>({ status: supported ? "loading" : "none" });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [busy, setBusy] = useState<"saving" | "removing" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const mounted = useRef(true);
  const pickToken = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    void loadClubCrest(team.id, store).then((record) => {
      if (cancelled) return;
      setCurrent(record ? { status: "saved", record } : { status: "none" });
    });
    return () => {
      cancelled = true;
    };
  }, [team.id, store]);

  const currentUrl = useBlobUrl(current.status === "saved" ? current.record.image : null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow choosing the same file again
    if (!file) return;
    const token = ++pickToken.current;
    const stale = () => !mounted.current || token !== pickToken.current;
    setNotice(null);
    setConfirmRemove(false);
    setRemoveBackground(false);
    setDraft({ phase: "processing" });
    try {
      const check = await codec.check(file);
      if (stale()) return;
      if ("message" in check) {
        setDraft(null);
        setNotice({ kind: "error", text: check.message });
        return;
      }
      const img = await codec.decode(file);
      if (stale()) return;
      const offer = assessCrestBackgroundRemoval(img);
      const originalAlpha = crestAlpha(img, null);
      const removedAlpha = offer.offered ? crestAlpha(img, offer.mask) : null;
      setDraft({ phase: "ready", img, originalAlpha, removedAlpha, offer });
    } catch (err) {
      if (stale()) return;
      setDraft(null);
      setNotice({ kind: "error", text: errorText(err, "This image couldn't be opened.") });
    }
  }

  async function handleSave() {
    if (!store || !draft || draft.phase !== "ready" || busy) return;
    const useRemoved = removeBackground && draft.removedAlpha !== null;
    const finalAlpha = useRemoved && draft.removedAlpha ? draft.removedAlpha : draft.originalAlpha;
    setBusy("saving");
    setNotice(null);
    try {
      const image = await codec.encode(draft.img, finalAlpha);
      const original = useRemoved ? await codec.encode(draft.img, draft.originalAlpha) : undefined;
      const record = await saveClubCrest(
        {
          teamId: team.id,
          image: image.blob,
          original: original?.blob,
          width: image.width,
          height: image.height,
          backgroundRemoved: useRemoved,
          needsBacking: crestNeedsBacking(draft.img, finalAlpha),
          teamName: team.teamName,
        },
        store,
      );
      if (!mounted.current) return;
      setCurrent({ status: "saved", record });
      setDraft(null);
      setRemoveBackground(false);
      setNotice({ kind: "success", text: "Crest saved." });
      onChanged?.(team.id);
    } catch (err) {
      if (!mounted.current) return;
      setNotice({ kind: "error", text: errorText(err, "Couldn't save the crest. The previous crest has been kept.") });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  async function handleRemove() {
    if (!store || busy) return;
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy("removing");
    setNotice(null);
    try {
      await removeClubCrest(team.id, store);
      if (!mounted.current) return;
      setCurrent({ status: "none" });
      setConfirmRemove(false);
      setNotice({ kind: "success", text: "Crest removed." });
      onChanged?.(team.id);
    } catch (err) {
      if (!mounted.current) return;
      setConfirmRemove(false);
      setNotice({ kind: "error", text: errorText(err, "Couldn't remove the crest. It is still saved.") });
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  const ready = draft?.phase === "ready" ? draft : null;
  const hasCrest = current.status === "saved";

  return (
    <div style={S.overlay} onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label={`Club crest for ${team.teamName}`}>
      <div style={S.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.title}>Club crest — {team.teamName}</span>
          <button style={S.close} onClick={onClose} disabled={busy !== null} aria-label="Close">✕</button>
        </div>

        <div style={S.body}>
          {!supported || !store ? (
            <p style={S.info}>
              Club crests aren't available in this browser mode. Your teams and matches are unaffected.
            </p>
          ) : (
            <>
              {!ready && draft?.phase !== "processing" && (
                <div style={S.currentRow}>
                  <div style={S.currentStage}>
                    {current.status === "loading" ? (
                      <span style={S.muted}>Loading…</span>
                    ) : hasCrest ? (
                      currentUrl ? (
                        <img src={currentUrl} alt={`${team.teamName} crest`} style={S.currentImage} />
                      ) : (
                        <span style={S.muted}>Crest saved</span>
                      )
                    ) : (
                      <span style={S.muted}>No crest yet</span>
                    )}
                  </div>
                  <span style={S.muted}>
                    {hasCrest ? "Current crest" : "Without a crest, the team's monogram is used."}
                  </span>
                </div>
              )}

              {draft?.phase === "processing" && <p style={S.info}>Preparing image…</p>}

              {ready && (
                <>
                  <div style={S.previewRow}>
                    <CrestPreviewCanvas
                      codec={codec}
                      img={ready.img}
                      alpha={ready.originalAlpha}
                      label="Original"
                      selected={!removeBackground || !ready.removedAlpha}
                    />
                    {ready.removedAlpha && (
                      <CrestPreviewCanvas
                        codec={codec}
                        img={ready.img}
                        alpha={ready.removedAlpha}
                        label="Background removed"
                        selected={removeBackground}
                      />
                    )}
                  </div>
                  {ready.removedAlpha ? (
                    <>
                      <label style={S.toggleRow}>
                        <input
                          type="checkbox"
                          checked={removeBackground}
                          onChange={(e) => setRemoveBackground(e.target.checked)}
                          disabled={busy !== null}
                        />
                        <span>Remove plain background</span>
                      </label>
                      <p style={S.hint}>
                        Check the crest is intact. Leave this off if any part of the crest has disappeared.
                      </p>
                    </>
                  ) : (
                    <p style={S.hint}>{unavailableRemovalMessage(ready.offer)}</p>
                  )}
                </>
              )}

              {notice && (
                <p role={notice.kind === "error" ? "alert" : "status"} style={notice.kind === "error" ? S.error : S.success}>
                  {notice.text}
                </p>
              )}

              {confirmRemove && (
                <p style={S.warn}>This also removes the crest from past matches. Tap Remove again to confirm.</p>
              )}

              <input
                ref={fileInput}
                type="file"
                accept={CREST_ACCEPT_ATTRIBUTE}
                aria-label="Choose crest image"
                style={{ display: "none" }}
                onChange={handleFile}
              />

              <div style={S.actions}>
                <button style={S.secondary} onClick={() => fileInput.current?.click()} disabled={busy !== null}>
                  {ready ? "Choose another" : hasCrest ? "Replace crest" : "Choose image"}
                </button>
                {ready ? (
                  <button style={S.primary} onClick={handleSave} disabled={busy !== null}>
                    {busy === "saving" ? "Saving…" : "Save crest"}
                  </button>
                ) : hasCrest ? (
                  <button style={S.danger} onClick={handleRemove} disabled={busy !== null}>
                    {busy === "removing" ? "Removing…" : "Remove crest"}
                  </button>
                ) : null}
              </div>

              <p style={S.footnote}>Crests are stored on this device only and aren't included in backups.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    zIndex: 110,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-end",
  },
  sheet: {
    background: "#0a2134",
    borderRadius: "14px 14px 0 0",
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    color: "#dce8f4",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "14px 16px 10px",
    borderBottom: "1px solid #17324a",
  },
  title: { fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  close: {
    background: "transparent",
    border: "none",
    color: "#5e7a8a",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 2px",
    lineHeight: 1,
  },
  body: { padding: "14px 16px 28px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" },
  currentRow: { display: "flex", alignItems: "center", gap: 14 },
  currentStage: {
    width: 104,
    height: 104,
    flexShrink: 0,
    borderRadius: 10,
    background: CREST_PREVIEW_BG,
    border: "1px solid #17324a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  // Natural shape: contained, never stretched or masked.
  currentImage: { maxWidth: 88, maxHeight: 88, width: "auto", height: "auto", objectFit: "contain" },
  previewRow: { display: "flex", gap: 10 },
  previewFigure: {
    flex: 1,
    margin: 0,
    borderRadius: 10,
    border: "2px solid #17324a",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  previewSelected: { border: "2px solid #2ea043" },
  previewStage: {
    background: CREST_PREVIEW_BG,
    height: 150,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  previewImage: { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" },
  previewCaption: { fontSize: 11, color: "#7a95ad", textAlign: "center", padding: "6px 4px" },
  toggleRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 },
  hint: { fontSize: 12, color: "#7a95ad", margin: 0 },
  info: { fontSize: 13, color: "#7a95ad", margin: 0 },
  muted: { fontSize: 12, color: "#5e7a8a" },
  error: { fontSize: 12, color: "#f85149", margin: 0 },
  success: { fontSize: 13, color: "#2ea043", fontWeight: 600, margin: 0 },
  warn: { fontSize: 12, color: "#fbbf24", margin: 0 },
  actions: { display: "flex", gap: 10 },
  secondary: {
    flex: 1,
    background: "#17324a",
    border: "1px solid #1c3a52",
    borderRadius: 8,
    color: "#dce8f4",
    fontSize: 14,
    fontWeight: 600,
    padding: 12,
    cursor: "pointer",
  },
  primary: {
    flex: 1,
    background: "#238636",
    border: "1px solid #2ea043",
    borderRadius: 8,
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 700,
    padding: 12,
    cursor: "pointer",
  },
  danger: {
    flex: 1,
    background: "transparent",
    border: "1px solid #6e2b2b",
    borderRadius: 8,
    color: "#f85149",
    fontSize: 14,
    fontWeight: 600,
    padding: 12,
    cursor: "pointer",
  },
  footnote: { fontSize: 11, color: "#5e7a8a", margin: 0 },
};
