import Phaser from "phaser";
import { preloadShip, createShipSprite } from "../ship/ship";
import { makeNearBlackTransparent } from "../ship/ship";
import { VirtualJoystick } from "../mobile/VirtualJoystick";
import { VirtualFireButton } from "../mobile/VirtualFireButton";
import {
  subscribe,
  getRemoteShips,
  getClientId,
  setInputSnapshot,
  getProjectiles,
} from "../clientState";
import { RemoteShipSnapshot } from "../types/state";

// Extracted helpers
import { BackgroundGrid } from "./main/BackgroundGrid";
import { OffscreenIndicators } from "./main/OffscreenIndicators";
import { HealthBarManager } from "./main/HealthBarManager";
import { ProjectileRenderer } from "./main/ProjectileRenderer";

export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private inputKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick?: VirtualJoystick;
  private fireButton?: VirtualFireButton;
  protected remoteSprites = new Map<
    string,
    Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  >();
  private unsubscribe?: () => void;
  private grid?: BackgroundGrid;
  private syncing = false;
  private pendingSync = false;
  private resizeListenerBound = false;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  // HUD managers
  private indicators!: OffscreenIndicators;
  private healthBars!: HealthBarManager;
  private projectiles!: ProjectileRenderer;

  constructor() {
    super("main");
  }

  preload() {
    preloadShip(this);
  }

  create() {
    // Background grid first so it's behind everything
    this.grid = new BackgroundGrid(this);
    // HUD managers
    this.indicators = new OffscreenIndicators(this);
    this.healthBars = new HealthBarManager(this);
    this.projectiles = new ProjectileRenderer(this);
    // Allow multiple simultaneous touch points
    this.input.addPointer(3); // mouse/primary + 3 more = up to 4 concurrent touches
    this.cursors = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    // Include S so backward / reverse input can be transmitted to server
    this.inputKeys = kb.addKeys({ W: "W", A: "A", S: "S", D: "D" }) as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    // Add SPACE key separately (not part of Phaser's built-in CursorKeys set)
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

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

    // Subscribe to remote ship updates

    this.unsubscribe = subscribe(() => this.syncRemoteShips());
    this.syncRemoteShips(); // initial

    // Expansive world & camera follow
    const HUGE = 10_000_000; // 10 million px each direction (arbitrary large)
    this.physics.world.setBounds(-HUGE, -HUGE, HUGE * 2, HUGE * 2);
    // Hard follow (no interpolation) will be done manually in update each frame.
    this.cameras.main.setZoom(1); // Adjust if you want closer (e.g., 1.2) or farther (e.g., 0.8).
  }

  update(time: number, delta: number) {
    this.grid?.updateScroll();
    // Hard follow: center camera exactly on player's ship each frame (no smoothing/interp)
    const id = getClientId();
    if (id) {
      const mySprite = this.remoteSprites.get(id);
      if (mySprite) {
        this.cameras.main.centerOn(mySprite.x, mySprite.y);
      }
    }
    // Update off-screen ship indicators (HUD)
    this.indicators.update(this.remoteSprites, getRemoteShips(), id);
    // Keep health bars aligned to ship sprites every frame (cheap)
    this.healthBars.positionAll(this.remoteSprites);
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
    captureKey(this.inputKeys?.W, "W");
    captureKey(this.inputKeys?.A, "A");
    captureKey(this.inputKeys?.S, "S");
    captureKey(this.inputKeys?.D, "D");
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

    // Dead-reckon projectiles (client-side extrapolation until next snapshot)
    this.projectiles.extrapolate(delta, getProjectiles());
  }

  // Wrapping removed: movement is unbounded.
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

  private resizeGrid() {
    this.grid?.resize();
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
          // Remove any indicator associated with this ship
          // Remove HUD for this ship
          this.indicators.destroyFor(id);
          this.healthBars.destroyFor(id);
        }
      }

      // Add/update sprites (including our own)
      for (const id of wantedIds) {
        const snap: RemoteShipSnapshot | undefined = (snapshots as any)[id];
        if (!snap) continue;
        let sprite = this.remoteSprites.get(id);
        const desiredTexKey = await this.ensureTextureFor(
          snap.appearance.shipImageUrl
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
          this.remoteSprites.set(id, sprite);
          // Ensure health bar exists for this ship
          this.healthBars.getOrCreate(id);
        } else {
          // Update texture if changed
          if (sprite.texture.key !== desiredTexKey) {
            sprite.setTexture(desiredTexKey);
          }
        }
        // Server-authoritative transform
        sprite.x = snap.physics.position.x;
        sprite.y = snap.physics.position.y;
        sprite.rotation = snap.physics.rotation;

        // Update health bar visuals
        this.healthBars.refresh(id, sprite, snap.health, snap.kills, snap.name);

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

      // After ship sync, also sync projectiles (ships may influence styling)
      this.syncProjectiles();
    } finally {
      this.syncing = false;
      if (this.pendingSync) {
        this.pendingSync = false;
        // run again with latest state
        this.syncRemoteShips();
      }
    }
  }

  private syncProjectiles() {
    this.projectiles.sync(getProjectiles());
  }

  // projectile extrapolation handled directly in update()

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
    this.indicators?.clear();
    this.healthBars?.clear();
    this.projectiles?.destroy();
  }
}
