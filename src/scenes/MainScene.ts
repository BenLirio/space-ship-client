import Phaser from "phaser";
import {
  preloadShip,
  createShipSprite,
  updateShip,
  ArcadeInput,
} from "../ship/ship";

export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private ship!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private baseSpeed = 420; // forward speed (pixels/sec)
  private boostMultiplier = 1.6; // shift boost
  private rotationSpeed = Phaser.Math.DegToRad(250); // A / E rotation speed
  private inputState!: ArcadeInput;

  constructor() {
    super("main");
  }

  preload() {
    preloadShip(this);
  }

  create() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    const extraKeys = kb.addKeys({
      W: "W",
      A: "A",
      D: "D",
      SHIFT: "SHIFT",
      SPACE: "SPACE",
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    this.inputState = {
      cursors: this.cursors, // kept for potential future use
      keys: extraKeys,
    };

    this.ship = createShipSprite(
      this,
      this.scale.width / 2,
      this.scale.height / 2
    );

    this.scale.on("resize", () => {
      // Keep ship within bounds after resize
      this.wrapSprite(this.ship);
    });
  }

  update(time: number, delta: number) {
    updateShip(
      this,
      this.ship,
      this.inputState,
      {
        baseSpeed: this.baseSpeed,
        boostMultiplier: this.boostMultiplier,
        rotationSpeed: this.rotationSpeed,
        dashSpeed: this.baseSpeed * 2.2,
        dashCooldownMs: 550,
      },
      delta
    );
    this.constrainToScreen(this.ship);
  }

  private constrainToScreen(sprite: Phaser.GameObjects.Sprite) {
    const padding = 16;
    const { width, height } = this.scale;
    if (sprite.x < -padding) sprite.x = width + padding;
    if (sprite.x > width + padding) sprite.x = -padding;
    if (sprite.y < -padding) sprite.y = height + padding;
    if (sprite.y > height + padding) sprite.y = -padding;
  }

  private wrapSprite(sprite: Phaser.GameObjects.Sprite) {
    this.constrainToScreen(sprite);
  }
}
