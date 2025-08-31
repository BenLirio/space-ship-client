import Phaser from "phaser";

// Input structure for arcade movement
export interface ArcadeInput {
  cursors: Phaser.Types.Input.Keyboard.CursorKeys; // retained though not heavily used here
  keys: Record<string, Phaser.Input.Keyboard.Key>; // W A D
}

export interface MovementConfig {
  baseSpeed: number; // forward speed when holding W or joystick
  rotationSpeed: number; // radians per second for A/D (desktop)
}
