import Phaser from "phaser";
import {
  preloadShip,
  loadExternalShipTexture,
  applyStandardShipScale,
} from "../ship/ship";
import { GENERATE_SHIP_URL, logConfigOnce } from "../config";

export class SplashScene extends Phaser.Scene {
  private formEl?: HTMLDivElement;
  private statusEl?: HTMLDivElement;
  private generateInFlight = false;
  private generatedKey?: string;
  private generatedImageUrl?: string;

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

    genBtn.addEventListener("click", async () => {
      if (this.generateInFlight) return;
      const prompt = input.value.trim();
      await this.handleGenerate(prompt);
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

  private async handleGenerate(prompt: string) {
    if (!prompt) {
      this.status("Enter a prompt or use default.");
      return;
    }
    const endpoint = GENERATE_SHIP_URL;
    this.generateInFlight = true;
    this.status("Generating ship...");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Bad JSON");
      }
      if (!res.ok) throw new Error(data?.message || `Status ${res.status}`);
      const imageUrl: string | undefined = data?.imageUrl;
      if (!imageUrl) throw new Error("No imageUrl returned");
      this.status("Downloading ship texture...");
      const key = await loadExternalShipTexture(this, imageUrl);
      // Ensure proper scaling once we instantiate in main scene
      this.generatedKey = key;
      this.generatedImageUrl = imageUrl;
      this.status("Ship ready! Starting...");
      setTimeout(() => this.startGame(), 400);
    } catch (e: any) {
      this.status("Generation failed: " + (e.message || e));
    } finally {
      this.generateInFlight = false;
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
      shipTexture: this.generatedKey,
      shipImageUrl: this.generatedImageUrl,
    });
  }
}
