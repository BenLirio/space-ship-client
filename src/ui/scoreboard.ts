import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ScoreboardItem } from "../types/websocket";

@customElement("scoreboard-overlay")
export class ScoreboardOverlayEl extends LitElement {
  @property({ type: Array }) items: ScoreboardItem[] = [];

  static styles = css`
    :host {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 10000;
      pointer-events: none;
    }
    .wrap {
      background: rgba(0, 0, 0, 0.35);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 8px 10px;
      width: 260px;
      color: #fff;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell,
        Noto Sans, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      pointer-events: auto;
    }
    .row {
      display: grid;
      grid-template-columns: 28px 1fr auto;
      align-items: center;
      gap: 8px;
      padding: 4px 2px;
    }
    img {
      width: 24px;
      height: 24px;
      object-fit: contain;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
    }
    .name {
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .score {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      padding-left: 6px;
    }
    header {
      font-size: 12px;
      opacity: 0.8;
      margin-bottom: 4px;
    }
  `;

  render() {
    const sorted = [...this.items].sort((a, b) => {
      const s = (b.score ?? 0) - (a.score ?? 0);
      if (s !== 0) return s;
      const ad = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bd = b.createdAt ? Date.parse(b.createdAt) : 0;
      return ad - bd;
    });
    const rows = sorted.slice(0, 8);
    return html`
      <div class="wrap" aria-label="Scoreboard">
        <header>Top Pilots</header>
        ${rows.map(
          (i) => html`<div class="row" title="${i.name} — ${i.score}">
            <img src="${i.shipImageUrl || ""}" alt="ship" />
            <div class="name">${i.name || i.id}</div>
            <div class="score">${i.score ?? 0}</div>
          </div>`
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "scoreboard-overlay": ScoreboardOverlayEl;
  }
}
