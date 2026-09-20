import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export interface ConfirmSheetProps {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** "confirm" = yes/no, "alert" = dismiss-only, "prompt" = text input */
  variant?: "confirm" | "alert" | "prompt";
  promptDefault?: string;
  promptPlaceholder?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

const BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9000,
  background: "rgba(0, 0, 0, 0.62)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  boxSizing: "border-box",
};

const CARD: CSSProperties = {
  background: "rgba(8, 16, 32, 0.97)",
  border: "1px solid rgba(180, 210, 255, 0.18)",
  borderRadius: "16px",
  boxShadow:
    "0 24px 64px rgba(0, 0, 0, 0.80), 0 4px 16px rgba(0, 0, 0, 0.60)",
  padding: "20px 20px 16px",
  width: "min(340px, calc(100vw - 40px))",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  fontFamily: "Inter, system-ui, sans-serif",
};

const TITLE_STYLE: CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.02em",
  color: "rgba(220, 235, 255, 0.96)",
  margin: 0,
};

const MESSAGE_STYLE: CSSProperties = {
  fontSize: "12px",
  fontWeight: 400,
  color: "rgba(180, 210, 255, 0.78)",
  lineHeight: 1.5,
  margin: 0,
  whiteSpace: "pre-line",
};

const INPUT_STYLE: CSSProperties = {
  height: "36px",
  borderRadius: "8px",
  border: "1px solid rgba(180, 210, 255, 0.25)",
  background: "rgba(6, 12, 26, 0.90)",
  color: "rgba(220, 235, 255, 0.96)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "12px",
  padding: "0 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const BTN_ROW: CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
  marginTop: "4px",
};

const CANCEL_BTN: CSSProperties = {
  height: "34px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(10, 20, 42, 0.80)",
  color: "rgba(180, 210, 255, 0.72)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  padding: "0 16px",
  cursor: "pointer",
};

function confirmBtnStyle(danger: boolean): CSSProperties {
  return {
    height: "34px",
    borderRadius: "999px",
    border: danger
      ? "1px solid rgba(239, 68, 68, 0.55)"
      : "1px solid rgba(74, 222, 128, 0.45)",
    background: danger ? "rgba(40, 8, 8, 0.90)" : "rgba(8, 36, 20, 0.90)",
    color: danger
      ? "rgba(255, 160, 160, 0.96)"
      : "rgba(160, 255, 140, 0.96)",
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    padding: "0 16px",
    cursor: "pointer",
  };
}

export function ConfirmSheet({
  message,
  title,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  variant = "confirm",
  promptDefault = "",
  promptPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const [inputValue, setInputValue] = useState(promptDefault);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAlert = variant === "alert";
  const isPrompt = variant === "prompt";
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    setInputValue(promptDefault ?? "");
  }, [promptDefault]);

  // Move focus into the dialog on open, and restore it to whatever triggered
  // the dialog once it closes (confirm, cancel, Escape, or backdrop click all
  // unmount this component the same way, so one mount/unmount pair covers
  // every close path). Intentionally runs once per mount: variant/isPrompt/
  // isAlert are fixed for the lifetime of a given ConfirmSheet instance.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const initialTarget = isPrompt ? inputRef.current : isAlert ? confirmBtnRef.current : cancelBtnRef.current;
    initialTarget?.focus();
    if (isPrompt) inputRef.current?.select();
    return () => {
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (e.key === "Escape" && !isAlert) {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && !isPrompt) {
        if (!container || container.contains(document.activeElement)) {
          e.preventDefault();
          onConfirm();
        }
        return;
      }
      if (e.key === "Tab" && container) {
        const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
          (el) => !el.hasAttribute("disabled")
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement;
        // Trap Tab/Shift+Tab within the dialog so background content behind
        // the backdrop is never reachable while it's open.
        if (e.shiftKey && current === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && current === last) {
          e.preventDefault();
          first.focus();
        } else if (!container.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isAlert, isPrompt, onCancel, onConfirm]);

  const handleConfirm = () => {
    if (isPrompt) {
      onConfirm(inputValue);
    } else {
      onConfirm();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!isAlert && e.target === e.currentTarget) onCancel();
  };

  return (
    <div style={BACKDROP} onClick={handleBackdropClick}>
      <div
        ref={containerRef}
        style={CARD}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : messageId}
        aria-describedby={title ? messageId : undefined}
      >
        {title && (
          <p id={titleId} style={TITLE_STYLE}>
            {title}
          </p>
        )}
        <p id={messageId} style={MESSAGE_STYLE}>
          {message}
        </p>
        {isPrompt && (
          <input
            ref={inputRef}
            type="text"
            style={INPUT_STYLE}
            value={inputValue}
            placeholder={promptPlaceholder}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirm();
              }
            }}
          />
        )}
        <div style={BTN_ROW}>
          {!isAlert && (
            <button ref={cancelBtnRef} type="button" style={CANCEL_BTN} onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            style={confirmBtnStyle(danger)}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
