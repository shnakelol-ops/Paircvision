// Small crest thumbnail for a Saved Teams row. Shows the team's stored crest
// in its natural shape, or the given fallback (the existing colour dot) when
// there is no crest, storage is unavailable, or the crest can't be read.
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getDefaultCrestBackend, loadClubCrest, type CrestBackend } from "./crest-store";

export type CrestThumbProps = {
  teamId: string;
  teamName: string;
  fallback: ReactNode;
  /** Bump to reload after the crest was saved or removed. */
  version?: number;
  backend?: CrestBackend | null;
  size?: number;
};

export function CrestThumb({ teamId, teamName, fallback, version = 0, backend, size = 26 }: CrestThumbProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (backend === null) return;
    const store = backend ?? getDefaultCrestBackend();
    let cancelled = false;
    let created: string | null = null;
    void loadClubCrest(teamId, store).then((record) => {
      if (cancelled) return;
      if (record && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        created = URL.createObjectURL(record.image);
        setUrl(created);
      } else {
        setUrl(null);
      }
    });
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [teamId, version, backend]);

  if (!url) return <>{fallback}</>;
  const box: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <span style={box}>
      <img
        src={url}
        alt={`${teamName} crest`}
        style={{ maxWidth: size, maxHeight: size, width: "auto", height: "auto", objectFit: "contain" }}
        onError={() => setUrl(null)}
      />
    </span>
  );
}
