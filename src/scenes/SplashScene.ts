import Phaser from "phaser";
import { logConfigOnce } from "../config";
import { subscribe, getClientId, getRemoteShips } from "../clientState";
import { createOverlay, OverlayElements } from "./splash/OverlayUI";

export class SplashScene extends Phaser.Scene {
  private ui?: OverlayElements;
  private infoMessages: string[] = [];
  private generateInFlight = false;
  // We don't persist the URL locally; server state drives appearance
  private unsubscribeState?: () => void;
  private awaitingShip = false;
  private awaitedId?: string;
  private timeoutHandle?: number;
  private shipQuota?: { remaining: number; cap: number };

  constructor() {
    super("splash");
  }

  preload() {
    // No-op; default texture is created in the main scene as needed.
  }

  create() {
    logConfigOnce();
    this.buildOverlay();
  }

  private buildOverlay() {
    const ui = createOverlay();
    this.ui = ui;

    // Events
    ui.root.querySelector("form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.generateInFlight) return;
      if (this.shipQuota && this.shipQuota.remaining <= 0) {
        this.status("Ship quota reached. Try default or come back later.");
        return;
      }
      this.handleGenerate(this.ui?.input.value.trim() || "");
    });
    this.ui.defaultBtn.addEventListener("click", () => {
      if (this.generateInFlight) return;
      this.notifyStartWithDefault();
      this.startGame();
    });

    // Listen for quota updates immediately
    window.addEventListener("ws-shipQuota", this.onShipQuota as any);
    // Apply initial value if already received
    const initial = (window as any).SHIP_QUOTA as
      | { remaining: number; cap: number }
      | undefined;
    if (initial) {
      this.shipQuota = initial;
      this.updateGenerateButtonQuota();
    } else {
      // Ensure base label is set
      this.updateGenerateButtonQuota();
    }

    // Cleanup on scene shutdown
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("ws-shipQuota", this.onShipQuota as any);
    });
  }

  // No imperative layout needed; CSS handles responsive behavior.

  private notifyStartWithDefault() {
    const ws: WebSocket | undefined = (window as any).ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "startWithDefault" }));
    }
  }

  private handleGenerate(prompt: string) {
    if (!prompt) {
      this.status("Enter a prompt or use default.");
      return;
    }
    if (this.shipQuota && this.shipQuota.remaining <= 0) {
      this.status("No ships remaining. Try default.");
      return;
    }
    // Reset previous info messages for a fresh attempt
    this.infoMessages = [];
    this.renderInfo();
    const ws: WebSocket | undefined = (window as any).ws;
    if (ws?.readyState !== WebSocket.OPEN) {
      this.status("WebSocket not connected yet.");
      return;
    }
    this.generateInFlight = true;
    this.awaitingShip = true;
    this.awaitedId = getClientId();
    this.setBusy(true);
    ws.send(JSON.stringify({ type: "startWithPrompt", payload: { prompt } }));
    // Listen for info & error events globally (added in main.ts)
    window.addEventListener("ws-info", this.onWsInfo as any);
    window.addEventListener("ws-error", this.onWsError as any);
    // Subscribe to state updates to detect when our ship appears
    this.unsubscribeState = subscribe(() => this.checkForGeneratedShip());
    // Timeout fallback
    this.timeoutHandle = window.setTimeout(() => {
      if (!this.awaitingShip) return;
      this.status("Timeout waiting for ship. You can retry.");
      this.cleanupGenerationListeners();
      this.generateInFlight = false;
      this.awaitingShip = false;
      this.setBusy(false);
    }, 60000);
  }

  private formatMsg(raw: any) {
    if (typeof raw === "string") return raw;
    if (typeof raw?.message === "string") return raw.message;
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }

  private onWsInfo = (ev: CustomEvent) => {
    if (!this.awaitingShip) return;
    this.addInfo(this.formatMsg(ev.detail));
  };

  private onWsError = (ev: CustomEvent) => {
    const msg = this.formatMsg(ev.detail);
    this.status("Error: " + msg, "error");
    this.cleanupGenerationListeners();
    this.generateInFlight = false;
    this.awaitingShip = false;
    this.setBusy(false);
  };

  private onShipQuota = (ev: CustomEvent) => {
    const payload = ev.detail as { remaining: number; cap: number };
    this.shipQuota = payload;
    this.updateGenerateButtonQuota();
  };

  private checkForGeneratedShip() {
    if (!this.awaitingShip) return;
    const id = this.awaitedId;
    if (!id) return;
    const ships = getRemoteShips();
    const mine = (ships as any)[id];
    if (mine && mine.appearance.shipImageUrl) {
      this.cleanupGenerationListeners();
      this.awaitingShip = false;
      this.generateInFlight = false;
      this.setBusy(false);
      setTimeout(() => this.startGame(), 400);
    }
  }

  private cleanupGenerationListeners() {
    window.removeEventListener("ws-info", this.onWsInfo as any);
    window.removeEventListener("ws-error", this.onWsError as any);
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = undefined;
    }
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
  }

  private status(msg: string, kind: "info" | "error" | "normal" = "normal") {
    const el = this.ui?.status;
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("error", kind === "error");
  }

  private addInfo(msg: string) {
    this.infoMessages.push(msg);
    if (this.infoMessages.length > 3)
      this.infoMessages = this.infoMessages.slice(-3);
    this.renderInfo();
  }

  private renderInfo() {
    if (!this.ui) return;
    const infoEl = this.ui.info;
    infoEl.textContent = "";
    const wrap = document.createElement("div");
    wrap.className = "info-log-list";
    this.infoMessages.forEach((item) => {
      const line = document.createElement("div");
      line.className = "info-item";
      line.textContent = item;
      wrap.appendChild(line);
    });
    infoEl.appendChild(wrap);
  }

  private setBusy(isBusy: boolean) {
    const btn = this.ui?.generateBtn;
    const def = this.ui?.defaultBtn;
    if (btn) btn.disabled = isBusy || (this.shipQuota?.remaining ?? 1) <= 0;
    if (def) def.disabled = isBusy;
    if (isBusy && btn) {
      if (!(btn as any).dataset.originalText) {
        (btn as any).dataset.originalText = btn.textContent || "";
      }
      btn.textContent = "Generating…";
    } else if (!isBusy && btn) {
      this.updateGenerateButtonQuota();
    }
  }

  private updateGenerateButtonQuota() {
    const btn = this.ui?.generateBtn;
    if (!btn) return;
    const quota = this.shipQuota;
    const baseText = (btn as any).dataset.originalText || "Generate Ship";
    if (
      quota &&
      typeof quota.remaining === "number" &&
      typeof quota.cap === "number"
    ) {
      btn.textContent = `${baseText} (${Math.max(0, quota.remaining)}/${
        quota.cap
      })`;
      btn.disabled = this.generateInFlight || quota.remaining <= 0;
    } else {
      btn.textContent = baseText;
      btn.disabled = !!this.generateInFlight;
    }
  }

  private startGame() {
    // Clean up DOM overlay
    this.ui?.root.remove();
    this.ui = undefined;
    this.scene.start("main");
  }
}
