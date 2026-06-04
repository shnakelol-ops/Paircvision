import { Container, Graphics } from "pixi.js";
import type { BallType } from "../shell/types";

const BALL_RADIUS_SMALL = 2.3;
const BALL_RADIUS_MEDIUM = 3.1;

export type BallLayerHandle = {
  setBallPosition: (worldX: number, worldY: number) => void;
  setVisible: (visible: boolean) => void;
  setBallType: (ballType: BallType) => void;
  destroy: () => void;
};

function ballRadius(ballType: BallType): number {
  return ballType.endsWith("Medium") ? BALL_RADIUS_MEDIUM : BALL_RADIUS_SMALL;
}

function drawBallGraphics(ball: Graphics, shadow: Graphics, ballType: BallType): void {
  const r = ballRadius(ballType);
  const isSliotar = ballType.startsWith("sliotar");

  shadow.clear();
  shadow.ellipse(0.4, r * 0.88, r * 0.96, r * 0.34).fill({ color: 0x000000, alpha: 0.28 });

  ball.clear();
  if (isSliotar) {
    ball.circle(0, 0, r).fill({ color: 0xfacc15 });
    ball.circle(-r * 0.3, -r * 0.28, r * 0.27).fill({ color: 0xffffff, alpha: 0.45 });
    ball.circle(0, 0, r).stroke({ color: 0x6d5a1f, width: 0.35, alpha: 0.8 });
  } else {
    ball.circle(0, 0, r).fill({ color: 0xf0e6c6 });
    ball.circle(-r * 0.3, -r * 0.28, r * 0.27).fill({ color: 0xffffff, alpha: 0.62 });
    ball.circle(0, 0, r).stroke({ color: 0xa09070, width: 0.32, alpha: 0.7 });
  }
}

export function createBallLayer(parent: Container): BallLayerHandle {
  const group = new Container();
  group.eventMode = "none";
  group.visible = false;

  const shadow = new Graphics();
  const ball = new Graphics();
  group.addChild(shadow);
  group.addChild(ball);

  drawBallGraphics(ball, shadow, "footballSmall");
  parent.addChild(group);

  return {
    setBallPosition: (worldX, worldY) => {
      group.position.set(worldX, worldY);
    },
    setVisible: (visible) => {
      group.visible = visible;
    },
    setBallType: (ballType) => {
      drawBallGraphics(ball, shadow, ballType);
    },
    destroy: () => {
      group.destroy({ children: true });
    },
  };
}
