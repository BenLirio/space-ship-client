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
import { VirtualFireButton } from "../mobile/VirtualFireButton";
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
  private fireButton?: VirtualFireButton;
  private remoteSprites = new Map<
    string,
    Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  >();
  private unsubscribe?: () => void;
  private grid?: Phaser.GameObjects.TileSprite;
  private syncing = false;
  private pendingSync = false;
  private resizeListenerBound = false;
  private spaceKey?: Phaser.Input.Keyboard.Key;

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
    // Add SPACE key separately (not part of Phaser's built-in CursorKeys set)
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

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

    // Resize/orientation handling
    this.scale.on("resize", () => {
      this.resizeGrid();
      this.maybeToggleJoystick();
      this.positionJoystick();
      this.positionFireButton();
    });
    window.addEventListener("orientationchange", this.handleOrientationChange);
    this.resizeListenerBound = true;

    // Initial joystick decision
    this.maybeToggleJoystick();
    this.positionJoystick();
    this.positionFireButton();

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
    // Space (fire / action)
    captureKey(this.spaceKey, "SPACE");
    let jx = 0;
    let jy = 0;
    if (this.joystick && this.joystick.active) {
      const angle = this.joystick.angle;
      const strength = this.joystick.strength;
      jx = Math.cos(angle) * strength;
      jy = Math.sin(angle) * strength;
    }
    // Inject SPACE when fire button pressed (mobile) before snapshot capture
    if (this.fireButton?.active) {
      keysDown.add("SPACE");
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

  private positionFireButton() {
    if (!this.fireButton) return;
    const padding = 90;
    this.fireButton.setPosition(
      this.scale.width - padding,
      this.scale.height - padding
    );
  }

  private handleOrientationChange = () => {
    // Delay a tick so innerWidth/Height settle
    setTimeout(() => {
      this.maybeToggleJoystick();
      this.positionJoystick();
      this.positionFireButton();
    }, 60);
  };

  private shouldShowJoystick(): boolean {
    const isTouch = this.sys.game.device.input.touch;
    if (!isTouch) return false; // never show if no touch capability
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isSmallViewport = w <= 1100 || h <= 800; // treat large desktop touch screens as desktop
    const ua = navigator.userAgent.toLowerCase();
    const mobileUA =
      /iphone|ipad|ipod|android|mobile|silk|kindle|playbook/.test(ua);
    return isTouch && (mobileUA || isSmallViewport);
  }

  private maybeToggleJoystick() {
    const want = this.shouldShowJoystick();
    if (want && !this.joystick) {
      this.joystick = new VirtualJoystick(this, 90, this.scale.height - 90, 80);
      this.fireButton = new VirtualFireButton(
        this,
        this.scale.width - 90,
        this.scale.height - 90,
        70
      );
    } else if (!want && this.joystick) {
      this.joystick.destroy();
      this.joystick = undefined;
      if (this.fireButton) {
        this.fireButton.destroy();
        this.fireButton = undefined;
      }
    }
  }

  private createBackgroundGrid() {
    const cell = SHIP_TARGET_MAX_SIZE * 4; // cell size ~4x ship length
    const patternKey = "grid-pattern";
    if (!this.textures.exists(patternKey)) {
      // Create an off-screen graphics object to draw a single cell pattern
      const g = this.make.graphics({ x: 0, y: 0 });
      // Softer "pre-blurred" grid: draw two adjacent 1px bands with descending alpha
      // to reduce high-frequency shimmer when camera scrolls sub-pixel.
      const lineColor = 0x758089; // slightly lighter
      g.clear();
      // Horizontal (top) band: y=0 stronger, y=1 lighter
      g.fillStyle(lineColor, 0.55);
      g.fillRect(0, 0, cell, 1);
      g.fillStyle(lineColor, 0.25);
      g.fillRect(0, 1, cell, 1);
      // Vertical (left) band: x=0 stronger, x=1 lighter
      g.fillStyle(lineColor, 0.55);
      g.fillRect(0, 0, 1, cell);
      g.fillStyle(lineColor, 0.25);
      g.fillRect(1, 0, 1, cell);
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
    // Snap to integer pixels to reduce sub-pixel aliasing shimmer
    this.grid.setTilePosition(Math.round(cam.scrollX), Math.round(cam.scrollY));
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
    if (this.resizeListenerBound) {
      window.removeEventListener(
        "orientationchange",
        this.handleOrientationChange
      );
      this.resizeListenerBound = false;
    }
    if (this.joystick) {
      this.joystick.destroy();
      this.joystick = undefined;
    }
    if (this.fireButton) {
      this.fireButton.destroy();
      this.fireButton = undefined;
    }
  }
}
