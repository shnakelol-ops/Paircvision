import { useEffect, useState } from "react";
import { loadUserKitImage, type KitImageBackend } from "./team-sheet-kit-store";
import { PRESET_KITS, type TeamSheetKit } from "./team-sheet-kits";

export type KitImageStatus = "ready" | "loading" | "missing";

/**
 * Render-ready image URL for a kit, plus whether it really loaded. Presets
 * resolve synchronously to their static asset. User kits load their Blob
 * from IndexedDB and expose it as an object URL (revoked when the kit
 * changes or the component unmounts); until it loads — or if the image is
 * missing — the role's default preset is shown, so a jersey is never blank.
 * `status: "missing"` lets the screen warn that a saved kit's image is gone.
 */
export function useKitImage(kit: TeamSheetKit, backend?: KitImageBackend): { src: string; status: KitImageStatus } {
  const fallback = PRESET_KITS.find((k) => k.role === kit.role)!.src!;
  const [userSrc, setUserSrc] = useState<{ id: string; url: string } | null>(null);
  const [missingId, setMissingId] = useState<string | null>(null);

  useEffect(() => {
    if (kit.source !== "user") return;
    let cancelled = false;
    let url: string | null = null;
    void loadUserKitImage(kit.id, backend).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setMissingId(kit.id);
        return;
      }
      url = URL.createObjectURL(blob);
      setUserSrc({ id: kit.id, url });
    });
    return () => {
      cancelled = true;
      if (url) {
        const revoked = url;
        URL.revokeObjectURL(revoked);
        // Forget the URL we just revoked, so switching back to this kit
        // shows the fallback while it reloads — never a dead blob: URL.
        setUserSrc((prev) => (prev && prev.url === revoked ? null : prev));
      }
    };
  }, [kit.id, kit.source, backend]);

  if (kit.source === "preset") return { src: kit.src ?? fallback, status: "ready" };
  if (userSrc && userSrc.id === kit.id) return { src: userSrc.url, status: "ready" };
  return { src: fallback, status: missingId === kit.id ? "missing" : "loading" };
}

export function useKitImageSrc(kit: TeamSheetKit, backend?: KitImageBackend): string {
  return useKitImage(kit, backend).src;
}
