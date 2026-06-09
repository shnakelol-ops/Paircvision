export type SlateTextFontSize = "sm" | "md" | "lg";

export interface SlateTextAnnotation {
  id: string;
  x: number;        // normalised 0–100
  y: number;        // normalised 0–100
  text: string;
  fontSize: SlateTextFontSize;
  color: string;    // CSS hex e.g. "#ffffff"
  createdAt: number;
}

function makeid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createTextAnnotation(x: number, y: number): SlateTextAnnotation {
  return {
    id: makeid(),
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
    text: "",
    fontSize: "md",
    color: "#ffffff",
    createdAt: Date.now(),
  };
}

const VALID_FONT_SIZES: SlateTextFontSize[] = ["sm", "md", "lg"];

export function sanitizeTextAnnotations(raw: unknown): SlateTextAnnotation[] {
  if (!Array.isArray(raw)) return [];
  const result: SlateTextAnnotation[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== "string" || typeof a.x !== "number" || typeof a.y !== "number" || typeof a.text !== "string") continue;
    result.push({
      id: a.id,
      x: Math.max(0, Math.min(100, a.x)),
      y: Math.max(0, Math.min(100, a.y)),
      text: String(a.text).slice(0, 500),
      fontSize: VALID_FONT_SIZES.includes(a.fontSize as SlateTextFontSize) ? (a.fontSize as SlateTextFontSize) : "md",
      color: typeof a.color === "string" && a.color.startsWith("#") ? a.color : "#ffffff",
      createdAt: typeof a.createdAt === "number" && Number.isFinite(a.createdAt) ? a.createdAt : Date.now(),
    });
  }
  return result;
}

export const FONT_SIZE_PX: Record<SlateTextFontSize, number> = {
  sm: 12,
  md: 16,
  lg: 22,
};

export const TEXT_COLOR_CHOICES: ReadonlyArray<{ label: string; css: string }> = [
  { label: "White", css: "#ffffff" },
  { label: "Yellow", css: "#facc15" },
  { label: "Black", css: "#111111" },
  { label: "Red", css: "#dc2626" },
  { label: "Blue", css: "#2563eb" },
];
