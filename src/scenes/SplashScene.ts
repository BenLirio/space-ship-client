import Phaser from "phaser";
import { preloadShip } from "../ship/ship";
import { logConfigOnce } from "../config";
import { subscribe, getClientId, getRemoteShips } from "../clientState";

export class SplashScene extends Phaser.Scene {
  private overlayRoot?: HTMLDivElement; // Entire splash UI (responsive DOM)
  private inputEl?: HTMLInputElement;
  private generateBtn?: HTMLButtonElement;
  private defaultBtn?: HTMLButtonElement;
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
    this.injectStylesOnce();
    this.buildOverlay();
    // Rerun layout on phaser resize & window resize (covers mobile chrome show/hide)
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
          <p class="splash-sub">Enter a prompt to generate your ship<br><span class="splash-sub-alt">or start with the default</span></p>
          <div class="gh-star-wrap">
            <!-- GitHub star button -->
            <a class="github-button" href="https://github.com/BenLirio/space-ship-generator" data-color-scheme="no-preference: light; light: light; dark: dark;" data-icon="octicon-star" data-size="large" aria-label="Star BenLirio/space-ship-generator on GitHub">Star</a>
            <a class="discord-link" href="https://discord.com/invite/F69uzFtgpT" target="_blank" rel="noopener" aria-label="Join our Discord (opens in new tab)">Join our Discord</a>
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

  private injectStylesOnce() {
    if (document.getElementById("splash-styles")) return;
    const style = document.createElement("style");
    style.id = "splash-styles";
    style.textContent = `
  :root { --app-vh: 1vh; }
  html, body { box-sizing:border-box; }
  *,*::before,*::after { box-sizing:inherit; }
  .splash-overlay { position: fixed; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:calc(env(safe-area-inset-top,0) + 2.5vh) clamp(12px,3vw,48px) calc(env(safe-area-inset-bottom,0) + 2.5vh); pointer-events:auto; z-index:1500; font-family:system-ui,sans-serif; overflow:hidden; }
  .splash-stack { width: min(760px, 100%); max-width:100%; display:flex; flex-direction:column; gap:clamp(16px,2.5vh,40px); align-items:stretch; }
      .splash-header { text-align:center; line-height:1.1; padding:0 4px; }
      .splash-title { margin:0; font-weight:600; font-size:clamp(40px,10vw,92px); letter-spacing:0.02em; background:linear-gradient(90deg,#fff,#b2dcff 55%,#60b5ff); -webkit-background-clip:text; color:transparent; }
      .splash-sub { margin:0; font-size:clamp(14px,2.4vw,24px); color:#b9c6d1; font-weight:400; }
      .splash-sub-alt { opacity:.65; }
  .gh-star-wrap { margin-top:14px; display:flex; justify-content:center; }
  .gh-star-wrap { gap:14px; flex-wrap:wrap; }
  .gh-star-wrap .discord-link { display:inline-flex; align-items:center; font-size:14px; line-height:1; padding:8px 14px; border-radius:999px; background:#5865F2; color:#fff; text-decoration:none; font-weight:500; letter-spacing:.3px; border:1px solid #4653c5; box-shadow:0 2px 6px -2px rgba(0,0,0,.5); transition:background .2s, transform .2s; }
  .gh-star-wrap .discord-link:hover { background:#6d79ff; }
  .gh-star-wrap .discord-link:active { transform:translateY(2px); }
  .splash-form { display:flex; flex-direction:column; gap:12px; background:rgba(12,18,28,.55); border:1px solid rgba(120,160,200,.18); padding:clamp(10px,1.8vw,18px); backdrop-filter:blur(18px) saturate(150%); border-radius:16px; box-shadow:0 6px 30px -8px rgba(0,0,0,.55); width:100%; max-width:100%; }
  .splash-form input { width:100%; max-width:100%; padding:14px 16px; font-size:clamp(14px,1.9vw,18px); background:#0b131d; color:#fff; border:1px solid #284056; border-radius:12px; outline:none; font-family:inherit; transition:border-color .18s, background .18s; }
      .splash-form input:focus { border-color:#4da3ff; background:#0e1824; box-shadow:0 0 0 3px rgba(77,163,255,.28); }
      .button-row { display:flex; flex-wrap:wrap; gap:12px; }
      .button-row button { flex:1 1 220px; position:relative; display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 18px; font-size:clamp(14px,1.9vw,18px); border-radius:12px; cursor:pointer; font-weight:500; line-height:1; border:1px solid; letter-spacing:.5px; background:#17324c; color:#fff; border-color:#2c4d6c; transition:background .2s,border-color .2s, transform .2s; }
      .button-row button.primary { background:linear-gradient(135deg,#1b67c9,#2685ff); border-color:#1a5aa8; }
      .button-row button.secondary { background:#17324c; }
      .button-row button:hover:not([disabled]) { filter:brightness(1.15); }
      .button-row button:active:not([disabled]) { transform:translateY(2px); }
      .button-row button[disabled] { opacity:.55; cursor:default; }
  .status { min-height:0; font-size:12px; color:#9fb9c9; font-family:inherit; letter-spacing:.5px; }
  .status:empty { display:none; }
      .visually-hidden { position:absolute !important; height:1px; width:1px; overflow:hidden; clip:rect(1px,1px,1px,1px); white-space:nowrap; }
      @media (max-width:640px) { .splash-form { padding:20px 18px; gap:14px; }.splash-header { margin-bottom:4px; } }
      @media (max-height:600px) { .splash-stack { gap:12px; } .splash-title { font-size:clamp(34px,8vw,68px); } }
    `;
    document.head.appendChild(style);
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
      this.generatedImageUrl = mine.appearance.shipImageUrl;
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
    this.scene.start("main", {
      shipImageUrl: this.generatedImageUrl,
    });
  }
}
