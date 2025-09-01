import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import { SplashScene } from "./scenes/SplashScene";
import { WS_URL, logConfigOnce } from "./config";
import {
  setClientId,
  updateRemoteShips,
  getClientId,
  getInputSnapshot,
} from "./clientState";
import { ServerMessage } from "./types/websocket";

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
            // Expect payload shape: { id: string }
            const id = (msg.payload as any)?.id;
            if (typeof id === "string" && id) {
              setClientId(id);
            } else {
              // eslint-disable-next-line no-console
              console.warn(
                "[ws][connected] missing id in payload",
                msg.payload
              );
            }
            break;
          }
          case "info": {
            // eslint-disable-next-line no-console
            console.log("[ws][info]", msg.payload);
            break;
          }
          case "gameState": {
            const ships = (msg.payload as any)?.ships;
            if (ships && typeof ships === "object") {
              updateRemoteShips(ships as any);
            }
            break;
          }
          case "error": {
            // eslint-disable-next-line no-console
            console.error("[ws][error]", msg.payload);
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
