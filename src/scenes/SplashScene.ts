import Phaser from "phaser";
import {
  preloadShip,
  loadExternalShipTexture,
  applyStandardShipScale,
} from "../ship/ship";
import { logConfigOnce } from "../config";
import { subscribe, getClientId, getRemoteShips } from "../clientState";

export class SplashScene extends Phaser.Scene {
  private formEl?: HTMLDivElement;
  private statusEl?: HTMLDivElement;
  private generateInFlight = false;
  private generatedImageUrl?: string; // Only need URL now; texture loaded in MainScene
  private unsubscribeState?: () => void;
  private awaitingShip = false;
  private awaitedId?: string;
  private timeoutHandle?: number;

  constructor() {
    super("splash");
  }

  preload() {
    preloadShip(this); // base triangle
  }

  create() {
    logConfigOnce();
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height * 0.28, "AI SPACE SHIP", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "64px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
    this.add
      .text(
        width / 2,
        height * 0.42,
        "Enter a prompt to generate your ship\n(or start with the default)",
        {
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          color: "#bbbbbb",
          align: "center",
        }
      )
      .setOrigin(0.5);

    this.buildForm();
    this.scale.on("resize", () => this.layout(), this);
    this.layout();
  }

  private layout() {
    if (!this.formEl) return;
    // Center form overlay
    this.formEl.style.position = "fixed";
    this.formEl.style.left = "50%";
    this.formEl.style.top = "58%";
    this.formEl.style.transform = "translate(-50%, -50%)";
  }

  private buildForm() {
    const root = document.createElement("div");
    root.style.display = "flex";
    root.style.flexDirection = "column";
    root.style.gap = "12px";
    root.style.padding = "20px 24px";
    root.style.background = "rgba(10,14,22,.8)";
    root.style.border = "1px solid #223";
    root.style.borderRadius = "12px";
    root.style.width = "min(480px, 90vw)";
    root.style.boxShadow = "0 4px 24px -4px rgba(0,0,0,.6)";
    root.style.backdropFilter = "blur(4px)";
    root.style.fontFamily = "system-ui, sans-serif";

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "e.g. Sleek explorer with blue thrusters";
    input.style.padding = "12px 14px";
    input.style.fontSize = "16px";
    input.style.borderRadius = "8px";
    input.style.border = "1px solid #345";
    input.style.background = "#0b1018";
    input.style.color = "#fff";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "12px";

    const genBtn = document.createElement("button");
    genBtn.textContent = "Generate Ship";
    genBtn.style.flex = "1";
    const skipBtn = document.createElement("button");
    skipBtn.textContent = "Start with Default";
    skipBtn.style.flex = "1";

    [genBtn, skipBtn].forEach((b) => {
      b.style.padding = "12px 16px";
      b.style.fontSize = "16px";
      b.style.cursor = "pointer";
      b.style.borderRadius = "8px";
      b.style.border = "1px solid #2a4a6c";
      b.style.background = "#1d3a5a";
      b.style.color = "#fff";
      b.onmouseenter = () => (b.style.background = "#275d8d");
      b.onmouseleave = () => (b.style.background = "#1d3a5a");
    });

    row.append(genBtn, skipBtn);

    const status = document.createElement("div");
    status.style.fontSize = "13px";
    status.style.minHeight = "18px";
    status.style.color = "#9bb";

    root.append(input, row, status);
    document.body.appendChild(root);
    this.formEl = root;
    this.statusEl = status;

    genBtn.addEventListener("click", () => {
      if (this.generateInFlight) return;
      const prompt = input.value.trim();
      this.handleGenerate(prompt);
    });
    skipBtn.addEventListener("click", () => {
      // Notify server we are proceeding with default ship (no generation)
      try {
        const ws: WebSocket | undefined = (window as any).ws;
        if (ws && ws.readyState === WebSocket.OPEN) {
          // Intentionally minimal envelope (no payload)
          ws.send(
            JSON.stringify({
              type: "startWithDefault",
            })
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("failed to send startWithDefault", e);
      }
      this.startGame();
    });

    // Enter to generate
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        genBtn.click();
      }
      e.stopPropagation();
    });

    // Auto focus
    setTimeout(() => input.focus(), 50);
  }

  private handleGenerate(prompt: string) {
    if (!prompt) {
      this.status("Enter a prompt or use default.");
      return;
    }
    try {
      const ws: WebSocket | undefined = (window as any).ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        this.status("WebSocket not connected yet.");
        return;
      }
      this.generateInFlight = true;
      this.awaitingShip = true;
      this.awaitedId = getClientId();
      this.status("Generating ship...");
      ws.send(JSON.stringify({ type: "startWithPrompt", payload: { prompt } }));
      // Listen for info & error events globally (added in main.ts)
      window.addEventListener("ws-info", this.onWsInfo as any);
      window.addEventListener("ws-error", this.onWsError as any);
      // Subscribe to state updates to detect when our ship appears
      this.unsubscribeState = subscribe(() => this.checkForGeneratedShip());
      // Timeout fallback
      this.timeoutHandle = window.setTimeout(() => {
        if (this.awaitingShip) {
          this.status("Timeout waiting for ship. You can retry.");
          this.cleanupGenerationListeners();
          this.generateInFlight = false;
          this.awaitingShip = false;
        }
      }, 30000);
    } catch (e: any) {
      this.status("Failed to send prompt: " + (e.message || e));
      this.generateInFlight = false;
    }
  }

  private onWsInfo = (ev: CustomEvent) => {
    if (!this.awaitingShip) return; // ignore after done
    const msg = ev.detail;
    if (typeof msg === "string") this.status(msg);
  };

  private onWsError = (ev: CustomEvent) => {
    const msg = ev.detail;
    this.status("Error: " + msg);
    this.cleanupGenerationListeners();
    this.generateInFlight = false;
    this.awaitingShip = false;
  };

  private checkForGeneratedShip() {
    if (!this.awaitingShip) return;
    const id = this.awaitedId;
    if (!id) return;
    const ships = getRemoteShips();
    const mine = (ships as any)[id];
    if (mine && mine.appearance?.shipImageUrl) {
      this.generatedImageUrl = mine.appearance.shipImageUrl;
      this.status("Ship ready! Starting...");
      this.cleanupGenerationListeners();
      this.awaitingShip = false;
      this.generateInFlight = false;
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

  private status(msg: string) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  private startGame() {
    // Clean up DOM
    if (this.formEl) {
      this.formEl.remove();
      this.formEl = undefined;
    }
    this.scene.start("main", {
      shipImageUrl: this.generatedImageUrl,
    });
  }
}
