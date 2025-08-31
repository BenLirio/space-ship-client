import Phaser from "phaser";
import {
  preloadShip,
  createShipSprite,
  updateShip,
  applyStandardShipScale,
  SHIP_TARGET_MAX_SIZE,
} from "../ship/ship";
import { ArcadeInput } from "../types/ship";
import { makeNearBlackTransparent } from "../ship/ship";
import { VirtualJoystick } from "../mobile/VirtualJoystick";
import {
  subscribe,
  getRemoteShips,
  getClientId,
  setLocalShipAccessor,
  setLocalShipImageUrl,
} from "../clientState";
import { RemoteShipSnapshot } from "../types/state";

export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private ship!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private baseSpeed = 420; // forward speed (pixels/sec)
  private rotationSpeed = Phaser.Math.DegToRad(250); // A / D rotation speed
  private inputState!: ArcadeInput;
  private joystick?: VirtualJoystick;
  private remoteSprites = new Map<
    string,
    Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  >();
  private unsubscribe?: () => void;
  private grid?: Phaser.GameObjects.TileSprite;

  constructor() {
    super("main");
  }

  preload() {
    preloadShip(this);
  }

  create(data: { shipTexture?: string; shipImageUrl?: string }) {
    // Background grid first so it's behind everything
    this.createBackgroundGrid();
    this.cursors = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    const extraKeys = kb.addKeys({ W: "W", A: "A", D: "D" }) as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.inputState = {
      cursors: this.cursors, // kept for potential future use
      keys: extraKeys,
    };

    const textureKey =
      data?.shipTexture && this.textures.exists(data.shipTexture)
        ? data.shipTexture
        : "ship";
    this.ship = createShipSprite(
      this,
      this.scale.width / 2,
      this.scale.height / 2,
      textureKey
    );
    applyStandardShipScale(this.ship);

    // Register accessor for outbound state sync
    setLocalShipAccessor(() => ({
      position: { x: this.ship.x, y: this.ship.y },
      rotation: this.ship.rotation,
    }));
    if (data?.shipImageUrl) {
      setLocalShipImageUrl(data.shipImageUrl);
    }

    // Only need to reposition joystick on resize now (no wrapping in infinite space)
    this.scale.on("resize", () => {
      this.positionJoystick();
      this.resizeGrid();
    });

    if (this.sys.game.device.input.touch) {
      this.joystick = new VirtualJoystick(this, 90, this.scale.height - 90, 80);
    }
    this.positionJoystick();

    // No external loader panel in new flow.

    // Subscribe to remote ship updates
    this.unsubscribe = subscribe(() => this.syncRemoteShips());
    this.syncRemoteShips(); // initial

    // EXPANSIVE WORLD & CAMERA FOLLOW
    // Give the physics world extremely large bounds to simulate an "infinite" space.
    // (If later you want true dynamic expansion, you can watch ship position and enlarge as needed.)
    const HUGE = 10_000_000; // 10 million px each direction (arbitrary large)
    this.physics.world.setBounds(-HUGE, -HUGE, HUGE * 2, HUGE * 2);
    // Follow the player's ship with a smoothing factor.
    this.cameras.main.startFollow(this.ship, true, 0.15, 0.15);
    // Optional: set a modest zoom so ship isn't tiny when world is conceptually huge.
    this.cameras.main.setZoom(1); // Adjust if you want closer (e.g., 1.2) or farther (e.g., 0.8).
  }

  update(time: number, delta: number) {
    this.updateGridScroll();
    if (!this.areControlsSuppressed()) {
      if (!this.joystick || !this.joystick.active) {
        updateShip(
          this,
          this.ship,
          this.inputState,
          { baseSpeed: this.baseSpeed, rotationSpeed: this.rotationSpeed },
          delta
        );
      }
      if (this.joystick && this.joystick.active) {
        const angle = this.joystick.angle; // 0 is to the right
        this.ship.rotation = angle + Math.PI / 2;
        const speed = this.baseSpeed * this.joystick.strength;
        const forwardAngle = this.ship.rotation - Math.PI / 2;
        this.ship.body.velocity.x = Math.cos(forwardAngle) * speed;
        this.ship.body.velocity.y = Math.sin(forwardAngle) * speed;
      }
    } else {
      // Damp movement while controls suppressed for predictability
      this.ship.body.velocity.scale(0.9);
    }
  }

  // Wrapping removed: movement is unbounded. (Keep placeholder methods if future constraints needed.)

  private areControlsSuppressed() {
    return false;
  }
  private positionJoystick() {
    if (!this.joystick) return;
    // Instead of destroying (which drops active touch) just move center.
    this.joystick.setCenter(90, this.scale.height - 90);
  }

  private createBackgroundGrid() {
    const cell = SHIP_TARGET_MAX_SIZE * 4; // cell size ~4x ship length
    const patternKey = "grid-pattern";
    if (!this.textures.exists(patternKey)) {
      // Create an off-screen graphics object to draw a single cell pattern
      const g = this.make.graphics({ x: 0, y: 0 });
      const lineColor = 0x444444; // dark grey lines
      g.clear();
      g.lineStyle(1, lineColor, 0.5);
      // Draw top and left lines only for seamless tiling
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(cell, 0);
      g.moveTo(0, 0);
      g.lineTo(0, cell);
      g.strokePath();
      g.generateTexture(patternKey, cell, cell);
      g.destroy();
    }
    this.grid = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, patternKey)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-100); // behind everything
  }

  private resizeGrid() {
    if (!this.grid) return;
    this.grid.setSize(this.scale.width, this.scale.height);
  }

  private updateGridScroll() {
    if (!this.grid) return;
    const cam = this.cameras.main;
    // Move tile texture relative to camera scroll to anchor grid to world
    this.grid.setTilePosition(cam.scrollX, cam.scrollY);
  }

  private async ensureTextureFor(url?: string) {
    if (!url) return "ship"; // fallback
    // Derive a deterministic key from URL
    const key = "remote-" + btoa(url).replace(/=+$/g, "");
    if (this.textures.exists(key)) return key;
    return await new Promise<string>((resolve, reject) => {
      this.load.image(key, url);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.textures.exists(key)) {
          // Post process (black -> transparent & watermark removal)
          makeNearBlackTransparent(this, key, { clearWatermarkBox: true });
          resolve(key);
        } else reject(new Error("texture missing after load"));
      });
      this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
        resolve("ship"); // graceful fallback
      });
      this.load.start();
    });
  }

  private async syncRemoteShips() {
    const clientId = getClientId();
    const snapshots = getRemoteShips();
    const wantedIds = new Set(
      Object.keys(snapshots).filter((id) => id !== clientId)
    );

    // Remove sprites no longer present
    for (const [id, sprite] of this.remoteSprites) {
      if (!wantedIds.has(id)) {
        sprite.destroy();
        this.remoteSprites.delete(id);
      }
    }

    // Add/update sprites
    for (const id of wantedIds) {
      const snap: RemoteShipSnapshot | undefined = (snapshots as any)[id];
      if (!snap) continue;
      let sprite = this.remoteSprites.get(id);
      if (!sprite) {
        const texKey = await this.ensureTextureFor(
          snap.appearance?.shipImageUrl
        );
        sprite = createShipSprite(
          this,
          snap.physics.position.x,
          snap.physics.position.y,
          texKey
        );
        applyStandardShipScale(sprite);
        // Removed tint so remote ships show original colors
        this.remoteSprites.set(id, sprite);
      }
      // Update physics snapshot
      sprite.x = snap.physics.position.x;
      sprite.y = snap.physics.position.y;
      sprite.rotation = snap.physics.rotation;
    }
  }

  shutdown() {
    if (this.unsubscribe) this.unsubscribe();
  }
}
