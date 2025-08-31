import Phaser from "phaser";
import {
  preloadShip,
  createShipSprite,
  updateShip,
  ArcadeInput,
  applyStandardShipScale,
} from "../ship/ship";
import { VirtualJoystick } from "../mobile/VirtualJoystick";
import {
  subscribe,
  getRemoteShips,
  getClientId,
  RemoteShipSnapshot,
} from "../clientState";

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

  constructor() {
    super("main");
  }

  preload() {
    preloadShip(this);
  }

  create(data: { shipTexture?: string }) {
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

    this.scale.on("resize", () => {
      this.wrapSprite(this.ship);
      this.positionJoystick();
    });

    if (this.sys.game.device.input.touch) {
      this.joystick = new VirtualJoystick(this, 90, this.scale.height - 90, 80);
    }
    this.positionJoystick();

    // No external loader panel in new flow.

    // Subscribe to remote ship updates
    this.unsubscribe = subscribe(() => this.syncRemoteShips());
    this.syncRemoteShips(); // initial
  }

  update(time: number, delta: number) {
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
      this.constrainToScreen(this.ship);
    } else {
      // Damp movement while controls suppressed for predictability
      this.ship.body.velocity.scale(0.9);
    }
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

  private areControlsSuppressed() {
    return false;
  }
  private positionJoystick() {
    if (!this.joystick) return;
    // Instead of destroying (which drops active touch) just move center.
    this.joystick.setCenter(90, this.scale.height - 90);
  }

  private async ensureTextureFor(url?: string) {
    if (!url) return "ship"; // fallback
    // Derive a deterministic key from URL
    const key = "remote-" + btoa(url).replace(/=+$/g, "");
    if (this.textures.exists(key)) return key;
    return await new Promise<string>((resolve, reject) => {
      this.load.image(key, url);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (this.textures.exists(key)) resolve(key);
        else reject(new Error("texture missing after load"));
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
        sprite.setTint(0x66ccff); // differentiate remote ships
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
