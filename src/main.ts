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
import { createRouter, parseMessage } from "./net/messages";
import { setScoreboard } from "./clientState";

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
  logConfigOnce();
  const ws = new WebSocket(WS_URL);
  (window as any).ws = ws; // expose for debugging in console

  const router = createRouter({
    connected: (msg) => setClientId(msg.payload.id),
    info: (msg) => {
      // eslint-disable-next-line no-console
      console.log("[ws][info]", msg.payload);
      window.dispatchEvent(new CustomEvent("ws-info", { detail: msg.payload }));
    },
    shipQuota: (msg) => {
      // Broadcast quota updates so Splash UI can update the Generate button.
      (window as any).SHIP_QUOTA = msg.payload; // debug
      window.dispatchEvent(
        new CustomEvent("ws-shipQuota", { detail: msg.payload })
      );
    },
    gameState: (msg) => {
      updateRemoteShips(msg.payload.ships as any);
      updateProjectiles(msg.payload.projectiles as any);
    },
    scoreboard: (msg) => {
      setScoreboard(msg.payload.items as any);
      window.dispatchEvent(
        new CustomEvent("ws-scoreboard", { detail: msg.payload })
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
  ws.addEventListener("message", (ev: MessageEvent) => {
    const parsed = parseMessage(ev.data);
    if (!parsed) return console.log("[ws][unparseable]", ev.data);
    router.dispatch(parsed);
  });

  // Periodically send just the player input snapshot (30 Hz). Server will derive ship state.
  const INPUT_SEND_HZ = 30;
  const interval = setInterval(() => {
    const id = getClientId();
    if (!id || ws.readyState !== WebSocket.OPEN) return;
    const input = getInputSnapshot();
    if (!input) return;
    ws.send(
      JSON.stringify({
        type: "inputSnapshot",
        payload: {
          keysDown: Array.from(input.keysDown),
          joystick: { x: input.joystick.x, y: input.joystick.y },
        },
      })
    );
  }, 1000 / INPUT_SEND_HZ);
  ws.addEventListener("close", () => clearInterval(interval));
}

connectWebSocket();
