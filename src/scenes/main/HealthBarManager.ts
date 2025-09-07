import Phaser from "phaser";

export interface HealthBarParts {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  fg: Phaser.GameObjects.Rectangle;
  kills: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
}

export class HealthBarManager {
  private scene: Phaser.Scene;
  private bars = new Map<string, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  getOrCreate(id: string): HealthBarParts {
    let container = this.bars.get(id);
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
      const name = children.find(
        (c) => c.getData && c.getData("kind") === "hb-name"
      ) as Phaser.GameObjects.Text;
      return { container, bg, fg, kills, name };
    }
    const c = this.scene.add.container(0, 0).setDepth(200);
    const bg = this.scene.add.rectangle(0, 0, 60, 6, 0x111111, 0.75);
    bg.setOrigin(0.5, 0.5).setData("kind", "hb-bg");
    const fg = this.scene.add.rectangle(-30, 0, 60, 6, 0x00ff00, 0.95);
    fg.setOrigin(0, 0.5).setData("kind", "hb-fg");
    const kills = this.scene.add.text(0, -8, "0", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    });
    kills.setOrigin(0.5, 1).setData("kind", "hb-kills");
    const name = this.scene.add.text(0, -22, "", {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 3,
    });
    name.setOrigin(0.5, 1).setData("kind", "hb-name");
    c.add([bg, fg, kills, name]);
    this.bars.set(id, c);
    return { container: c, bg, fg, kills, name };
  }

  refresh(
    id: string,
    sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
    health: number,
    kills: number,
    name: string
  ) {
    const {
      container,
      bg,
      fg,
      kills: killsLabel,
      name: nameLabel,
    } = this.getOrCreate(id);
    const h = Phaser.Math.Clamp(health, 0, 100);
    const maxW = Math.max(48, Math.round(sprite.displayWidth || 60));
    const height = 6;
    bg.setSize(maxW, height);
    const fgW = Math.max(0, Math.round((maxW * h) / 100));
    fg.setSize(fgW, height);
    fg.x = -maxW / 2;
    bg.x = 0;
    const t = h / 100;
    const r = Math.round(255 * (1 - t));
    const g = Math.round(255 * t);
    const color = (r << 16) | (g << 8) | 0;
    fg.setFillStyle(color, 0.95);
    const offsetY = -(sprite.displayHeight || 80) * 0.65;
    container.setPosition(sprite.x, sprite.y + offsetY);
    container.setVisible(true);
    container.setDepth(sprite.depth + 1);
    const k = Math.max(0, Math.floor(kills));
    killsLabel.setText(String(k));
    killsLabel.x = 0;
    killsLabel.y = -8;
    const nm = name.trim();
    const maxChars = 18;
    const text = nm.length > maxChars ? nm.slice(0, maxChars - 1) + "…" : nm;
    nameLabel.setText(text);
    nameLabel.x = 0;
    nameLabel.y = -22;
    nameLabel.setVisible(!!nm);
  }

  positionAll(
    sprites: Map<string, Phaser.Types.Physics.Arcade.SpriteWithDynamicBody>
  ) {
    this.bars.forEach((c, id) => {
      const sprite = sprites.get(id);
      if (!sprite || !sprite.active) return c.setVisible(false);
      const offsetY = -(sprite.displayHeight || 80) * 0.65;
      c.setPosition(sprite.x, sprite.y + offsetY);
      c.setDepth(sprite.depth + 1);
      c.setVisible(true);
    });
  }

  destroyFor(id: string) {
    const c = this.bars.get(id);
    if (c) {
      c.destroy(true);
      this.bars.delete(id);
    }
  }

  clear() {
    this.bars.forEach((c) => c.destroy(true));
    this.bars.clear();
  }
}
