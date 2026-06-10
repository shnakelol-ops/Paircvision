export type CoachingCardType = "focus" | "cue" | "drill" | "success" | "problem" | "note";

export interface SlateCoachingCard {
  id: string;
  x: number;        // normalised 0–100
  y: number;        // normalised 0–100
  cardType: CoachingCardType;
  title: string;    // max 60 chars
  body: string;     // max 300 chars
  createdAt: number;
  updatedAt: number;
}

export const CARD_TYPE_CONFIG: Record<CoachingCardType, { icon: string; color: string; label: string }> = {
  focus:   { icon: "⚠",  color: "#f59e0b", label: "Focus" },
  cue:     { icon: "💡", color: "#38bdf8", label: "Cue" },
  drill:   { icon: "📌", color: "#818cf8", label: "Drill" },
  success: { icon: "✅", color: "#34d399", label: "Success" },
  problem: { icon: "❌", color: "#f87171", label: "Problem" },
  note:    { icon: "📝", color: "#94a3b8", label: "Note" },
};

export const COACHING_CARD_TYPES: CoachingCardType[] = [
  "focus", "cue", "drill", "success", "problem", "note",
];

const VALID_CARD_TYPES = new Set<string>(COACHING_CARD_TYPES);

function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCoachingCard(x: number, y: number): SlateCoachingCard {
  const now = Date.now();
  return {
    id: makeId(),
    x: Math.max(2, Math.min(98, x)),
    y: Math.max(2, Math.min(98, y)),
    cardType: "note",
    title: "",
    body: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function sanitizeCoachingCards(raw: unknown): SlateCoachingCard[] {
  if (!Array.isArray(raw)) return [];
  const result: SlateCoachingCard[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.x !== "number" || typeof c.y !== "number") continue;
    if (typeof c.title !== "string") continue;
    const cardType: CoachingCardType = VALID_CARD_TYPES.has(String(c.cardType))
      ? (c.cardType as CoachingCardType)
      : "note";
    result.push({
      id: c.id,
      x: Math.max(0, Math.min(100, c.x)),
      y: Math.max(0, Math.min(100, c.y)),
      cardType,
      title: String(c.title).slice(0, 60),
      body: typeof c.body === "string" ? String(c.body).slice(0, 300) : "",
      createdAt: typeof c.createdAt === "number" && Number.isFinite(c.createdAt) ? c.createdAt : Date.now(),
      updatedAt: typeof c.updatedAt === "number" && Number.isFinite(c.updatedAt) ? c.updatedAt : Date.now(),
    });
  }
  return result;
}
