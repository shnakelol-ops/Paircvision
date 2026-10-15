import { useEffect, useState } from "react";
import { loadUserKitImage, type KitImageBackend } from "./team-sheet-kit-store";
import { PRESET_KITS, type TeamSheetKit } from "./team-sheet-kits";

/**
 * Render-ready image URL for a kit. Presets resolve synchronously to their
 * static asset. User kits load their Blob from IndexedDB and expose it as an
 * object URL (revoked when the kit changes or the component unmounts);
 * until it loads — or if the image is missing — the role's default preset
 * is shown, so a jersey is never blank.
 */
export function useKitImageSrc(kit: TeamSheetKit, backend?: KitImageBackend): string {
  const fallback = PRESET_KITS.find((k) => k.role === kit.role)!.src!;
  const [userSrc, setUserSrc] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (kit.source !== "user") return;
    let cancelled = false;
    let url: string | null = null;
    void loadUserKitImage(kit.id, backend).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setUserSrc({ id: kit.id, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [kit.id, kit.source, backend]);

  if (kit.source === "preset") return kit.src ?? fallback;
  return userSrc && userSrc.id === kit.id ? userSrc.url : fallback;
}
