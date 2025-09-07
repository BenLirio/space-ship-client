// Central shared state-related types

export interface RemoteShipSnapshot {
  physics: { position: { x: number; y: number }; rotation: number };
  appearance: { shipImageUrl: string };
  // Health percentage [0..100]
  health: number;
  // Number of kills for this ship
  kills: number;
  // Display name for the ship (may be empty string)
  name: string;
}

export type Listener = () => void;

export interface InputSnapshot {
  keysDown: Set<string>;
  joystick: { x: number; y: number };
}

// Server-authoritative projectile snapshot
export interface ProjectileSnapshot {
  id: string;
  ownerId: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  rotation: number; // radians
  createdAt: number; // epoch ms
}

// Scoreboard data structures from server
export interface ScoreboardItem {
  id: string;
  name: string;
  score: number;
  shipImageUrl?: string;
}

export interface ScoreboardListResponse {
  items: ScoreboardItem[];
  count: number;
}
