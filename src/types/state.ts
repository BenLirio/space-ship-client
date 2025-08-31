// Central shared state-related types

export interface RemoteShipSnapshot {
  physics: { position: { x: number; y: number }; rotation: number };
  appearance?: { shipImageUrl?: string };
}

export type Listener = () => void;

export interface InputSnapshot {
  keysDown: Set<string>;
  joystick: { x: number; y: number };
}
