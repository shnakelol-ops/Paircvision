import { useState, useRef, useEffect, type CSSProperties } from "react";
import { type SlateTextFontSize, TEXT_COLOR_CHOICES, FONT_SIZE_PX } from "./slateTextAnnotation";

type Props = {
  onDone: (text: string, fontSize: SlateTextFontSize, color: string) => void;
  onCancel: () => void;
};

const OVERLAY: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.88)",
  display: "flex",
  flexDirection: "column",
  zIndex: 65,
  userSelect: "none",
  WebkitUserSelect: "none",
};

const TOOLBAR: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
  background: "rgba(10, 20, 25, 0.97)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
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

const TITLE: CSSProperties = {
  flex: 1,
  textAlign: "center",
  color: "rgba(255,255,255,0.8)",
  fontSize: "14px",
  fontWeight: 600,
  fontFamily: "inherit",
  margin: 0,
};

const BODY: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "20px",
  padding: "24px 20px",
  overflowY: "auto",
};

export default function SlateLabelEntryModal({ onDone, onCancel }: Props) {
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState<SlateTextFontSize>("md");
  const [color, setColor] = useState("#ffffff");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const canDone = text.trim().length > 0;

  const handleDone = () => {
    if (!canDone) return;
    onDone(text.trim(), fontSize, color);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleDone();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  const pxSize = FONT_SIZE_PX[fontSize];

  return (
    <div style={OVERLAY}>
      <div style={TOOLBAR}>
        <button type="button" style={CANCEL_BTN} onClick={onCancel}>
          Cancel
        </button>
        <p style={TITLE}>Add Label</p>
        <button
          type="button"
          style={{
            padding: "8px 20px",
            borderRadius: "8px",
            border: "none",
            background: canDone ? "#22c55e" : "rgba(34,197,94,0.3)",
            color: "#fff",
            fontFamily: "inherit",
            fontSize: "14px",
            fontWeight: 700,
            cursor: canDone ? "pointer" : "default",
            opacity: canDone ? 1 : 0.5,
            flexShrink: 0,
          }}
          onClick={handleDone}
        >
          Done
        </button>
      </div>

      <div style={BODY}>
        <textarea
          ref={textareaRef}
          rows={3}
          value={text}
          placeholder="Type label…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            maxWidth: "420px",
            fontSize: `${pxSize}px`,
            fontWeight: 700,
            color,
            background: "rgba(255,255,255,0.06)",
            border: "1.5px solid rgba(125,211,252,0.5)",
            borderRadius: "10px",
            padding: "12px 14px",
            outline: "none",
            resize: "none",
            fontFamily: "Inter, system-ui, sans-serif",
            textAlign: "center",
            boxSizing: "border-box",
            caretColor: color,
            lineHeight: 1.4,
          }}
        />

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {(["sm", "md", "lg"] as SlateTextFontSize[]).map((size) => (
            <button
              key={size}
              type="button"
              aria-label={`Font size ${size}`}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "8px",
                border: fontSize === size
                  ? "2px solid rgba(125,211,252,0.9)"
                  : "1.5px solid rgba(150,170,180,0.3)",
                background: fontSize === size
                  ? "rgba(38,72,102,0.9)"
                  : "rgba(20,30,38,0.7)",
                color: "#e8f2fd",
                fontSize: size === "sm" ? "13px" : size === "md" ? "17px" : "22px",
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
                lineHeight: 1,
              }}
              onClick={() => setFontSize(size)}
            >
              A
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {TEXT_COLOR_CHOICES.map((choice) => (
            <button
              key={choice.css}
              type="button"
              aria-label={`Colour ${choice.label}`}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "999px",
                border: color === choice.css
                  ? "3px solid rgba(125,211,252,0.9)"
                  : "1.5px solid rgba(255,255,255,0.22)",
                background: choice.css,
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
              onClick={() => setColor(choice.css)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
