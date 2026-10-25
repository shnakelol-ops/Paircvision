import { useState, useEffect, useCallback } from "react";

export function useSWUpdate(): { updateReady: boolean; apply: () => void } {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (cancelled) return;

      // A SW is already waiting (e.g. user returned to the tab after an update
      // downloaded in a previous visit).
      if (registration.waiting) {
        setWaitingSW(registration.waiting);
        return;
      }

      const onUpdateFound = () => {
        const installing = registration.installing;
        if (!installing) return;
        const onStateChange = () => {
          // "installed" with an existing controller means the new SW is waiting.
          // Without a controller it's the very first install — no banner needed.
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            if (!cancelled) setWaitingSW(installing);
          }
        };
        installing.addEventListener("statechange", onStateChange);
      };

      registration.addEventListener("updatefound", onUpdateFound);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback(() => {
    if (!waitingSW) return;

    // Reload once the new SW takes control. { once: true } prevents a
    // spurious reload on future controller changes.
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        window.location.reload();
      },
      { once: true },
    );

    // Tell the waiting SW to activate immediately.
    // vite-plugin-pwa's generated sw.js listens for this message type.
    waitingSW.postMessage({ type: "SKIP_WAITING" });
    setWaitingSW(null);
  }, [waitingSW]);

  return { updateReady: waitingSW !== null, apply };
}
