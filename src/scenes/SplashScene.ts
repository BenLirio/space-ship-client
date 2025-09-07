import Phaser from "phaser";
import { preloadShip } from "../ship/ship";
import { logConfigOnce } from "../config";
import { subscribe, getClientId, getRemoteShips } from "../clientState";
import "../styles/splash.css";

export class SplashScene extends Phaser.Scene {
  private overlayRoot?: HTMLDivElement;
  private inputEl?: HTMLInputElement;
  private generateBtn?: HTMLButtonElement;
  private defaultBtn?: HTMLButtonElement;
  private statusEl?: HTMLDivElement;
  private infoEl?: HTMLDivElement;
  private infoMessages: string[] = [];
  private generateInFlight = false;
  // We don't persist the URL locally; server state drives appearance
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
    this.buildOverlay();
  }

  private buildOverlay() {
    const root = document.createElement("div");
    root.className = "splash-overlay";

    const stack = document.createElement("div");
    stack.className = "splash-stack";
    stack.setAttribute("role", "dialog");
    stack.setAttribute("aria-labelledby", "splash-title");

    const header = document.createElement("header");
    header.className = "splash-header";

    const h1 = document.createElement("h1");
    h1.id = "splash-title";
    h1.className = "splash-title";
    h1.textContent = "AI SPACESHIP";

    const p = document.createElement("p");
    p.className = "splash-sub";
    p.append(
      document.createTextNode("Generate your unique ship with a prompt")
    );
    p.appendChild(document.createElement("br"));
    const spanAlt = document.createElement("span");
    spanAlt.className = "splash-sub-alt";
    spanAlt.textContent = "and fly around with others in realtime";
    p.appendChild(spanAlt);

    const starWrap = document.createElement("div");
    starWrap.className = "gh-star-wrap";
    // GitHub Star button anchor (script enhances it)
    const gh = document.createElement("a");
    gh.className = "github-button";
    gh.href = "https://github.com/BenLirio/space-ship-generator";
    gh.setAttribute(
      "data-color-scheme",
      "no-preference: light; light: light; dark: dark;"
    );
    gh.setAttribute("data-icon", "octicon-star");
    gh.setAttribute("data-size", "large");
    gh.setAttribute("data-show-count", "true");
    gh.setAttribute(
      "aria-label",
      "Star BenLirio/space-ship-generator on GitHub"
    );
    gh.textContent = "Star";

    const discord = document.createElement("a");
    discord.className = "discord-link";
    discord.href = "https://discord.com/invite/F69uzFtgpT";
    discord.target = "_blank";
    discord.rel = "noopener";
    discord.setAttribute("aria-label", "Join our Discord (opens in new tab)");
    discord.textContent = "Join our Discord";

    const banana = document.createElement("a");
    banana.className = "banana-link";
    banana.href =
      "https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/";
    banana.target = "_blank";
    banana.rel = "noopener";
    banana.setAttribute("aria-label", "Model info (opens in new tab)");
    banana.textContent = "🍌 uses nano banana";

    starWrap.append(gh, discord, banana);
    header.append(h1, p, starWrap);

    const form = document.createElement("form");
    form.className = "splash-form";
    form.autocomplete = "off";

    const label = document.createElement("label");
    label.className = "visually-hidden";
    label.htmlFor = "shipPrompt";
    label.textContent = "Ship prompt";

    const input = document.createElement("input");
    input.id = "shipPrompt";
    input.name = "shipPrompt";
    input.type = "text";
    input.setAttribute("inputmode", "text");
    input.placeholder = "e.g. Sleek explorer with blue thrusters";

    const btnRow = document.createElement("div");
    btnRow.className = "button-row";

    const generate = document.createElement("button");
    generate.type = "submit";
    generate.className = "primary";
    generate.setAttribute("data-action", "generate");
    generate.textContent = "Generate Ship";

    const startDefault = document.createElement("button");
    startDefault.type = "button";
    startDefault.className = "secondary";
    startDefault.setAttribute("data-action", "default");
    startDefault.textContent = "Start with Default";

    btnRow.append(generate, startDefault);

    const status = document.createElement("div");
    status.className = "status";
    status.setAttribute("aria-live", "polite");

    const info = document.createElement("div");
    info.className = "info-log";
    info.setAttribute("aria-live", "polite");
    info.setAttribute("aria-atomic", "false");

    form.append(label, input, btnRow, status, info);
    stack.append(header, form);
    root.appendChild(stack);
    document.body.appendChild(root);
    this.overlayRoot = root;
    this.inputEl = input;
    this.generateBtn = generate;
    this.defaultBtn = startDefault;
    this.statusEl = status as HTMLDivElement;
    this.infoEl = info as HTMLDivElement;

    // Events
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.generateInFlight) return;
      this.handleGenerate(this.inputEl?.value.trim() || "");
    });
    this.defaultBtn?.addEventListener("click", () => {
      if (this.generateInFlight) return;
      this.notifyStartWithDefault();
      this.startGame();
    });
    // Stop key events leaking to Phaser while typing
    this.inputEl?.addEventListener("keydown", (e) => e.stopPropagation());
    setTimeout(() => this.inputEl?.focus(), 80);

    // Load GitHub buttons script once so the star button renders (it scans DOM on load)
    if (!document.getElementById("gh-buttons-script")) {
      const s = document.createElement("script");
      s.id = "gh-buttons-script";
      s.async = true;
      s.defer = true;
      s.src = "https://buttons.github.io/buttons.js";
      document.head.appendChild(s);
    } else {
      // If script already present & exposes a re-render helper, attempt to re-run (fails silently otherwise)
      try {
        (window as any).GitHubButton?.renderAll?.();
      } catch {
        /* ignore */
      }
    }
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
    }, 30000);
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
    if (!this.statusEl) return;
    this.statusEl.textContent = msg;
    this.statusEl.classList.toggle("error", kind === "error");
  }

  private addInfo(msg: string) {
    this.infoMessages.push(msg);
    if (this.infoMessages.length > 3)
      this.infoMessages = this.infoMessages.slice(-3);
    this.renderInfo();
  }

  private renderInfo() {
    if (!this.infoEl) return;
    this.infoEl.textContent = "";
    const wrap = document.createElement("div");
    wrap.className = "info-log-list";
    this.infoMessages.forEach((item) => {
      const line = document.createElement("div");
      line.className = "info-item";
      line.textContent = item;
      wrap.appendChild(line);
    });
    this.infoEl.appendChild(wrap);
  }

  private setBusy(isBusy: boolean) {
    if (this.generateBtn) this.generateBtn.disabled = isBusy;
    if (this.defaultBtn) this.defaultBtn.disabled = isBusy;
    if (isBusy && this.generateBtn) {
      this.generateBtn.dataset.originalText =
        this.generateBtn.textContent || "";
      this.generateBtn.textContent = "Generating…";
    } else if (
      !isBusy &&
      this.generateBtn &&
      this.generateBtn.dataset.originalText
    ) {
      this.generateBtn.textContent = this.generateBtn.dataset.originalText;
      delete this.generateBtn.dataset.originalText;
    }
  }

  private startGame() {
    // Clean up DOM overlay
    this.overlayRoot?.remove();
    this.overlayRoot = undefined;
    this.scene.start("main");
  }
}
