import { useEffect, useRef } from "react";

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

export function useScreenWakeLock(enabled: boolean): void {
  const enabledRef = useRef(enabled);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const typedNavigator = navigator as WakeLockNavigator;
    if (!typedNavigator.wakeLock?.request) return;

    let disposed = false;

    const releaseWakeLock = async () => {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (!sentinel) return;
      try {
        await sentinel.release();
      } catch {
        // Fail silently in unsupported/restricted contexts.
      }
    };

    const requestWakeLock = async () => {
      if (disposed || !enabledRef.current) return;
      if (document.visibilityState !== "visible") return;
      if (wakeLockRef.current) return;
      try {
        const sentinel = await typedNavigator.wakeLock?.request("screen");
        if (!sentinel) return;
        if (disposed || !enabledRef.current || document.visibilityState !== "visible") {
          try {
            await sentinel.release();
          } catch {
            // Ignore release failures in teardown races.
          }
          return;
        }
        wakeLockRef.current = sentinel;
        sentinel.addEventListener?.("release", () => {
          if (wakeLockRef.current === sentinel) {
            wakeLockRef.current = null;
          }
        });
      } catch {
        // Fail silently if wake lock is unsupported or denied.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    if (enabled) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void releaseWakeLock();
    };
  }, [enabled]);
}
