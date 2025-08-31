// Centralized ephemeral client-side state (WebSocket-related)
// Stores the server-assigned client id after receiving a `connected` message.

let _clientId: string | undefined;

// Map of remote ship id -> snapshot
export interface RemoteShipSnapshot {
  physics: { position: { x: number; y: number }; rotation: number };
  appearance?: { shipImageUrl?: string };
}

let _remoteShips: Record<string, RemoteShipSnapshot> = {};
let _localShipImageUrl: string | undefined;
let _localShipAccessor:
  | (() => { position: { x: number; y: number }; rotation: number })
  | undefined;

type Listener = () => void;
const listeners = new Set<Listener>();

export function setClientId(id: string) {
  _clientId = id;
  (window as any).CLIENT_ID = id; // expose for quick console debugging
  // eslint-disable-next-line no-console
  console.log("[client] id set", id);
  notify();
}

export function getClientId(): string | undefined {
  return _clientId;
}

export function updateRemoteShips(ships: Record<string, RemoteShipSnapshot>) {
  _remoteShips = ships;
  notify();
}

export function getRemoteShips() {
  return _remoteShips;
}

export function setLocalShipImageUrl(url: string) {
  _localShipImageUrl = url;
  notify();
}

export function getLocalShipImageUrl() {
  return _localShipImageUrl;
}

export function setLocalShipAccessor(
  fn: () => { position: { x: number; y: number }; rotation: number }
) {
  _localShipAccessor = fn;
}

export function getLocalShipAccessor() {
  return _localShipAccessor;
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("listener error", e);
    }
  });
}
