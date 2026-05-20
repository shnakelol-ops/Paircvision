import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";

export type PremiumPlayerTokenColor = "blue" | "red" | "yellow" | "black";

export const PREMIUM_TOKEN_IDLE_SCALE = 1;
export const PREMIUM_TOKEN_DRAG_SCALE = 1.08;
export const PREMIUM_TOKEN_IDLE_SHADOW_ALPHA = 0.24;
export const PREMIUM_TOKEN_DRAG_SHADOW_ALPHA = 0.36;

const JERSEY_TINT_BY_COLOR: Record<PremiumPlayerTokenColor, number> = {
  blue: 0x2563eb,
  red: 0xdc2626,
  yellow: 0xf2c94c,
  black: 0x111827,
};

const LAYER_TEXTURES = {
  jersey: Texture.from("player-jersey.png"),
  bodyOverlay: Texture.from("player-head-body.png"),
} as const;

const DEFAULT_JERSEY_TINT = 0x2563eb;

function parseHexColor(value: string | number, fallback: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.min(0xffffff, Math.floor(value))) : fallback;
  }

  const normalized = value.trim();
  if (!normalized) return fallback;

  if (/^#[\da-f]{3}$/i.test(normalized)) {
    const [, r, g, b] = normalized.split("");
    if (!r || !g || !b) return fallback;
    return Number.parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }

  if (/^#[\da-f]{6}$/i.test(normalized)) {
    return Number.parseInt(normalized.slice(1), 16);
  }

  if (/^0x[\da-f]{6}$/i.test(normalized)) {
    return Number.parseInt(normalized.slice(2), 16);
  }

  if (/^\d+$/.test(normalized)) {
    const parsed = Number.parseInt(normalized, 10);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(0xffffff, parsed)) : fallback;
  }

  return fallback;
}

type LayeredPlayerConfig = {
  jerseyColor: string | number;
  playerNumber: string | number;
  radius: number;
};

export class LayeredPlayerContainer extends Container {
  private readonly jerseySprite: Sprite;

  constructor(config: LayeredPlayerConfig) {
    super();
    this.eventMode = "static";
    this.cursor = "grab";
    this.pivot.set(0, 0);

    const jerseyWidth = config.radius * 1.38;
    const jerseyHeight = config.radius * 2.08;

    this.jerseySprite = new Sprite(LAYER_TEXTURES.jersey);
    this.jerseySprite.anchor.set(0.5);
    this.jerseySprite.width = jerseyWidth;
    this.jerseySprite.height = jerseyHeight;
    this.jerseySprite.tint = parseHexColor(config.jerseyColor, DEFAULT_JERSEY_TINT);
    this.addChild(this.jerseySprite);

    const detailsOverlay = new Sprite(LAYER_TEXTURES.bodyOverlay);
    detailsOverlay.anchor.set(0.5);
    detailsOverlay.width = jerseyWidth;
    detailsOverlay.height = jerseyHeight;
    this.addChild(detailsOverlay);

    const playerNumberText = new Text({
      text: String(config.playerNumber),
      style: {
        fontFamily: "Arial",
        fontSize: 16,
        fontWeight: "bold",
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
      },
    });
    playerNumberText.anchor.set(0.5, 0.5);
    playerNumberText.position.set(0, 0);
    playerNumberText.resolution =
      typeof window !== "undefined" ? Math.max(2, Math.min(3, window.devicePixelRatio || 1)) : 2;
    playerNumberText.roundPixels = true;
    this.addChild(playerNumberText);
  }

  public updateTeamColor(newColor: string | number): void {
    this.jerseySprite.tint = parseHexColor(newColor, this.jerseySprite.tint || DEFAULT_JERSEY_TINT);
  }
}

export function createPremiumPlayerToken({
  color,
  number,
  label,
  radius,
}: {
  color: PremiumPlayerTokenColor;
  number: number;
  label?: string;
  radius: number;
}): { token: LayeredPlayerContainer; shadow: Graphics } {
  const safeLabel = (label?.trim().slice(0, 3) ?? "") || String(number);
  const token = new LayeredPlayerContainer({
    jerseyColor: JERSEY_TINT_BY_COLOR[color],
    playerNumber: safeLabel,
    radius,
  });
  token.scale.set(PREMIUM_TOKEN_IDLE_SCALE, PREMIUM_TOKEN_IDLE_SCALE);

  const shadow = new Graphics();
  shadow
    .ellipse(0.2, radius * 1.02, radius * 0.8, radius * 0.24)
    .fill({ color: 0x020617, alpha: PREMIUM_TOKEN_IDLE_SHADOW_ALPHA });
  token.addChildAt(shadow, 0);

  return { token, shadow };
}
