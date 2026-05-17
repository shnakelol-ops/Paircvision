import { createContext, useContext, useRef, type MutableRefObject, type ReactNode } from "react";

import AppOverlayRoot from "./AppOverlayRoot";

type OverlayPortalContextValue = MutableRefObject<HTMLDivElement | null>;

const OverlayPortalContext = createContext<OverlayPortalContextValue | null>(null);

type OverlayPortalProviderProps = {
  children: ReactNode;
};

export function OverlayPortalProvider({ children }: OverlayPortalProviderProps) {
  const overlayRootRef = useRef<HTMLDivElement | null>(null);

  return (
    <OverlayPortalContext.Provider value={overlayRootRef}>
      {children}
      <AppOverlayRoot ref={overlayRootRef} />
    </OverlayPortalContext.Provider>
  );
}

export function useOverlayPortalRoot(): HTMLDivElement | null {
  const context = useContext(OverlayPortalContext);
  if (!context) {
    throw new Error("useOverlayPortalRoot must be used within an OverlayPortalProvider.");
  }
  return context.current;
}
