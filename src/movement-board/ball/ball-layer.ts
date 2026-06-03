import { Container, Graphics } from "pixi.js";

const BALL_RADIUS = 2.3;

export type BallLayerHandle = {
  setBallPosition: (worldX: number, worldY: number) => void;
  setVisible: (visible: boolean) => void;
  destroy: () => void;
};

export function createBallLayer(parent: Container): BallLayerHandle {
  const group = new Container();
  group.eventMode = "none";
  group.visible = false;

  const shadow = new Graphics();
  shadow
    .ellipse(0.4, BALL_RADIUS * 0.88, BALL_RADIUS * 0.96, BALL_RADIUS * 0.34)
    .fill({ color: 0x000000, alpha: 0.28 });
  group.addChild(shadow);

  const ball = new Graphics();
  ball
    .circle(0, 0, BALL_RADIUS)
    .fill({ color: 0xf0e6c6 });
  ball
    .circle(-BALL_RADIUS * 0.3, -BALL_RADIUS * 0.28, BALL_RADIUS * 0.27)
    .fill({ color: 0xffffff, alpha: 0.62 });
  ball
    .circle(0, 0, BALL_RADIUS)
    .stroke({ color: 0xa09070, width: 0.32, alpha: 0.7 });
  group.addChild(ball);

  parent.addChild(group);

  return {
    setBallPosition: (worldX, worldY) => {
      group.position.set(worldX, worldY);
    },
    setVisible: (visible) => {
      group.visible = visible;
    },
    destroy: () => {
      group.destroy({ children: true });
    },
  };
}
