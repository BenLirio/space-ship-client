import Phaser from "phaser";
import {
  preloadShip,
  createShipSprite,
  updateShip,
  ArcadeInput,
  loadExternalShipTexture,
  applyStandardShipScale,
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
      this.scale.height / 2,
      "ship"
    );

    this.scale.on("resize", () => {
      // Keep ship within bounds after resize
      this.wrapSprite(this.ship);
    });

    this.setupExternalShipLoader();
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

  private setupExternalShipLoader() {
    const input = document.getElementById(
      "ship-url"
    ) as HTMLInputElement | null;
    const btn = document.getElementById(
      "load-ship-btn"
    ) as HTMLButtonElement | null;
    if (!input || !btn) return;
    const debug = document.getElementById("debug");
    const loadHandler = async () => {
      const url = input.value.trim();
      if (!url || !url.toLowerCase().endsWith(".png")) {
        debug && (debug.textContent = "Provide a direct .png URL");
        return;
      }
      debug && (debug.textContent = "Loading ship texture...");
      try {
        const key = await loadExternalShipTexture(this, url);
        // Swap texture (preserve position & rotation)
        this.ship.setTexture(key);
        applyStandardShipScale(this.ship);
        debug && (debug.textContent = "Loaded custom ship!");
      } catch (e: any) {
        debug && (debug.textContent = e.message || "Load failed");
      }
    };
    btn.addEventListener("click", loadHandler);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        loadHandler();
      }
    });
  }
}
