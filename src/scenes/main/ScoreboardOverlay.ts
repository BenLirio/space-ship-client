import type { ScoreboardItem } from "../../types/websocket";
import "../../styles/scoreboard.css";

export class ScoreboardOverlay {
  root?: HTMLDivElement;

  ensureDom() {
    if (this.root) return;
    const root = document.createElement("div");
    root.id = "scoreboard";
    root.setAttribute("aria-label", "Scoreboard");
    const inner = document.createElement("div");
    inner.className = "sb-inner";
    root.appendChild(inner);
    document.body.appendChild(root);
    this.root = root;
  }

  layout() {}

  render(items: ScoreboardItem[]) {
    if (!this.root) return;
    const inner = this.root.querySelector(".sb-inner");
    if (!inner) return;
    const sorted = [...items].sort((a, b) => {
      const s = (b.score ?? 0) - (a.score ?? 0);
      if (s !== 0) return s;
      const ad = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bd = b.createdAt ? Date.parse(b.createdAt) : 0;
      return ad - bd;
    });
    const MAX_ROWS = 8;
    // Efficiently replace content
    const frag = document.createDocumentFragment();
    for (const i of sorted.slice(0, MAX_ROWS)) {
      const safeName = (i.name || i.id || "").toString();
      const row = document.createElement("div");
      row.className = "row";
      row.title = `${safeName} — ${i.score}`;

      const img = document.createElement("img");
      img.src = i.shipImageUrl || "";
      img.alt = "ship";

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = safeName;

      const score = document.createElement("span");
      score.className = "score";
      score.textContent = String(i.score ?? 0);

      row.append(img, name, score);
      frag.appendChild(row);
    }
    (inner as HTMLElement).replaceChildren(frag);
  }

  destroy() {
    if (this.root) {
      this.root.remove();
      this.root = undefined;
    }
  }
}
