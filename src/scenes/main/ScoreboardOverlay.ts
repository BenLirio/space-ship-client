import Phaser from "phaser";
import type { ScoreboardItem } from "../../types/state";
import { ensureTextureFor } from "../shared/TextureUtils";

export class ScoreboardOverlay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private entries: Map<string, Phaser.GameObjects.Container> = new Map();
  private header?: Phaser.GameObjects.Container;
  private tooltip?: {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    img: Phaser.GameObjects.Image;
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0).setDepth(1000);
    // fixed to camera
    this.container.setScrollFactor(0, 0);
  }

  async render(items: ScoreboardItem[]) {
    // Sort by score desc by default
    const list = [...items].sort((a, b) => b.score - a.score).slice(0, 8);
    const used = new Set<string>();

    // Table column layout
    const PAD = 10;
    const ROW_H = 28;
    const COLS = {
      thumb: 34,
      name: 200,
      score: 100,
    } as const;
    const GAP = 8;
    const TOTAL_W = COLS.thumb + COLS.name + COLS.score + GAP * 2 + PAD * 2;

    const right = this.scene.scale.width - PAD;

    // Header row
    if (!this.header) {
      const hc = this.scene.add.container(right, PAD);
      hc.setScrollFactor(0, 0);
      const bg = this.scene.add.rectangle(0, 0, TOTAL_W, ROW_H, 0x000000, 0.55);
      bg.setOrigin(1, 0.5);
      const mkText = (
        label: string,
        x: number,
        align: "left" | "center" | "right"
      ) => {
        const t = this.scene.add.text(x, 0, label, {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#ffffaa",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: 3,
        });
        if (align === "center") t.setOrigin(0.5, 0.5);
        else if (align === "right") t.setOrigin(1, 0.5);
        else t.setOrigin(0, 0.5);
        return t;
      };
      const leftX = -TOTAL_W + PAD;
      const thumbX = leftX + COLS.thumb / 2;
      const nameX = leftX + COLS.thumb + GAP;
      const scoreX = leftX + COLS.thumb + GAP + COLS.name + GAP + COLS.score;
      const hPrev = mkText("Ship", thumbX, "center");
      const hName = mkText("Name", nameX, "left");
      const hScore = mkText("Score", scoreX, "right");
      hc.add([bg, hPrev, hName, hScore]);
      this.container.add(hc);
      this.header = hc;
    } else {
      this.header.setPosition(right, PAD);
      const rect = this.header.list[0] as Phaser.GameObjects.Rectangle;
      rect.width = TOTAL_W;
      rect.height = ROW_H;
    }

    // Build or update rows
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      used.add(it.id);
      let row = this.entries.get(it.id);
      if (!row) {
        row = this.scene.add.container(0, 0);
        row.setScrollFactor(0, 0);
        const bg = this.scene.add.rectangle(
          0,
          0,
          TOTAL_W,
          ROW_H,
          0x000000,
          0.35
        );
        bg.setOrigin(1, 0.5).setData("kind", "bg");
        bg.setScrollFactor(0, 0);
        bg.setInteractive({ useHandCursor: false });
        const thumb = this.scene.add.image(0, 0, "ship").setDisplaySize(24, 24);
        thumb.setOrigin(0.5, 0.5).setData("kind", "thumb");
        thumb.setScrollFactor(0, 0);
        const name = this.scene.add
          .text(0, 0, "", {
            fontFamily: "monospace",
            fontSize: "13px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3,
          })
          .setOrigin(0, 0.5)
          .setData("kind", "name");
        name.setScrollFactor(0, 0);
        const score = this.scene.add
          .text(0, 0, "", {
            fontFamily: "monospace",
            fontSize: "13px",
            color: "#ffffff",
            stroke: "#000000",
            strokeThickness: 3,
          })
          .setOrigin(1, 0.5)
          .setData("kind", "score");
        score.setScrollFactor(0, 0);
        row.add([bg, thumb, name, score]);
        this.container.add(row);
        this.entries.set(it.id, row);

        // Hover tooltip handlers (attach once on creation)
        bg.on("pointerover", (pointer: Phaser.Input.Pointer) => {
          const tex = (row as any).getData("texKey") as string | undefined;
          if (!tex) return;
          this.showTooltip(tex, pointer.x, pointer.y);
        });
        bg.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          if (this.tooltip) this.positionTooltip(pointer.x, pointer.y);
        });
        bg.on("pointerout", () => this.hideTooltip());
      }
      // Ensure texture for thumb
      const texKey = await ensureTextureFor(
        this.scene,
        it.shipImageUrl,
        "ship"
      );
      const thumb = row.list.find(
        (c: any) => c.getData?.("kind") === "thumb"
      ) as Phaser.GameObjects.Image;
      thumb.setTexture(texKey);
      thumb.setDisplaySize(24, 24);
      thumb.setVisible(true);
      // store texture key for tooltip usage
      (row as any).setData("texKey", texKey);

      // Update cell text values
      const nameText = row.list.find(
        (c: any) => c.getData?.("kind") === "name"
      ) as Phaser.GameObjects.Text;
      const maxNameChars = 20;
      const nameStr =
        it.name.length > maxNameChars
          ? it.name.slice(0, maxNameChars - 1) + "…"
          : it.name;
      nameText.setText(nameStr);
      const scoreText = row.list.find(
        (c: any) => c.getData?.("kind") === "score"
      ) as Phaser.GameObjects.Text;
      scoreText.setText(it.score.toLocaleString());

      // Layout row at top-right
      const rowY = PAD + ROW_H + 6 + i * ROW_H; // below header
      row.setPosition(right, rowY);
      const bg = row.list.find(
        (c: any) => c.getData?.("kind") === "bg"
      ) as Phaser.GameObjects.Rectangle;
      bg.width = TOTAL_W;
      bg.height = ROW_H;
      const leftX = -TOTAL_W + PAD;
      const thumbX = leftX + COLS.thumb / 2;
      const nameX = leftX + COLS.thumb + GAP;
      const scoreX = leftX + COLS.thumb + GAP + COLS.name + GAP + COLS.score;
      thumb.x = thumbX;
      nameText.x = nameX;
      scoreText.x = scoreX;
    }

    // Remove old rows not used
    for (const [id, row] of this.entries) {
      if (!used.has(id)) {
        row.destroy(true);
        this.entries.delete(id);
      }
    }
  }

  resize() {
    // Re-apply layout to current items
    const items: { id: string }[] = [];
    this.entries.forEach((_row, id) => items.push({ id }));
    // No-op; layout occurs in render based on index
  }

  destroy() {
    this.container.destroy(true);
    this.entries.clear();
    if (this.tooltip) this.tooltip.container.destroy(true);
  }

  // Tooltip helpers
  private ensureTooltip() {
    if (this.tooltip) return this.tooltip;
    const c = this.scene.add
      .container(0, 0)
      .setDepth(2001)
      .setScrollFactor(0, 0);
    const bg = this.scene.add
      .rectangle(0, 0, 152, 152, 0x000000, 1)
      .setOrigin(0, 0);
    const img = this.scene.add.image(0, 0, "ship");
    img.setOrigin(0, 0);
    img.setDisplaySize(128, 128);
    c.add([bg, img]);
    c.setVisible(false);
    this.tooltip = { container: c, bg, img };
    return this.tooltip;
  }

  private showTooltip(texKey: string, x: number, y: number) {
    const tip = this.ensureTooltip();
    tip.img.setTexture(texKey);
    // Larger, opaque tooltip
    const size = 128;
    const pad = 16;
    tip.img.setDisplaySize(size, size);
    tip.bg.width = size + pad;
    tip.bg.height = size + pad;
    tip.container.setVisible(true);
    this.positionTooltip(x, y);
  }

  private hideTooltip() {
    if (!this.tooltip) return;
    this.tooltip.container.setVisible(false);
  }

  private positionTooltip(x: number, y: number) {
    if (!this.tooltip) return;
    const pad = 8;
    const w = this.tooltip.bg.width;
    const h = this.tooltip.bg.height;
    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;
    let px = x + 16;
    let py = y + 16;
    if (px + w > vw - pad) px = x - w - 16;
    if (py + h > vh - pad) py = vh - h - pad;
    if (px < pad) px = pad;
    if (py < pad) py = pad;
    this.tooltip.container.setPosition(px, py);
  }
}
