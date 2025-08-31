// Shared game-related TypeScript types for server <-> client messages

// A single ship's physical state
export interface ShipPhysicsState {
  position: { x: number; y: number };
  rotation: number; // radians (server assumed to send radians; convert if needed)
}

// Visual / appearance metadata for a ship
export interface ShipAppearanceState {
  shipImageUrl?: string; // Fully-qualified image URL for this ship's texture
}

export interface ShipState {
  physics: ShipPhysicsState;
  appearance?: ShipAppearanceState;
}

// Top-level game state snapshot pushed by server
export interface GameState {
  ships: Record<string, ShipState>;
}

// Generic server message wrapper
export interface ServerMessage<T = unknown> {
  type: string;
  payload: T;
}
