// Centralized ephemeral client-side state (WebSocket-related)
// Stores the server-assigned client id after receiving a `connected` message.
import {
  RemoteShipSnapshot,
  Listener,
  InputSnapshot,
  ProjectileSnapshot,
} from "./types/state";

let _clientId: string | undefined;
// Map of remote ship id -> snapshot
let _remoteShips: Record<string, RemoteShipSnapshot> = {};
let _inputSnapshot: InputSnapshot | undefined;
// Map projectile id -> projectile snapshot
let _projectiles: Record<string, ProjectileSnapshot> = {};

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

// Removed local ship image URL cache (server snapshot is the source of truth)

export function setInputSnapshot(s: InputSnapshot) {
  _inputSnapshot = s;
}

export function getInputSnapshot(): InputSnapshot | undefined {
  return _inputSnapshot;
}

export function updateProjectiles(projectiles: ProjectileSnapshot[]) {
  // Rebuild map (server authoritative). Using object for O(1) access by id.
  const next: Record<string, ProjectileSnapshot> = {};
  projectiles.forEach((p) => {
    next[p.id] = p;
  });
  _projectiles = next;
  notify();
}

export function getProjectiles(): Record<string, ProjectileSnapshot> {
  return _projectiles;
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((l) => l());
}
