import type { ScoreboardItem } from "../../types/websocket";
import "../../styles/scoreboard.css";

export class ScoreboardOverlay {
  root?: HTMLDivElement;

  ensureDom() {
    if (this.root) return;
    const root = document.createElement("div");
    root.id = "scoreboard";
    root.setAttribute("aria-label", "Scoreboard");
    root.innerHTML = `<div class="sb-inner"></div>`;
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
    const rows = sorted.slice(0, MAX_ROWS).map((i) => {
      const safeName = (i.name || i.id || "").toString();
      const title = `${safeName} — ${i.score}`;
      const shipUrl = i.shipImageUrl || "";
      return `<div class="row" title="${title}">
      <img src="${shipUrl}" alt="ship" />
      <span class="name">${safeName}</span>
      <span class="score">${i.score}</span>
    </div>`;
    });
    inner.innerHTML = rows.join("");
  }

  destroy() {
    if (this.root) {
      this.root.remove();
      this.root = undefined;
    }
  }
}
