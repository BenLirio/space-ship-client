import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import { SplashScene } from "./scenes/SplashScene";
import { WS_URL, logConfigOnce } from "./config";
import {
  setClientId,
  updateRemoteShips,
  getClientId,
  getInputSnapshot,
  updateProjectiles,
} from "./clientState";
import { ScoreboardPayload } from "./types/websocket";
import { updateScoreboard } from "./clientState";
import { createRouter, parseMessage } from "./net/messages";

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
    // Structured server message type imported from types

    const router = createRouter({
      connected: (msg) => {
        setClientId(msg.payload.id);
      },
      info: (msg) => {
        // eslint-disable-next-line no-console
        console.log("[ws][info]", msg.payload);
        window.dispatchEvent(
          new CustomEvent("ws-info", { detail: msg.payload })
        );
      },
      gameState: (msg) => {
        updateRemoteShips(msg.payload.ships as any);
        updateProjectiles(msg.payload.projectiles as any);
      },
      scoreboard: (msg) => {
        const payload = msg.payload as ScoreboardPayload;
        updateScoreboard(payload.items as any);
        window.dispatchEvent(
          new CustomEvent("ws-scoreboard", { detail: payload.items })
        );
      },
      error: (msg) => {
        // eslint-disable-next-line no-console
        console.error("[ws][error]", msg.payload);
        window.dispatchEvent(
          new CustomEvent("ws-error", { detail: msg.payload })
        );
      },
    });

    function handleServerMessage(ev: MessageEvent) {
      const parsed = parseMessage(ev.data);
      if (!parsed) {
        // eslint-disable-next-line no-console
        console.log("[ws][unparseable]", ev.data);
        return;
      }
      router.dispatch(parsed);
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

    // Periodically send just the player input snapshot (30 Hz). Server will derive ship state.
    const INPUT_SEND_HZ = 30;
    const interval = setInterval(() => {
      const id = getClientId();
      if (!id || ws.readyState !== WebSocket.OPEN) return;
      try {
        const input = getInputSnapshot();
        if (input) {
          ws.send(
            JSON.stringify({
              type: "inputSnapshot",
              payload: {
                keysDown: Array.from(input.keysDown),
                joystick: { x: input.joystick.x, y: input.joystick.y },
              },
            })
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[ws] failed to send inputSnapshot", e);
      }
    }, 1000 / INPUT_SEND_HZ);

    ws.addEventListener("close", () => clearInterval(interval));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ws] failed to initiate", e);
  }
}

connectWebSocket();
