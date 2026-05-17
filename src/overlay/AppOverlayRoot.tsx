import { forwardRef, type CSSProperties } from "react";

const APP_OVERLAY_ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  paddingTop: "env(safe-area-inset-top, 0px)",
  paddingRight: "env(safe-area-inset-right, 0px)",
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  paddingLeft: "env(safe-area-inset-left, 0px)",
  boxSizing: "border-box",
  pointerEvents: "none",
  zIndex: 1000,
};

const AppOverlayRoot = forwardRef<HTMLDivElement>(function AppOverlayRoot(_props, ref) {
  return <div id="app-overlay-root" ref={ref} style={APP_OVERLAY_ROOT_STYLE} data-app-overlay-root="true" />;
});

export default AppOverlayRoot;
