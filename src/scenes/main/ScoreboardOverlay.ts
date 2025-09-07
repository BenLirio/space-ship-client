import Phaser from "phaser";
import type { ScoreboardItem } from "../../types/state";
import { ensureTextureForDirect } from "../shared/TextureUtils";

export class ScoreboardOverlay {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private entries: Map<string, Phaser.GameObjects.Container> = new Map();
  private header?: Phaser.GameObjects.Container;
  private compact?: Phaser.GameObjects.Container;
  private expandHit?: Phaser.GameObjects.Rectangle;
  private collapseHit?: Phaser.GameObjects.Rectangle;
  private expanded = false; // unified behavior: compact by default on all devices
  private lastItems: ScoreboardItem[] = [];
  private onResize?: () => void;
  private tooltip?: {
    container: Phaser.GameObjects.Container;
    bg: Phaser.GameObjects.Rectangle;
    img: Phaser.GameObjects.Image;
  };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    // Raise above mobile controls (which use ~1000/1001)
    this.container = scene.add.container(0, 0).setDepth(2000);
    // fixed to camera
    this.container.setScrollFactor(0, 0);

    // Keep layout fresh on viewport change
    this.onResize = () => this.render(this.lastItems);
    this.scene.scale.on("resize", this.onResize);
  }

  async render(items: ScoreboardItem[]) {
    this.lastItems = items;
    // Sort by score desc by default
    const listFull = [...items].sort((a, b) => b.score - a.score);
    // Responsive layout sizing
    const vw = this.scene.scale.width;
    const vh = this.scene.scale.height;
    // Compute table geometry responsively
    const PAD = 8;
    const ROW_H = vw < 480 ? 24 : 28;
    const GAP = 6;
    const COLS = (() => {
      // cap total width to 60% of viewport or 360px, whichever is smaller
      const maxTableW = Math.min(Math.floor(vw * 0.6), 360);
      const thumb = vw < 480 ? 28 : 34;
      const score = vw < 480 ? 80 : 100;
      // remaining for name, ensure a sensible min
      const name = Math.max(80, maxTableW - thumb - score - GAP * 2 - PAD * 2);
      return { thumb, name, score } as const;
    })();
    const TOTAL_W = COLS.thumb + COLS.name + COLS.score + GAP * 2 + PAD * 2;
    // rows shown based on available height, but keep reasonable upper bound
    const maxRowsByHeight = Math.max(
      3,
      Math.floor((vh - (PAD * 2 + ROW_H + 6)) / ROW_H)
    );
    const rowsToShow = Math.min(8, maxRowsByHeight);
    const list = listFull.slice(0, rowsToShow);
    const used = new Set<string>();

    const right = this.scene.scale.width - PAD;

    // Ensure compact pill (always exists; shown when collapsed)
    const ensureCompact = () => {
      if (this.compact) return this.compact;
      const cc = this.scene.add.container(right, PAD);
      cc.setScrollFactor(0, 0);
      const bg = this.scene.add
        .rectangle(0, 0, 220, ROW_H, 0x000000, 0.55)
        .setOrigin(1, 0.5)
        .setData("kind", "bg");
      const text = this.scene.add
        .text(-8, 0, "", {
          fontFamily: "monospace",
          fontSize: "13px",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(1, 0.5)
        .setData("kind", "text");
      // Chevron indicator
      const chev = this.scene.add
        .text(-4, 0, "▼", {
          fontFamily: "monospace",
          fontSize: "14px",
          color: "#ffffaa",
          stroke: "#000000",
          strokeThickness: 3,
        })
        .setOrigin(0, 0.5)
        .setData("kind", "chev");
      // Invisible bigger hit target to toggle
      this.expandHit = this.scene.add
        .rectangle(0, 0, 240, ROW_H + 6, 0x000000, 0)
        .setOrigin(1, 0.5)
        .setScrollFactor(0, 0)
        .setInteractive({ useHandCursor: true });
      this.expandHit.on("pointerdown", () => {
        this.expanded = true;
        this.render(this.lastItems);
      });
      // Also make the entire compact container interactive for robustness
      cc.setSize(240, ROW_H + 6);
      const hitRect = new Phaser.Geom.Rectangle(
        -240,
        -ROW_H / 2 - 3,
        240,
        ROW_H + 6
      );
      // @ts-ignore setInteractive signature accepts (shape, callback)
      cc.setInteractive(hitRect, Phaser.Geom.Rectangle.Contains);
      cc.on("pointerdown", () => {
        this.expanded = true;
        this.render(this.lastItems);
      });
      cc.add([bg, text, chev, this.expandHit]);
      this.container.add(cc);
      this.compact = cc;
      return cc;
    };

    const updateCompact = () => {
      const cc = ensureCompact();
      cc.setPosition(right, PAD);
      const bg = cc.list.find(
        (c: any) => c.getData?.("kind") === "bg"
      ) as Phaser.GameObjects.Rectangle;
      const text = cc.list.find(
        (c: any) => c.getData?.("kind") === "text"
      ) as Phaser.GameObjects.Text;
      const top = listFull[0];
      const total = listFull.length;
      const title = top
        ? `🏆 ${top.name} — ${top.score.toLocaleString()}  (${total})`
        : `🏆 Scoreboard (${total})`;
      text.setText(title);
      // Resize based on text
      const padH = 12;
      const width = Math.min(
        Math.max(160, text.width + padH * 2),
        Math.floor(vw * 0.9)
      );
      bg.width = width;
      bg.height = ROW_H;
      if (this.expandHit) {
        this.expandHit.width = width + 12;
        this.expandHit.height = ROW_H + 6;
      }
      // Update chevron position (right edge)
      const chev = cc.list.find(
        (c: any) => c.getData?.("kind") === "chev"
      ) as Phaser.GameObjects.Text;
      if (chev) {
        chev.x = -4; // stays near right edge of container bg
      }
      // Update container hit area to new width
      cc.setSize(width + 12, ROW_H + 6);
      const newHit = new Phaser.Geom.Rectangle(
        -width - 12,
        -ROW_H / 2 - 3,
        width + 12,
        ROW_H + 6
      );
      // @ts-ignore
      cc.input?.hitArea &&
        cc.input.hitArea.setTo(newHit.x, newHit.y, newHit.width, newHit.height);
      // @ts-ignore
      cc.input && (cc.input.cursor = "pointer");
      cc.setVisible(!this.expanded);
    };

    updateCompact();

    // Header row (only shown in expanded mode)
    if (this.expanded) {
      if (!this.header) {
        const hc = this.scene.add.container(right, PAD);
        hc.setScrollFactor(0, 0);
        const bg = this.scene.add.rectangle(
          0,
          0,
          TOTAL_W,
          ROW_H,
          0x000000,
          0.55
        );
        bg.setOrigin(1, 0.5).setData("kind", "bg");
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
        // chevron and collapse toggle in header
        const chev = this.scene.add
          .text(-4, 0, "▲", {
            fontFamily: "monospace",
            fontSize: "14px",
            color: "#ffffaa",
            stroke: "#000000",
            strokeThickness: 3,
          })
          .setOrigin(0, 0.5)
          .setData("kind", "chev");
        // collapse toggle hit in header
        this.collapseHit = this.scene.add
          .rectangle(0, 0, TOTAL_W, ROW_H, 0x000000, 0)
          .setOrigin(1, 0.5)
          .setScrollFactor(0, 0)
          .setInteractive({ useHandCursor: true });
        this.collapseHit.on("pointerdown", () => {
          this.expanded = false;
          this.render(this.lastItems);
        });
        // Make whole header interactive too
        hc.setSize(TOTAL_W, ROW_H);
        const hHit = new Phaser.Geom.Rectangle(
          -TOTAL_W,
          -ROW_H / 2,
          TOTAL_W,
          ROW_H
        );
        // @ts-ignore
        hc.setInteractive(hHit, Phaser.Geom.Rectangle.Contains);
        hc.on("pointerdown", () => {
          this.expanded = false;
          this.render(this.lastItems);
        });
        // @ts-ignore
        hc.input && (hc.input.cursor = "pointer");
        hc.add([bg, hPrev, hName, hScore, chev, this.collapseHit]);
        this.container.add(hc);
        this.header = hc;
      } else {
        this.header.setPosition(right, PAD);
        const rect = this.header.list.find(
          (c: any) => c.getData?.("kind") === "bg"
        ) as Phaser.GameObjects.Rectangle;
        rect.width = TOTAL_W;
        rect.height = ROW_H;
        // Update chevron and hit area
        const chev = this.header.list.find(
          (c: any) => c.getData?.("kind") === "chev"
        ) as Phaser.GameObjects.Text;
        if (chev) {
          chev.x = -4;
          chev.setText("▲");
        }
        if (this.collapseHit) {
          this.collapseHit.width = TOTAL_W;
          this.collapseHit.height = ROW_H;
        }
        const hHit = new Phaser.Geom.Rectangle(
          -TOTAL_W,
          -ROW_H / 2,
          TOTAL_W,
          ROW_H
        );
        // @ts-ignore
        this.header.input?.hitArea &&
          this.header.input.hitArea.setTo(
            hHit.x,
            hHit.y,
            hHit.width,
            hHit.height
          );
      }
      this.header.setVisible(true);
    } else {
      if (this.header) this.header.setVisible(false);
    }

    // Build or update rows (expanded only)
    if (this.expanded) {
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
          const thumb = this.scene.add.image(0, 0, "ship");
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
        const texKey = await ensureTextureForDirect(
          this.scene,
          it.shipImageUrl,
          "ship"
        );
        const thumb = row.list.find(
          (c: any) => c.getData?.("kind") === "thumb"
        ) as Phaser.GameObjects.Image;
        thumb.setTexture(texKey);
        const thumbSize = COLS.thumb - 6; // a bit inset inside col
        thumb.setDisplaySize(thumbSize, thumbSize);
        thumb.setVisible(true);
        // store texture key for tooltip usage
        (row as any).setData("texKey", texKey);

        // Update cell text values
        const nameText = row.list.find(
          (c: any) => c.getData?.("kind") === "name"
        ) as Phaser.GameObjects.Text;
        // Show full name without truncation; allow it to extend within column
        nameText.setText(it.name);
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
        // vertical alignment within row
        thumb.y = 0;
        nameText.y = 0;
        scoreText.y = 0;
        row.setVisible(true);
      }
    }

    // Remove old rows not used
    // When collapsed, we don't build rows, but we can hide existing ones to save draw calls
    for (const [id, row] of this.entries) {
      const keep = this.expanded && used.has(id);
      if (!keep && this.expanded) {
        row.destroy(true);
        this.entries.delete(id);
      } else {
        row.setVisible(!!keep);
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
    if (this.onResize) this.scene.scale.off("resize", this.onResize);
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
