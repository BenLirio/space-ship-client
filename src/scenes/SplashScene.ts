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
  // Rerun layout on resize and orientation changes
    this.scale.on("resize", () => this.layout(), this);
    window.addEventListener("resize", this.onWindowResize);
    window.addEventListener("orientationchange", this.onWindowResize);
    this.layout();
  }

  private buildOverlay() {
    const root = document.createElement("div");
    root.className = "splash-overlay";
    root.innerHTML = `
      <div class="splash-stack" role="dialog" aria-labelledby="splash-title">
        <header class="splash-header">
          <h1 id="splash-title" class="splash-title">AI SPACESHIP</h1>
          <p class="splash-sub">Generate your unique ship with a prompt<br><span class="splash-sub-alt">and fly around with others in realtime</span></p>
          <div class="gh-star-wrap">
            <!-- GitHub star button -->
            <a class="github-button" href="https://github.com/BenLirio/space-ship-generator" data-color-scheme="no-preference: light; light: light; dark: dark;" data-icon="octicon-star" data-size="large" data-show-count="true" aria-label="Star BenLirio/space-ship-generator on GitHub">Star</a>
            <a class="discord-link" href="https://discord.com/invite/F69uzFtgpT" target="_blank" rel="noopener" aria-label="Join our Discord (opens in new tab)">Join our Discord</a>
            <a class="banana-link" href="https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/" target="_blank" rel="noopener" aria-label="Model info (opens in new tab)">🍌 uses nano banana</a>
          </div>
        </header>
        <form class="splash-form" autocomplete="off">
          <label class="visually-hidden" for="shipPrompt">Ship prompt</label>
          <input id="shipPrompt" name="shipPrompt" type="text" inputmode="text" placeholder="e.g. Sleek explorer with blue thrusters" />
          <div class="button-row">
            <button type="submit" class="primary" data-action="generate">Generate Ship</button>
            <button type="button" class="secondary" data-action="default">Start with Default</button>
          </div>
          <div class="status" aria-live="polite"></div>
        </form>
      </div>`;
    document.body.appendChild(root);
    this.overlayRoot = root;
    this.inputEl =
      root.querySelector<HTMLInputElement>("#shipPrompt") || undefined;
    this.generateBtn =
      root.querySelector<HTMLButtonElement>("button[data-action=generate]") ||
      undefined;
    this.defaultBtn =
      root.querySelector<HTMLButtonElement>("button[data-action=default]") ||
      undefined;
    this.statusEl = root.querySelector<HTMLDivElement>(".status") || undefined;

    // Events
    const form = root.querySelector("form")!;
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

  private onWindowResize = () => this.layout();

  private layout() {
    if (!this.overlayRoot) return;
    // Use JS only for CSS var that tracks innerHeight (browser UI chrome changes)
    document.documentElement.style.setProperty(
      "--app-vh",
      `${window.innerHeight * 0.01}px`
    );
  }

  private notifyStartWithDefault() {
    try {
      const ws: WebSocket | undefined = (window as any).ws;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "startWithDefault" }));
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("failed to send startWithDefault", e);
    }
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
      this.setBusy(true);
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
          this.setBusy(false);
        }
      }, 30000);
    } catch (e: any) {
      this.status("Failed to send prompt: " + (e.message || e));
      this.generateInFlight = false;
      this.setBusy(false);
    }
  }

  private onWsInfo = (ev: CustomEvent) => {
    if (!this.awaitingShip) return; // ignore after done
    const msg = ev.detail;
    if (typeof msg === "string") {
      // Log info to console only (no UI update) per request
      // eslint-disable-next-line no-console
      console.log("info:", msg);
    }
  };

  private onWsError = (ev: CustomEvent) => {
    const msg = ev.detail;
    this.status("Error: " + msg);
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
    if (mine && mine.appearance?.shipImageUrl) {
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

  private status(msg: string) {
    if (this.statusEl) this.statusEl.textContent = msg;
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
    window.removeEventListener("resize", this.onWindowResize);
    window.removeEventListener("orientationchange", this.onWindowResize);
    if (this.overlayRoot) {
      this.overlayRoot.remove();
      this.overlayRoot = undefined;
    }
    this.scene.start("main");
  }
}
