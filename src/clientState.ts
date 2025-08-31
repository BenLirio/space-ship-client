// Centralized helpers for ephemeral client-specific state (e.g., assigned WebSocket id)

export const CLIENT_ID_EVENT = "clientId"; // CustomEvent<string>

// Returns current client id if already received from server
export function getClientId(): string | undefined {
  return (window as any).__CLIENT_ID__ as string | undefined;
}

// Await the client id (resolves immediately if already present)
export function waitForClientId(timeoutMs = 10000): Promise<string> {
  const existing = getClientId();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      window.removeEventListener(CLIENT_ID_EVENT, handler as any);
      reject(new Error("Timed out waiting for client id"));
    }, timeoutMs);
    function handler(ev: Event) {
      clearTimeout(to);
      const detail = (ev as CustomEvent<string>).detail;
      resolve(detail);
    }
    window.addEventListener(CLIENT_ID_EVENT, handler as any, { once: true });
  });
}
