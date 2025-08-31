import Phaser from "phaser";
import { MainScene } from "./scenes/MainScene";
import { SplashScene } from "./scenes/SplashScene";
import { WS_URL, logConfigOnce } from "./config";

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
    ws.addEventListener("message", (msg) => {
      // eslint-disable-next-line no-console
      console.log("[ws] message", msg.data);
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[ws] failed to initiate", e);
  }
}

connectWebSocket();
