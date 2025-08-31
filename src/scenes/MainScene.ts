import Phaser from "phaser";
import {
  preloadShip,
  createShipSprite,
  updateShip,
  ArcadeInput,
  applyStandardShipScale,
  loadExternalShipTexture,
} from "../ship/ship";
import { VirtualJoystick } from "../mobile/VirtualJoystick";
import type { GameState, ShipState } from "../types/game";

export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  // Local controllable ship (optional, if user started via splash prompt)
  private ship?: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private baseSpeed = 420; // forward speed (pixels/sec)
  private rotationSpeed = Phaser.Math.DegToRad(250); // A / D rotation speed
  private inputState!: ArcadeInput;
  private joystick?: VirtualJoystick;
  // Remote ships managed via gameState messages
  private remoteShips = new Map<
    string,
    {
      sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
      imageUrl?: string;
      loading?: boolean;
    }
  >();
  private gameStateListener = (ev: Event) => {
    const detail = (ev as CustomEvent<GameState>).detail;
    this.applyGameState(detail);
  };

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

    if (data?.shipTexture && this.textures.exists(data.shipTexture)) {
      // Create a local controllable ship only if a texture was provided from SplashScene
      this.ship = createShipSprite(
        this,
        this.scale.width / 2,
        this.scale.height / 2,
        data.shipTexture
      );
      applyStandardShipScale(this.ship);
    }

    this.scale.on("resize", () => {
      if (this.ship) this.wrapSprite(this.ship);
      this.remoteShips.forEach(({ sprite }) => this.wrapSprite(sprite));
      this.positionJoystick();
    });

    if (this.sys.game.device.input.touch) {
      this.joystick = new VirtualJoystick(this, 90, this.scale.height - 90, 80);
    }
    this.positionJoystick();

    // Listen for server-driven game state snapshots
    window.addEventListener("gameState", this.gameStateListener as any);
  }

  update(time: number, delta: number) {
    if (this.ship) {
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
    // Remote ships are purely server-authoritative; we just wrap them visually
    this.remoteShips.forEach(({ sprite }) => this.constrainToScreen(sprite));
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

  private applyGameState(gs: GameState) {
    // Create/update remote ships
    const seen = new Set<string>();
    Object.entries(gs.ships || {}).forEach(([id, shipState]) => {
      seen.add(id);
      this.upsertRemoteShip(id, shipState);
    });
    // Remove ships not present anymore
    this.remoteShips.forEach((_entry, id) => {
      if (!seen.has(id)) {
        const entry = this.remoteShips.get(id)!;
        entry.sprite.destroy();
        this.remoteShips.delete(id);
      }
    });
  }

  private upsertRemoteShip(id: string, state: ShipState) {
    let entry = this.remoteShips.get(id);
    if (!entry) {
      const sprite = createShipSprite(
        this,
        state.physics.position.x,
        state.physics.position.y,
        "ship"
      );
      applyStandardShipScale(sprite);
      sprite.setTint(0xccccff); // subtle tint to differentiate remote ships from local default
      entry = { sprite };
      this.remoteShips.set(id, entry);
    }
    // Update position & rotation from authoritative server state
    entry.sprite.x = state.physics.position.x;
    entry.sprite.y = state.physics.position.y;
    entry.sprite.rotation = state.physics.rotation;

    const imageUrl = state.appearance?.shipImageUrl;
    if (imageUrl && imageUrl !== entry.imageUrl && !entry.loading) {
      entry.loading = true;
      // Use deterministic key per ship id so subsequent loads replace the texture cleanly
      const key = `ship-${id}`;
      // Remove prior key if exists to avoid memory bloat
      if (this.textures.exists(key)) this.textures.remove(key);
      loadExternalShipTexture(this, imageUrl)
        .then((loadedKey) => {
          // The helper uses a fixed key; if different, rename; we simply use loadedKey
          entry!.sprite.setTexture(loadedKey);
          applyStandardShipScale(entry!.sprite);
          entry!.imageUrl = imageUrl;
        })
        .catch((e) => {
          // eslint-disable-next-line no-console
          console.warn(`Failed to load ship texture for ${id}:`, e);
        })
        .finally(() => {
          if (entry) entry.loading = false;
        });
    }
  }

  shutdown() {
    window.removeEventListener("gameState", this.gameStateListener as any);
  }
}
