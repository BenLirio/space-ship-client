import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import { SplashScene } from "./scenes/SplashScene";
import { WS_URL, logConfigOnce } from "./config";
// Client state helpers (optional import locations for other modules)
import { CLIENT_ID_EVENT } from "./clientState";
import type { ServerMessage, GameState } from "./types/game";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  backgroundColor: "#000000",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [SplashScene, MainScene],
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const game = new Phaser.Game(config);

// Establish a simple WebSocket connection on page load for backend integration.
function connectWebSocket() {
  try {
    logConfigOnce();
    const ws = new WebSocket(WS_URL);
    (window as any).ws = ws; // expose for debugging in console
    function handleServerMessage(ev: MessageEvent) {
      const raw = ev.data;
      // Attempt to parse JSON if it's a string; otherwise treat as already-parsed
      let parsed: unknown = raw;
      if (typeof raw === "string") {
        try {
          parsed = JSON.parse(raw);
        } catch {
          // eslint-disable-next-line no-console
          console.log("[ws][unparseable]", raw);
          return;
        }
      }
      // Validate shape
      if (
        parsed &&
        typeof parsed === "object" &&
        typeof (parsed as { type?: unknown }).type === "string"
      ) {
        const msg = parsed as ServerMessage;
        switch (msg.type) {
          case "connected": {
            const id = (msg.payload as any)?.id;
            if (typeof id === "string" && id.length) {
              (window as any).__CLIENT_ID__ = id;
              // Fire a lightweight event so game scenes / other modules can react.
              window.dispatchEvent(
                new CustomEvent<string>(CLIENT_ID_EVENT, { detail: id })
              );
              // eslint-disable-next-line no-console
              console.log("[ws][connected] id=", id);
            } else {
              // eslint-disable-next-line no-console
              console.warn("[ws][connected][invalid-payload]", msg.payload);
            }
            break;
          }
          case "info": {
            // eslint-disable-next-line no-console
            console.log("[ws][info]", msg.payload);
            break;
          }
          case "error": {
            // eslint-disable-next-line no-console
            console.error("[ws][error]", msg.payload);
            break;
          }
          case "gameState": {
            const gs = msg.payload as GameState;
            // Basic shape guard
            if (gs && typeof gs === "object" && (gs as any).ships) {
              // Dispatch a DOM CustomEvent so scenes (which may reload) can listen without tight coupling
              window.dispatchEvent(
                new CustomEvent<GameState>("gameState", { detail: gs })
              );
            }
            break;
          }
          default: {
            // eslint-disable-next-line no-console
            console.log("[ws][message]", msg);
          }
        }
      } else {
        // eslint-disable-next-line no-console
        console.log("[ws][unstructured]", raw);
      }
    }
    ws.addEventListener("open", () => {
      // eslint-disable-next-line no-console
      console.log("[ws] open ->", WS_URL);
    });
    ws.addEventListener("close", (ev) => {
      // eslint-disable-next-line no-console
      console.log("[ws] close", ev.code, ev.reason || "");
    });
    ws.addEventListener("error", (err) => {
      // eslint-disable-next-line no-console
      console.log("[ws] error", err);
    });
    ws.addEventListener("message", handleServerMessage);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ws] failed to initiate", e);
  }
}

connectWebSocket();
