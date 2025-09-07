import Phaser from "phaser";
import { preloadShip } from "../ship/ship";
import { subscribe, getClientId, getProjectiles } from "../clientState";
import { RemoteShipSnapshot } from "../types/state";

// Extracted helpers
import { BackgroundGrid } from "./main/BackgroundGrid";
import { ProjectileRenderer } from "./main/ProjectileRenderer";
import { MobileControls } from "./shared/MobileControls";
import { InputPublisher } from "./shared/InputPublisher";
import { RemoteShipsManager } from "./shared/RemoteShipsManager";

export class MainScene extends Phaser.Scene {
  private inputPub!: InputPublisher;
  private mobile?: MobileControls;
  protected remoteSprites = new Map<
    string,
    Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  >();
  private unsubscribe?: () => void;
  private grid?: BackgroundGrid;
  private ships!: RemoteShipsManager;
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
    // Managers
    this.mobile = new MobileControls(this);
    this.inputPub = new InputPublisher(this, this.mobile);
    this.ships = new RemoteShipsManager(this);
    this.projectiles = new ProjectileRenderer(this);

    // Subscribe to remote ship and projectile updates
    this.unsubscribe = subscribe(() => {
      this.ships.sync();
      this.syncProjectiles();
    });
    this.ships.sync();
    this.syncProjectiles();

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
    const mySprite = id ? this.ships.sprites.get(id) : undefined;
    if (mySprite) this.cameras.main.centerOn(mySprite.x, mySprite.y);
    // Update HUD positions and publish input
    this.ships.updateHUD();
    this.inputPub.update();

    // Dead-reckon projectiles (client-side extrapolation until next snapshot)
    this.projectiles.extrapolate(delta, getProjectiles());
  }

  private resizeGrid() {
    this.grid?.resize();
  }
  private syncProjectiles() {
    this.projectiles.sync(getProjectiles());
  }

  // projectile extrapolation handled directly in update()

  shutdown() {
    if (this.unsubscribe) this.unsubscribe();
    this.mobile?.destroy();
    this.ships?.destroy();
    this.projectiles?.destroy();
  }
}
