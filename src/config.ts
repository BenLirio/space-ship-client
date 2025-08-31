// Centralized client configuration
// Update the defaults here OR provide a Vite env var `VITE_GENERATE_SHIP_URL`.
// Prod builds (vite build) will use the prod default unless overridden.

// Default endpoints
const LOCAL_GENERATE_SHIP_URL = "http://localhost:3000/generate-space-ship";
const PROD_GENERATE_SHIP_URL =
  "https://9rc13jr0p2.execute-api.us-east-1.amazonaws.com/generate-space-ship";

// WebSocket endpoints
// const LOCAL_WS_URL = "ws://localhost:8080"; // serverless-offline default
const LOCAL_WS_URL = "ws://localhost:8080"; // provided prod endpoint
const PROD_WS_URL = "wss://space-ship-socket.benlirio.com"; // provided prod endpoint

// Resolve from environment with sensible fallbacks
export const GENERATE_SHIP_URL: string =
  (import.meta.env.VITE_GENERATE_SHIP_URL as string | undefined)?.trim() ||
  (import.meta.env.PROD ? PROD_GENERATE_SHIP_URL : LOCAL_GENERATE_SHIP_URL);

export const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined)?.trim() ||
  (import.meta.env.PROD ? PROD_WS_URL : LOCAL_WS_URL);

export const config = {
  generateShipUrl: GENERATE_SHIP_URL,
  wsUrl: WS_URL,
};

// Helper for logging current config (optional usage)
export function logConfigOnce() {
  if ((window as any).__CONFIG_LOGGED__) return;
  (window as any).__CONFIG_LOGGED__ = true;
  // eslint-disable-next-line no-console
  console.log("[config] generateShipUrl=", GENERATE_SHIP_URL);
  // eslint-disable-next-line no-console
  console.log("[config] wsUrl=", WS_URL);
}
