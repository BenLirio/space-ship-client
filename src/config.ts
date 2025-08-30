// Centralized client configuration
// Update the defaults here OR provide a Vite env var `VITE_GENERATE_SHIP_URL`.
// Prod builds (vite build) will use the prod default unless overridden.

// Default endpoints
const LOCAL_GENERATE_SHIP_URL = "http://localhost:3000/generate-space-ship";
const PROD_GENERATE_SHIP_URL =
  "https://9rc13jr0p2.execute-api.us-east-1.amazonaws.com/generate-space-ship";

// Resolve from environment with sensible fallbacks
export const GENERATE_SHIP_URL: string =
  (import.meta.env.VITE_GENERATE_SHIP_URL as string | undefined)?.trim() ||
  (import.meta.env.PROD ? PROD_GENERATE_SHIP_URL : LOCAL_GENERATE_SHIP_URL);

export const config = {
  generateShipUrl: GENERATE_SHIP_URL,
};

// Helper for logging current config (optional usage)
export function logConfigOnce() {
  if ((window as any).__CONFIG_LOGGED__) return;
  (window as any).__CONFIG_LOGGED__ = true;
  // eslint-disable-next-line no-console
  console.log("[config] generateShipUrl=", GENERATE_SHIP_URL);
}
