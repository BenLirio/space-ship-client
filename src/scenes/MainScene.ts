import Phaser from "phaser";
import {
  preloadShip,
  createShipSprite,
  updateShip,
  ArcadeInput,
  loadExternalShipTexture,
  applyStandardShipScale,
} from "../ship/ship";

export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private ship!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private baseSpeed = 420; // forward speed (pixels/sec)
  private boostMultiplier = 1.6; // shift boost
  private rotationSpeed = Phaser.Math.DegToRad(250); // A / E rotation speed
  private inputState!: ArcadeInput;

  constructor() {
    super("main");
  }

  preload() {
    preloadShip(this);
  }

  create() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    const extraKeys = kb.addKeys({
      W: "W",
      A: "A",
      D: "D",
      SHIFT: "SHIFT",
      SPACE: "SPACE",
    }) as Record<string, Phaser.Input.Keyboard.Key>;

    this.inputState = {
      cursors: this.cursors, // kept for potential future use
      keys: extraKeys,
    };

    this.ship = createShipSprite(
      this,
      this.scale.width / 2,
      this.scale.height / 2,
      "ship"
    );

    this.scale.on("resize", () => {
      // Keep ship within bounds after resize
      this.wrapSprite(this.ship);
    });

    this.setupExternalShipLoader();
  }

  update(time: number, delta: number) {
    if (!this.areControlsSuppressed()) {
      updateShip(
        this,
        this.ship,
        this.inputState,
        {
          baseSpeed: this.baseSpeed,
          boostMultiplier: this.boostMultiplier,
          rotationSpeed: this.rotationSpeed,
          dashSpeed: this.baseSpeed * 2.2,
          dashCooldownMs: 550,
        },
        delta
      );
      this.constrainToScreen(this.ship);
    } else {
      // Damp movement while controls suppressed for predictability
      this.ship.body.velocity.scale(0.9);
    }
  }

  private constrainToScreen(sprite: Phaser.GameObjects.Sprite) {
    const padding = 16;
    const { width, height } = this.scale;
    if (sprite.x < -padding) sprite.x = width + padding;
    if (sprite.x > width + padding) sprite.x = -padding;
    if (sprite.y < -padding) sprite.y = height + padding;
    if (sprite.y > height + padding) sprite.y = -padding;
  }

  private wrapSprite(sprite: Phaser.GameObjects.Sprite) {
    this.constrainToScreen(sprite);
  }

  private setupExternalShipLoader() {
    const urlInput = document.getElementById(
      "ship-url"
    ) as HTMLInputElement | null;
    const loadForm = document.getElementById(
      "load-form"
    ) as HTMLFormElement | null;
    const promptInput = document.getElementById(
      "ship-prompt"
    ) as HTMLInputElement | null;
    const endpointInput = document.getElementById(
      "ship-generator-endpoint"
    ) as HTMLInputElement | null;
    const genForm = document.getElementById(
      "generate-form"
    ) as HTMLFormElement | null;
    const genBtn = document.getElementById(
      "generate-ship-btn"
    ) as HTMLButtonElement | null;
    const previewImg = document.getElementById(
      "ship-preview"
    ) as HTMLImageElement | null;
    const previewWrapper = document.getElementById(
      "preview-wrapper"
    ) as HTMLElement | null;
    const debug = document.getElementById("debug");
    if (endpointInput && !endpointInput.value) {
      endpointInput.value = "http://localhost:3000/generate-space-ship";
    }
    if (!urlInput || !loadForm) return;

    const loadHandler = async (url?: string) => {
      const candidate = (url || urlInput.value).trim();
      if (!candidate || !candidate.toLowerCase().endsWith(".png")) {
        debug && (debug.textContent = "Provide a direct .png URL");
        return;
      }
      debug && (debug.textContent = "Loading ship texture...\n" + candidate);
      try {
        const key = await loadExternalShipTexture(this, candidate);
        this.ship.setTexture(key);
        applyStandardShipScale(this.ship);
        debug &&
          (debug.textContent =
            (debug.textContent || "") + "\nLoaded custom ship!");
        if (previewImg && previewWrapper) {
          previewImg.src = candidate;
          previewWrapper.hidden = false;
        }
      } catch (e: any) {
        debug && (debug.textContent = e.message || "Load failed");
      }
    };
    loadForm.addEventListener("submit", (e) => {
      e.preventDefault();
      loadHandler();
    });

    if (genForm && promptInput && genBtn) {
      genForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const prompt = promptInput.value.trim();
        if (!prompt) {
          debug && (debug.textContent = "Enter a prompt first");
          return;
        }
        const endpoint = (
          endpointInput?.value.trim() ||
          "http://localhost:3000/generate-space-ship"
        ).replace(/\/$/, "");
        genBtn.disabled = true;
        genBtn.textContent = "Generating...";
        debug && (debug.textContent = `Generating ship ("${prompt}")...`);
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const dataText = await res.text();
          let data: any;
          try {
            data = JSON.parse(dataText);
          } catch {
            throw new Error("Invalid JSON response");
          }
          if (!res.ok) throw new Error(data?.message || `Status ${res.status}`);
          const imageUrl: string | undefined = data?.imageUrl;
          if (!imageUrl) throw new Error("No imageUrl field in response");
          urlInput.value = imageUrl;
          debug &&
            (debug.textContent =
              (debug.textContent || "") +
              "\nFetched image URL, downloading...");
          await loadHandler(imageUrl);
          debug &&
            (debug.textContent =
              (debug.textContent || "") + "\nGenerated ship loaded.");
        } catch (err: any) {
          debug &&
            (debug.textContent = "Generation failed: " + (err.message || err));
        } finally {
          genBtn.disabled = false;
          genBtn.textContent = "Generate Ship";
        }
      });
    }

    // Suppress controls while focusing inside panel
    // Nothing else needed: we'll inspect activeElement live in areControlsSuppressed()

    // Additionally, stop Phaser from processing keydown events originating in inputs.
    const inputs: HTMLInputElement[] = [];
    [urlInput, promptInput, endpointInput].forEach((el) => {
      if (el) inputs.push(el);
    });
    for (const el of inputs) {
      el.addEventListener(
        "keydown",
        (ev) => {
          // Prevent Phaser's global key manager from acting on these keys
          ev.stopPropagation();
        },
        { capture: true }
      );
      el.addEventListener(
        "keyup",
        (ev) => {
          ev.stopPropagation();
        },
        { capture: true }
      );
    }
  }
  private areControlsSuppressed() {
    const active = document.activeElement;
    if (!active) return false;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    )
      return true;
    const panel = document.getElementById("ui-panel");
    return !!(panel && panel.contains(active));
  }
}
