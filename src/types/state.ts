// Central shared state-related types

export interface RemoteShipSnapshot {
  physics: { position: { x: number; y: number }; rotation: number };
  appearance?: { shipImageUrl?: string };
  // New: health percentage [0..100]
  health?: number;
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
