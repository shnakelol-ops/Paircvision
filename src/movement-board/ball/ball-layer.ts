import { Circle, Container, Graphics } from "pixi.js";

import type { BallType } from "../shell/types";

const BALL_RADIUS_SMALL = 2.3;
const BALL_RADIUS_MEDIUM = 3.1;

export type BallLayerHandle = {
  setBallPosition: (worldX: number, worldY: number) => void;
  setVisible: (visible: boolean) => void;
  setBallType: (ballType: BallType) => void;
  setInteractive: (enabled: boolean, hitRadius: number) => void;
  setOnPointerDown: (handler: ((event: unknown) => void) | null) => void;
  destroy: () => void;
};

function ballRadius(ballType: BallType): number {
  return ballType.endsWith("Medium") ? BALL_RADIUS_MEDIUM : BALL_RADIUS_SMALL;
}

function clampStrokeWidth(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function drawBallGroundingShadows(
  graphic: Graphics,
  radius: number,
  options: {
    castYOffset: number;
    castXScale: number;
    castYScale: number;
    castAlpha: number;
    contactYOffset: number;
    contactXScale: number;
    contactYScale: number;
    contactAlpha: number;
  },
): void {
  graphic
    .ellipse(0, radius * options.castYOffset, radius * options.castXScale, radius * options.castYScale)
    .fill({ color: 0x020617, alpha: options.castAlpha });
  graphic
    .ellipse(0, radius * options.contactYOffset, radius * options.contactXScale, radius * options.contactYScale)
    .fill({ color: 0x020617, alpha: options.contactAlpha });
}

// Custom in-house renderer inspired by real GAA football characteristics.
// This is procedural tactical artwork and does not copy branded ball graphics.
function drawPremiumFootball(graphic: Graphics, radius: number): void {
  const shellStroke = clampStrokeWidth(radius * 0.12, 0.2, 0.34);
  const panelBandStroke = clampStrokeWidth(radius * 0.12, 0.19, 0.28);
  const seamStroke = clampStrokeWidth(radius * 0.1, 0.17, 0.24);

  drawBallGroundingShadows(graphic, radius, {
    castYOffset: 0.6,
    castXScale: 1.06,
    castYScale: 0.36,
    castAlpha: 0.12,
    contactYOffset: 0.84,
    contactXScale: 0.78,
    contactYScale: 0.23,
    contactAlpha: 0.2,
  });

  graphic
    .circle(0, 0, radius)
    .fill(0xaab3bb)
    .circle(0, -radius * 0.015, radius * 0.92)
    .fill(0xf5f4ee)
    .stroke({ color: 0x69747e, width: shellStroke, alpha: 0.88, alignment: 0.5 });

  graphic
    .ellipse(radius * 0.03, radius * 0.53, radius * 0.76, radius * 0.34)
    .fill({ color: 0x6c7781, alpha: 0.19 });
  graphic
    .ellipse(-radius * 0.32, -radius * 0.35, radius * 0.48, radius * 0.27)
    .fill({ color: 0xffffff, alpha: 0.45 });
  graphic
    .ellipse(-radius * 0.1, -radius * 0.56, radius * 0.24, radius * 0.1)
    .fill({ color: 0xffffff, alpha: 0.22 });

  graphic
    .arc(0, 0, radius * 0.69, Math.PI * 0.22, Math.PI * 0.78)
    .stroke({ color: 0x7b8792, width: panelBandStroke, alpha: 0.34, cap: "round", join: "round" });
  graphic
    .arc(0, 0, radius * 0.69, Math.PI * 1.22, Math.PI * 1.78)
    .stroke({ color: 0x7b8792, width: panelBandStroke, alpha: 0.34, cap: "round", join: "round" });

  const panelRidgeStroke = clampStrokeWidth(panelBandStroke * 0.42, 0.12, 0.18);
  graphic
    .arc(0, 0, radius * 0.69, Math.PI * 0.24, Math.PI * 0.76)
    .stroke({ color: 0xf7f8f8, width: panelRidgeStroke, alpha: 0.22, cap: "round", join: "round" });
  graphic
    .arc(0, 0, radius * 0.69, Math.PI * 1.24, Math.PI * 1.76)
    .stroke({ color: 0xf7f8f8, width: panelRidgeStroke, alpha: 0.22, cap: "round", join: "round" });

  graphic
    .moveTo(-radius * 0.61, -radius * 0.03)
    .lineTo(-radius * 0.23, radius * 0.03)
    .moveTo(radius * 0.61, -radius * 0.03)
    .lineTo(radius * 0.23, radius * 0.03)
    .stroke({ color: 0x6f7c87, width: seamStroke, alpha: 0.42, cap: "round", join: "round" });
  graphic
    .moveTo(0, -radius * 0.56)
    .lineTo(0, -radius * 0.29)
    .moveTo(0, radius * 0.29)
    .lineTo(0, radius * 0.56)
    .stroke({ color: 0x6f7c87, width: seamStroke, alpha: 0.3, cap: "round", join: "round" });
}

// Custom in-house renderer inspired by real sliotar seam/ridge behavior.
// This remains original tactical artwork and does not copy branded assets.
function drawPremiumSliotar(graphic: Graphics, radius: number): void {
  const shellStroke = clampStrokeWidth(radius * 0.14, 0.21, 0.34);
  const seamBandStroke = clampStrokeWidth(radius * 0.17, 0.2, 0.32);

  drawBallGroundingShadows(graphic, radius, {
    castYOffset: 0.57,
    castXScale: 0.92,
    castYScale: 0.31,
    castAlpha: 0.12,
    contactYOffset: 0.79,
    contactXScale: 0.66,
    contactYScale: 0.2,
    contactAlpha: 0.2,
  });

  graphic
    .circle(0, 0, radius)
    .fill(0xca8a04)
    .circle(0, -radius * 0.01, radius * 0.91)
    .fill(0xfacc15)
    .stroke({ color: 0x6d5a1f, width: shellStroke, alpha: 0.92, alignment: 0.5 });
  graphic
    .ellipse(radius * 0.04, radius * 0.52, radius * 0.68, radius * 0.33)
    .fill({ color: 0x9b7a1e, alpha: 0.22 });
  graphic
    .ellipse(-radius * 0.3, -radius * 0.34, radius * 0.42, radius * 0.25)
    .fill({ color: 0xfff4b0, alpha: 0.5 });
  graphic
    .ellipse(-radius * 0.1, -radius * 0.55, radius * 0.21, radius * 0.1)
    .fill({ color: 0xfff8cc, alpha: 0.24 });

  graphic
    .moveTo(-radius * 0.82, -radius * 0.17)
    .quadraticCurveTo(0, -radius * 0.75, radius * 0.82, radius * 0.04)
    .stroke({ color: 0x1f2937, width: seamBandStroke, alpha: 0.54, cap: "round", join: "round" });
  graphic
    .moveTo(-radius * 0.82, radius * 0.12)
    .quadraticCurveTo(0, -radius * 0.47, radius * 0.82, radius * 0.32)
    .stroke({ color: 0x1f2937, width: seamBandStroke, alpha: 0.5, cap: "round", join: "round" });

  const seamRidgeStroke = clampStrokeWidth(seamBandStroke * 0.34, 0.13, 0.2);
  graphic
    .moveTo(-radius * 0.82, -radius * 0.18)
    .quadraticCurveTo(0, -radius * 0.71, radius * 0.82, radius * 0.01)
    .stroke({ color: 0xfde68a, width: seamRidgeStroke, alpha: 0.25, cap: "round", join: "round" });
  graphic
    .moveTo(-radius * 0.82, radius * 0.1)
    .quadraticCurveTo(0, -radius * 0.44, radius * 0.82, radius * 0.28)
    .stroke({ color: 0xfde68a, width: seamRidgeStroke, alpha: 0.22, cap: "round", join: "round" });
}

function drawBallGraphics(ball: Graphics, ballType: BallType): void {
  const r = ballRadius(ballType);
  ball.clear();
  if (ballType.startsWith("sliotar")) {
    drawPremiumSliotar(ball, r);
  } else {
    drawPremiumFootball(ball, r);
  }
}

export function createBallLayer(parent: Container): BallLayerHandle {
  const group = new Container();
  group.eventMode = "none";
  group.visible = false;

  const ball = new Graphics();
  ball.eventMode = "none";
  group.addChild(ball);

  drawBallGraphics(ball, "footballSmall");
  parent.addChild(group);

  return {
    setBallPosition: (worldX, worldY) => {
      group.position.set(worldX, worldY);
    },
    setVisible: (visible) => {
      group.visible = visible;
    },
    setBallType: (ballType) => {
      drawBallGraphics(ball, ballType);
    },
    setInteractive: (enabled, hitRadius) => {
      if (enabled) {
        group.eventMode = "static";
        group.hitArea = new Circle(0, 0, hitRadius);
        group.cursor = "grab";
      } else {
        group.eventMode = "none";
        group.hitArea = null;
        group.cursor = "default";
      }
    },
    setOnPointerDown: (handler) => {
      group.removeAllListeners("pointerdown");
      if (handler) {
        group.on("pointerdown", (event) => handler(event));
      }
    },
    destroy: () => {
      group.destroy({ children: true });
    },
  };
}
