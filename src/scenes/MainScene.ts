import Phaser from "phaser";
import {
  preloadShip,
  createShipSprite,
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
  setLocalShipImageUrl,
  setInputSnapshot,
} from "../clientState";
import { RemoteShipSnapshot } from "../types/state";

export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private baseSpeed = 420; // still used for joystick -> input magnitude (not local movement)
  private inputState!: ArcadeInput;
  private joystick?: VirtualJoystick;
  private remoteSprites = new Map<
    string,
    Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  >();
  private unsubscribe?: () => void;
  private grid?: Phaser.GameObjects.TileSprite;
  private idText?: Phaser.GameObjects.Text;
  private syncing = false;
  private pendingSync = false;

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

    // We no longer create / simulate a local-authority ship. We'll wait for the
    // server snapshot (which now also includes our own ship) and spawn it there.
    // (Optional placeholder could be added here if desired.)
    if (data?.shipImageUrl) {
      setLocalShipImageUrl(data.shipImageUrl);
    }

    // Only need to reposition joystick on resize now (no wrapping in infinite space)
    this.scale.on("resize", () => {
      this.positionJoystick();
      this.resizeGrid();
      this.positionIdText();
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
    // Hard follow (no interpolation) will be done manually in update each frame.
    this.cameras.main.setZoom(1); // Adjust if you want closer (e.g., 1.2) or farther (e.g., 0.8).

    // Debug ID overlay (top-right)
    this.idText = this.add
      .text(0, 0, "id: (pending)", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#9cf",
        stroke: "#000",
        strokeThickness: 2,
      })
      .setScrollFactor(0)
      .setDepth(1000)
      .setOrigin(1, 0);
    this.positionIdText();
    this.updateIdOverlay();
  }

  update(time: number, delta: number) {
    this.updateGridScroll();
    // Hard follow: center camera exactly on player's ship each frame (no smoothing/interp)
    const id = getClientId();
    if (id) {
      const mySprite = this.remoteSprites.get(id);
      if (mySprite) {
        this.cameras.main.centerOn(mySprite.x, mySprite.y);
      }
    }
    // Keep ID overlay updated (cheap)
    this.updateIdOverlay();
    // Build and publish InputSnapshot every frame (client only sends inputs now)
    const keysDown = new Set<string>();
    const captureKey = (k?: Phaser.Input.Keyboard.Key, name?: string) => {
      if (k && k.isDown && name) keysDown.add(name);
    };
    const c = this.cursors;
    captureKey(c.up, "ArrowUp");
    captureKey(c.down, "ArrowDown");
    captureKey(c.left, "ArrowLeft");
    captureKey(c.right, "ArrowRight");
    const extra = (this.inputState?.keys || {}) as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    captureKey(extra.W, "W");
    captureKey(extra.A, "A");
    captureKey(extra.D, "D");
    let jx = 0;
    let jy = 0;
    if (this.joystick && this.joystick.active) {
      const angle = this.joystick.angle;
      const strength = this.joystick.strength;
      jx = Math.cos(angle) * strength;
      jy = Math.sin(angle) * strength;
    }
    setInputSnapshot({ keysDown, joystick: { x: jx, y: jy } });
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

  private positionIdText() {
    if (!this.idText) return;
    this.idText.setPosition(this.scale.width - 12, 8);
  }

  private updateIdOverlay() {
    if (!this.idText) return;
    const id = getClientId();
    this.idText.setText("id: " + (id || "(pending)"));
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
    if (this.syncing) {
      this.pendingSync = true;
      return;
    }
    this.syncing = true;
    try {
      const clientId = getClientId();
      const snapshots = getRemoteShips();
      const wantedIds = new Set(Object.keys(snapshots));

      // Remove sprites no longer present
      for (const [id, sprite] of this.remoteSprites) {
        if (!wantedIds.has(id)) {
          sprite.destroy();
          this.remoteSprites.delete(id);
        }
      }

      // Add/update sprites (including our own)
      for (const id of wantedIds) {
        const snap: RemoteShipSnapshot | undefined = (snapshots as any)[id];
        if (!snap) continue;
        let sprite = this.remoteSprites.get(id);
        const desiredTexKey = await this.ensureTextureFor(
          snap.appearance?.shipImageUrl
        );

        if (!sprite) {
          // Double-check after await to avoid race duplicates
          sprite = this.remoteSprites.get(id);
        }
        if (!sprite) {
          sprite = createShipSprite(
            this,
            snap.physics.position.x,
            snap.physics.position.y,
            desiredTexKey
          );
          sprite.setData("shipId", id);
          applyStandardShipScale(sprite);
          this.remoteSprites.set(id, sprite);
        } else {
          // Update texture if changed
          if (sprite.texture.key !== desiredTexKey) {
            sprite.setTexture(desiredTexKey);
            applyStandardShipScale(sprite);
          }
        }
        // Server-authoritative transform
        sprite.x = snap.physics.position.x;
        sprite.y = snap.physics.position.y;
        sprite.rotation = snap.physics.rotation;

        // No smooth follow attachment needed; camera centers on player each update.
      }

      // Cleanup any stray untracked duplicates (safety net)
      this.children.list.forEach((obj) => {
        const go = obj as any;
        if (go?.getData && go.getData("shipId")) {
          const id: string = go.getData("shipId");
          if (!this.remoteSprites.has(id)) {
            go.destroy();
          }
        }
      });
    } finally {
      this.syncing = false;
      if (this.pendingSync) {
        this.pendingSync = false;
        // run again with latest state
        this.syncRemoteShips();
      }
    }
  }

  shutdown() {
    if (this.unsubscribe) this.unsubscribe();
  }
}
