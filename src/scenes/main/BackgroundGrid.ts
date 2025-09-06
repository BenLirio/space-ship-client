import Phaser from "phaser";
import { SHIP_TARGET_MAX_SIZE } from "../../ship/ship";

// Manages the parallax-style background grid as a screen-space tile sprite.
export class BackgroundGrid {
  private scene: Phaser.Scene;
  private grid?: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.create();
  }

  private create() {
    const cell = SHIP_TARGET_MAX_SIZE * 4; // cell ~4x base ship size
    const patternKey = "grid-pattern";
    const { textures, make, add, scale } = this.scene;
    if (!textures.exists(patternKey)) {
      const g = make.graphics({ x: 0, y: 0 });
      const lineColor = 0x758089;
      g.clear();
      // Pre-blurred bands to reduce shimmer when scrolling
      g.fillStyle(lineColor, 0.55).fillRect(0, 0, cell, 1);
      g.fillStyle(lineColor, 0.25).fillRect(0, 1, cell, 1);
      g.fillStyle(lineColor, 0.55).fillRect(0, 0, 1, cell);
      g.fillStyle(lineColor, 0.25).fillRect(1, 0, 1, cell);
      g.generateTexture(patternKey, cell, cell);
      g.destroy();
    }
    this.grid = add
      .tileSprite(0, 0, scale.width, scale.height, patternKey)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-100);
  }

  resize() {
    if (!this.grid) return;
    this.grid.setSize(this.scene.scale.width, this.scene.scale.height);
  }

  updateScroll() {
    if (!this.grid) return;
    const cam = this.scene.cameras.main;
    this.grid.setTilePosition(Math.round(cam.scrollX), Math.round(cam.scrollY));
  }

  destroy() {
    this.grid?.destroy();
    this.grid = undefined;
  }
}
