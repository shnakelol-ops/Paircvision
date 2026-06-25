import { useEffect, useRef, type CSSProperties } from "react";

// Must match WORLD_SIZE in createTacticalPadLiteSurface.ts (160 × 100).
const OUT_W = 1600;
const OUT_H = 1000;

type Props = {
  imageDataUrl: string;
  onDone: (compositedDataUrl: string) => void;
  onCancel: () => void;
};

const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#000",
  display: "flex",
  flexDirection: "column",
  zIndex: 60,
  userSelect: "none",
  WebkitUserSelect: "none",
};

const VIEW: CSSProperties = {
  flex: 1,
  position: "relative",
  overflow: "hidden",
  background: "#0a1419",
  touchAction: "none",
  cursor: "grab",
};

const TOOLBAR: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "8px",
  padding: "10px 16px",
  background: "rgba(10, 20, 25, 0.96)",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  fontFamily: "Inter, system-ui, sans-serif",
  flexShrink: 0,
};

const CANCEL_BTN: CSSProperties = {
  padding: "8px 14px",
  borderRadius: "8px",
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,0.55)",
  fontFamily: "inherit",
  fontSize: "14px",
  cursor: "pointer",
  flexShrink: 0,
};

const DONE_BTN: CSSProperties = {
  padding: "8px 20px",
  borderRadius: "8px",
  border: "none",
  background: "#22c55e",
  color: "#fff",
  fontFamily: "inherit",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};

const HINT: CSSProperties = {
  flex: 1,
  margin: 0,
  textAlign: "center",
  color: "rgba(255,255,255,0.35)",
  fontSize: "11px",
  fontFamily: "inherit",
  pointerEvents: "none",
};

const IMG_BASE: CSSProperties = {
  position: "absolute",
  transformOrigin: "center center",
  userSelect: "none",
  WebkitUserSelect: "none",
  pointerEvents: "none",
};

export default function SlateBackgroundPositioner({ imageDataUrl, onDone, onCancel }: Props) {
  const viewRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // All gesture state in refs — no re-render during touch/mouse moves.
  const xfRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const gestRef = useRef<{
    pts: Array<{ id: number; x: number; y: number }>;
    dist: number;
    lastTap: number;
  }>({ pts: [], dist: 0, lastTap: 0 });

  const applyXf = () => {
    const img = imgRef.current;
    if (!img) return;
    const { scale, tx, ty } = xfRef.current;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  const resetXf = () => {
    xfRef.current = { scale: 1, tx: 0, ty: 0 };
    applyXf();
  };

  // Compute initial contain-fit dimensions from the view and image natural size.
  const initFit = () => {
    const view = viewRef.current;
    const img = imgRef.current;
    if (!view || !img || img.naturalWidth === 0) return;
    const vw = view.offsetWidth;
    const vh = view.offsetHeight;
    const ia = img.naturalWidth / img.naturalHeight;
    const va = vw / vh;
    const fw = ia > va ? vw : vh * ia;
    const fh = ia > va ? vw / ia : vh;
    img.style.width = `${fw}px`;
    img.style.height = `${fh}px`;
    img.style.left = `${(vw - fw) / 2}px`;
    img.style.top = `${(vh - fh) / 2}px`;
    resetXf();
  };

  // Non-passive touchmove so preventDefault can block page scroll during gestures.
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      const ts = Array.from(e.touches);
      const prev = gestRef.current.pts;
      if (ts.length === 1 && prev.length >= 1) {
        xfRef.current.tx += ts[0].clientX - prev[0].x;
        xfRef.current.ty += ts[0].clientY - prev[0].y;
      } else if (ts.length === 2) {
        const d = Math.hypot(ts[1].clientX - ts[0].clientX, ts[1].clientY - ts[0].clientY);
        if (gestRef.current.dist > 0) {
          xfRef.current.scale = Math.max(0.25, Math.min(12, xfRef.current.scale * (d / gestRef.current.dist)));
        }
        gestRef.current.dist = d;
        if (prev.length >= 2) {
          xfRef.current.tx += (ts[0].clientX + ts[1].clientX) / 2 - (prev[0].x + prev[1].x) / 2;
          xfRef.current.ty += (ts[0].clientY + ts[1].clientY) / 2 - (prev[0].y + prev[1].y) / 2;
        }
      }
      gestRef.current.pts = ts.map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
      applyXf();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);

  // Wheel zoom for desktop.
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      xfRef.current.scale = Math.max(0.25, Math.min(12, xfRef.current.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      applyXf();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    const ts = Array.from(e.touches);
    const g = gestRef.current;
    if (ts.length === 2) {
      g.dist = Math.hypot(ts[1].clientX - ts[0].clientX, ts[1].clientY - ts[0].clientY);
    }
    if (ts.length === 1) {
      const now = Date.now();
      if (now - g.lastTap < 300) resetXf();
      g.lastTap = now;
    }
    g.pts = ts.map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    gestRef.current.pts = Array.from(e.touches).map(t => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
    if (e.touches.length < 2) gestRef.current.dist = 0;
  };

  // Mouse drag for desktop.
  const handleMouseDown = (e: React.MouseEvent) => {
    const origin = { x: e.clientX, y: e.clientY, tx: xfRef.current.tx, ty: xfRef.current.ty };
    const onMove = (me: MouseEvent) => {
      xfRef.current.tx = origin.tx + me.clientX - origin.x;
      xfRef.current.ty = origin.ty + me.clientY - origin.y;
      applyXf();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  // Composite what is currently visible in the view to a 1600×1000 canvas,
  // then hand that data URL to the surface. Uses getBoundingClientRect() so
  // the browser's own transform maths are the source of truth.
  const handleDone = () => {
    const view = viewRef.current;
    const img = imgRef.current;
    if (!view || !img) { onCancel(); return; }

    const vr = view.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const ratio = OUT_W / vr.width;

    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) { onCancel(); return; }

    ctx.fillStyle = "#0a1419";
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.drawImage(
      img,
      (ir.left - vr.left) * ratio,
      (ir.top - vr.top) * ratio,
      ir.width * ratio,
      ir.height * ratio,
    );
    onDone(canvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div style={OVERLAY}>
      <div
        ref={viewRef}
        style={VIEW}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onDoubleClick={resetXf}
      >
        <img
          ref={imgRef}
          src={imageDataUrl}
          alt=""
          onLoad={initFit}
          draggable={false}
          style={IMG_BASE}
        />
      </div>
      <div style={TOOLBAR}>
        <button type="button" style={CANCEL_BTN} onClick={onCancel}>
          Cancel
        </button>
        <p style={HINT}>Pinch · Pan · Double-tap to reset</p>
        <button type="button" style={DONE_BTN} onClick={handleDone}>
          Done
        </button>
      </div>
    </div>
  );
}
