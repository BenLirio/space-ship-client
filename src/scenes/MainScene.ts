import Phaser from "phaser";
import {
  preloadShip,
  createShipSprite,
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
  getProjectiles,
} from "../clientState";
import { RemoteShipSnapshot, ProjectileSnapshot } from "../types/state";

export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private baseSpeed = 420; // still used for joystick -> input magnitude (not local movement)
  private inputState!: ArcadeInput;
  private joystick?: VirtualJoystick;
  private fireButton?: VirtualFireButton;
  protected remoteSprites = new Map<
    string,
    Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  >();
  // Projectiles now rendered as 1px red X (Image objects) for precise origin debugging
  private projectileSprites = new Map<string, Phaser.GameObjects.Image>();
  // For dead-reckoning between snapshots
  private lastProjectileSync = 0;
  private static readonly MAX_PROJECTILES_RENDERED = 500; // safety cap
  private unsubscribe?: () => void;
  private grid?: Phaser.GameObjects.TileSprite;
  private syncing = false;
  private pendingSync = false;
  private resizeListenerBound = false;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  // Per-ship health bars (HUD in world space)
  protected healthBars = new Map<string, Phaser.GameObjects.Container>();
  // Off-screen ship indicators (HUD)
  protected offscreenIndicators = new Map<
    string,
    Phaser.GameObjects.Container
  >();

  constructor() {
    super("main");
  }

  preload() {
    preloadShip(this);
  }

  create(data: { shipTexture?: string; shipImageUrl?: string }) {
    // Background grid first so it's behind everything
    this.createBackgroundGrid();
    // HUD textures
    this.ensureIndicatorTexture();
    // Allow multiple simultaneous touch points (joystick + fire button, etc.)
    // By default Phaser only tracks a single active pointer. Add a few extras.
    this.input.addPointer(3); // mouse/primary + 3 more = up to 4 concurrent touches
    this.cursors = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    // Include S so backward / reverse input can be transmitted to server
    const extraKeys = kb.addKeys({ W: "W", A: "A", S: "S", D: "D" }) as Record<
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
    // Update off-screen ship indicators (HUD)
    this.updateOffscreenIndicators();
    // Keep health bars aligned to ship sprites every frame (cheap)
    this.positionHealthBars();
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
    captureKey(extra.S, "S");
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

    // Dead-reckon projectiles (client-side extrapolation until next snapshot)
    this.extrapolateProjectiles(delta);
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
          // Remove any indicator associated with this ship
          const ind = this.offscreenIndicators.get(id);
          if (ind) {
            ind.destroy(true);
            this.offscreenIndicators.delete(id);
          }
          // Remove health bar
          const hb = this.healthBars.get(id);
          if (hb) {
            hb.destroy(true);
            this.healthBars.delete(id);
          }
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
          this.remoteSprites.set(id, sprite);
          // Ensure health bar exists for this ship
          this.getOrCreateHealthBar(id);
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
        this.refreshHealthBar(
          id,
          sprite,
          typeof snap.health === "number" ? snap.health : 100,
          typeof snap.kills === "number" ? snap.kills : 0
        );

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
    const snapshots = getProjectiles();
    const allIds = Object.keys(snapshots);
    // Ensure the projectile texture exists: a small white ball (~5px radius)
    const projectileTexKey = "projectile-ball";
    if (!this.textures.exists(projectileTexKey)) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.clear();
      const radius = 5; // px
      const diameter = radius * 2;
      // Slightly larger transparent canvas to avoid clipping antialias edge
      g.fillStyle(0xffffff, 1);
      g.fillCircle(radius, radius, radius);
      g.generateTexture(projectileTexKey, diameter, diameter);
      g.destroy();
    }
    // Performance cap: choose most recent (by createdAt) if over cap
    const ids = new Set(
      allIds
        .map((id) => ({
          id,
          createdAt: (snapshots as any)[id]?.createdAt || 0,
        }))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MainScene.MAX_PROJECTILES_RENDERED)
        .map((o) => o.id)
    );
    // Remove stale
    for (const [id, arc] of this.projectileSprites) {
      if (!ids.has(id)) {
        arc.destroy();
        this.projectileSprites.delete(id);
      }
    }
    // Add/update
    for (const id of ids) {
      const p: ProjectileSnapshot | undefined = (snapshots as any)[id];
      if (!p) continue;
      let img = this.projectileSprites.get(id);
      if (!img) {
        img = this.add.image(p.position.x, p.position.y, projectileTexKey);
        img.setOrigin(0.5, 0.5);
        img.setData("projectileId", id);
        img.setDepth(50); // above ships
        this.projectileSprites.set(id, img);
      }
      img.x = p.position.x;
      img.y = p.position.y;
    }
    this.lastProjectileSync = performance.now();
  }

  private extrapolateProjectiles(delta: number) {
    if (!this.projectileSprites.size) return;
    const snapshots = getProjectiles();
    const dt = delta / 1000;
    const now = performance.now();
    for (const [id, arc] of this.projectileSprites) {
      const snap = snapshots[id];
      if (!snap) continue; // will be cleaned up on next sync
      // Simple dead-reckoning: pos += velocity * dt
      arc.x += snap.velocity.x * dt;
      arc.y += snap.velocity.y * dt;
      // Optional lifetime fade (3s window)
      const age = Date.now() - snap.createdAt;
      const life = 3000;
      if (age > life) {
        // If server still keeps it longer, just clamp alpha never negative
        arc.setAlpha(0.05);
      } else {
        const alpha = 1 - age / life;
        arc.setAlpha(Phaser.Math.Clamp(alpha, 0.1, 1));
      }
      // Off-screen skip? We'll rely on Phaser culling implicitly; if desired we could hide.
      const cam = this.cameras.main;
      const view = cam.worldView; // Rectangle
      const margin = 40; // small margin so they pop in gracefully
      const inView =
        arc.x >= view.x - margin &&
        arc.x <= view.right + margin &&
        arc.y >= view.y - margin &&
        arc.y <= view.bottom + margin;
      arc.setVisible(inView);
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
    // Destroy HUD indicators
    for (const [, c] of this.offscreenIndicators) c.destroy(true);
    this.offscreenIndicators.clear();
    // Destroy health bars
    for (const [, c] of this.healthBars) c.destroy(true);
    this.healthBars.clear();
  }
}

// --- HUD: Off-screen indicators ---
declare global {
  interface Window {}
}

export interface IndicatorParts {
  container: Phaser.GameObjects.Container;
  arrow: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
}

// Augment MainScene with helper methods
export interface MainScene {
  ensureIndicatorTexture(): void;
  getOrCreateIndicator(id: string): IndicatorParts;
  updateOffscreenIndicators(): void;
  formatDistance(meters: number): string;
  // Health bar helpers
  getOrCreateHealthBar(id: string): HealthBarParts;
  refreshHealthBar(
    id: string,
    sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    health: number,
    kills: number
  ): void;
  positionHealthBars(): void;
}

MainScene.prototype.ensureIndicatorTexture = function ensureIndicatorTexture(
  this: MainScene
) {
  const key = "indicator-triangle";
  if (this.textures.exists(key)) return;
  const w = 24;
  const h = 16;
  const g = this.make.graphics({ x: 0, y: 0 });
  g.clear();
  // Soft white triangle with thin darker outline for contrast
  g.lineStyle(2, 0x263238, 0.9);
  g.fillStyle(0xffffff, 0.95);
  // Triangle pointing to the right in local texture space
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(w, h / 2);
  g.lineTo(0, h);
  g.closePath();
  g.fillPath();
  g.strokePath();
  g.generateTexture(key, w + 2, h + 2);
  g.destroy();
};

MainScene.prototype.getOrCreateIndicator = function getOrCreateIndicator(
  this: MainScene,
  id: string
): IndicatorParts {
  let container = this.offscreenIndicators.get(id);
  if (container) {
    const children = container.list as any[];
    const arrow = children.find(
      (c) => c.getData && c.getData("kind") === "arrow"
    ) as Phaser.GameObjects.Image;
    const label = children.find(
      (c) => c.getData && c.getData("kind") === "label"
    ) as Phaser.GameObjects.Text;
    return { container, arrow, label };
  }
  const c = this.add.container(0, 0);
  c.setScrollFactor(0);
  c.setDepth(1000);
  const arrow = this.add.image(0, 0, "indicator-triangle");
  arrow.setOrigin(0.5, 0.5);
  arrow.setData("kind", "arrow");
  const label = this.add.text(0, 14, "", {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#ffffff",
    stroke: "#000000",
    strokeThickness: 3,
  });
  label.setOrigin(0.5, 0);
  label.setData("kind", "label");
  label.setVisible(false);
  c.add([arrow, label]);
  this.offscreenIndicators.set(id, c);
  return { container: c, arrow, label };
};

MainScene.prototype.updateOffscreenIndicators =
  function updateOffscreenIndicators(this: MainScene) {
    const cam = this.cameras.main;
    const clientId = getClientId();
    const halfW = cam.width / 2;
    const halfH = cam.height / 2;
    const margin = 28; // keep slightly inside the viewport
    const centerX = halfW;
    const centerY = halfH;

    // Build a set of ids we saw this frame (off-screen only)
    const active = new Set<string>();

    for (const [id, sprite] of this.remoteSprites) {
      if (id === clientId) continue; // don't show indicator for our own ship
      const dxWorld = sprite.x - cam.midPoint.x;
      const dyWorld = sprite.y - cam.midPoint.y;
      const sx = dxWorld * cam.zoom;
      const sy = dyWorld * cam.zoom;
      const absX = Math.abs(sx);
      const absY = Math.abs(sy);
      const insideX = absX <= halfW - margin;
      const insideY = absY <= halfH - margin;

      if (insideX && insideY) {
        // On-screen: hide/destroy indicator if exists
        const cont = this.offscreenIndicators.get(id);
        if (cont) cont.setVisible(false);
        continue;
      }

      // Off-screen: compute intersection point with screen rectangle
      const denom = Math.max(absX / (halfW - margin), absY / (halfH - margin));
      if (denom === 0) {
        const cont = this.offscreenIndicators.get(id);
        if (cont) cont.setVisible(false);
        continue;
      }
      const nx = sx / denom; // clamped to edge in screen space
      const ny = sy / denom;
      const screenX = centerX + nx;
      const screenY = centerY + ny;

      const { container, arrow, label } = this.getOrCreateIndicator(id);
      container.setVisible(true);
      container.setPosition(Math.round(screenX), Math.round(screenY));
      // Point arrow towards the ship
      const angle = Math.atan2(sy, sx);
      arrow.setRotation(angle);
      // Distance in world units -> scale arrow size (closer = bigger)
      const dist = Math.hypot(dxWorld, dyWorld);
      const minScale = 0.6;
      const maxScale = 1.8;
      const near = 300; // px: distance at which indicator is largest
      const far = 4000; // px: distance at which indicator is smallest
      const t = Phaser.Math.Clamp((dist - near) / (far - near), 0, 1);
      const scale = maxScale - t * (maxScale - minScale);
      arrow.setScale(scale);
      // Hide text label (we use size as distance cue now)
      label.setVisible(false);

      active.add(id);
    }

    // Hide any indicators that weren't active this frame
    for (const [id, cont] of this.offscreenIndicators) {
      if (!active.has(id)) cont.setVisible(false);
    }
  };

MainScene.prototype.formatDistance = function formatDistance(
  this: MainScene,
  meters: number
): string {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + " km";
  return Math.round(meters) + " m";
};

// --- HUD: Health Bars ---
export interface HealthBarParts {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  fg: Phaser.GameObjects.Rectangle;
  kills: Phaser.GameObjects.Text;
}

MainScene.prototype.getOrCreateHealthBar = function getOrCreateHealthBar(
  this: MainScene,
  id: string
): HealthBarParts {
  let container = this.healthBars.get(id);
  if (container) {
    const children = container.list as any[];
    const bg = children.find(
      (c) => c.getData && c.getData("kind") === "hb-bg"
    ) as Phaser.GameObjects.Rectangle;
    const fg = children.find(
      (c) => c.getData && c.getData("kind") === "hb-fg"
    ) as Phaser.GameObjects.Rectangle;
    const kills = children.find(
      (c) => c.getData && c.getData("kind") === "hb-kills"
    ) as Phaser.GameObjects.Text;
    return { container, bg, fg, kills };
  }
  const c = this.add.container(0, 0);
  c.setDepth(200); // above ships
  const bg = this.add.rectangle(0, 0, 60, 6, 0x111111, 0.75);
  bg.setOrigin(0.5, 0.5);
  bg.setData("kind", "hb-bg");
  const fg = this.add.rectangle(-30, 0, 60, 6, 0x00ff00, 0.95);
  fg.setOrigin(0, 0.5); // left-aligned
  fg.setData("kind", "hb-fg");
  // Kills label (monospace, outlined)
  const kills = this.add.text(0, -8, "0", {
    fontFamily: "monospace",
    fontSize: "12px",
    color: "#ffffff",
    stroke: "#000000",
    strokeThickness: 3,
  });
  kills.setOrigin(0.5, 1); // centered above bar
  kills.setData("kind", "hb-kills");
  c.add([bg, fg, kills]);
  this.healthBars.set(id, c);
  return { container: c, bg, fg, kills };
};

MainScene.prototype.refreshHealthBar = function refreshHealthBar(
  this: MainScene,
  id: string,
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  health: number,
  kills: number
) {
  const {
    container,
    bg,
    fg,
    kills: killsLabel,
  } = this.getOrCreateHealthBar(id);
  // Clamp
  const h = Phaser.Math.Clamp(health ?? 100, 0, 100);
  // Width scales with sprite size (min 48)
  const maxW = Math.max(48, Math.round(sprite.displayWidth || 60));
  const height = 6;
  bg.setSize(maxW, height);
  // Foreground width proportional to health
  const fgW = Math.max(0, Math.round((maxW * h) / 100));
  fg.setSize(fgW, height);
  // Ensure left align starting at -maxW/2
  fg.x = -maxW / 2;
  bg.x = 0;
  // Color gradient red->green
  const t = h / 100;
  const r = Math.round(255 * (1 - t));
  const g = Math.round(255 * t);
  const color = (r << 16) | (g << 8) | 0;
  fg.setFillStyle(color, 0.95);
  // Position above the sprite
  const offsetY = -(sprite.displayHeight || 80) * 0.65;
  container.setPosition(sprite.x, sprite.y + offsetY);
  container.setVisible(true);
  container.setDepth(sprite.depth + 1);
  // Update kills label text and position just above the bar
  const k = Math.max(0, Math.floor(kills ?? 0));
  killsLabel.setText(String(k));
  killsLabel.x = 0; // centered
  killsLabel.y = -8; // relative to container center
};

MainScene.prototype.positionHealthBars = function positionHealthBars(
  this: MainScene
) {
  for (const [id, c] of this.healthBars) {
    const sprite = this.remoteSprites.get(id);
    if (!sprite || !sprite.active) {
      c.setVisible(false);
      continue;
    }
    const offsetY = -(sprite.displayHeight || 80) * 0.65;
    c.setPosition(sprite.x, sprite.y + offsetY);
    c.setDepth(sprite.depth + 1);
    c.setVisible(true);
  }
};
