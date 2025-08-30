import Phaser from "phaser";

// Input structure for arcade movement
export interface ArcadeInput {
  cursors: Phaser.Types.Input.Keyboard.CursorKeys; // retained though not heavily used here
  keys: Record<string, Phaser.Input.Keyboard.Key>; // W A D SHIFT SPACE
}

export interface MovementConfig {
  baseSpeed: number; // forward speed when holding W
  boostMultiplier: number; // shift multiplier
  rotationSpeed: number; // radians per second for A/E
  dashSpeed: number; // dash velocity magnitude
  dashCooldownMs: number; // dash cooldown
}

export function preloadShip(scene: Phaser.Scene) {
  // Generate a lightweight procedural texture for a simple triangle ship
  const gfx = scene.make.graphics({ x: 0, y: 0 });
  const size = 40;
  gfx.fillStyle(0xffffff, 1);
  gfx.beginPath();
  gfx.moveTo(0, size / 2);
  gfx.lineTo(size, size / 2);
  gfx.lineTo(size / 2, 0);
  gfx.closePath();
  gfx.fillPath();
  gfx.generateTexture("ship", size, size);
  gfx.destroy();
}

export function createShipSprite(
  scene: Phaser.Scene,
  x: number,
  y: number,
  textureKey = "ship"
) {
  const sprite = scene.physics.add.sprite(x, y, textureKey);
  sprite.setOrigin(0.5, 0.35); // forward bias
  sprite.setDamping(true);
  sprite.setDrag(0.98);
  sprite.setMaxVelocity(600, 600);
  // Apply standard scale (only scales down large textures)
  applyStandardShipScale(sprite);
  return sprite;
}

// Target dimension (largest side) in world pixels for the ship.
// All ship textures will be uniformly scaled (up or down) so their largest dimension equals this.
export const SHIP_TARGET_MAX_SIZE = 96; // doubled from previous 48

export function applyStandardShipScale(
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
) {
  const tex = sprite.texture;
  if (!tex) return;
  const frame = tex.get();
  const w = frame.width;
  const h = frame.height;
  const maxDim = Math.max(w, h) || 1;
  const scale = SHIP_TARGET_MAX_SIZE / maxDim;
  sprite.setScale(scale);
}

// Dynamically load a PNG from a URL into the texture manager under a stable key.
// Returns a Promise that resolves with the (possibly new) texture key to use.
export async function loadExternalShipTexture(
  scene: Phaser.Scene,
  url: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const key = "ship-external"; // overwrite prior external for simplicity
    // If key already exists and same URL, resolve immediately (no cache-bust logic here)
    // We'll just reload always to allow updating.
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }

    // Use Phaser's Loader for cross-origin images (assuming server allows it)
    scene.load.image(key, url);
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
      if (scene.textures.exists(key)) {
        resolve(key);
      } else {
        reject(new Error("Failed to load ship texture"));
      }
    });
    scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: any) => {
      reject(new Error(`Failed to load: ${file?.src || url}`));
    });
    scene.load.start();
  });
}

let lastDashTime = 0;

export function updateShip(
  scene: Phaser.Scene,
  ship: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody,
  input: ArcadeInput,
  cfg: MovementConfig,
  delta: number
) {
  const dt = delta / 1000;
  const { keys } = input;

  // Rotation via A (left) and D (right)
  if (keys.A?.isDown) {
    ship.rotation -= cfg.rotationSpeed * dt;
  } else if (keys.D?.isDown) {
    ship.rotation += cfg.rotationSpeed * dt;
  }

  // Forward thrust (no inertia heavy sim) when W is held
  const forwardHeld = keys.W?.isDown;
  const boosting = keys.SHIFT?.isDown;
  const speed = cfg.baseSpeed * (boosting ? cfg.boostMultiplier : 1);
  if (forwardHeld) {
    // Ship graphic points up; forward direction is rotation - 90deg
    const angle = ship.rotation - Math.PI / 2;
    ship.body.velocity.x = Math.cos(angle) * speed;
    ship.body.velocity.y = Math.sin(angle) * speed;
  } else {
    // Quick deceleration for responsive stop
    ship.body.velocity.scale(0.85);
  }

  // Dash straight forward (SPACE)
  const space = keys.SPACE;
  const now = scene.time.now;
  if (
    space &&
    Phaser.Input.Keyboard.JustDown(space) &&
    now - lastDashTime >= cfg.dashCooldownMs
  ) {
    lastDashTime = now;
    const dashAngle = ship.rotation - Math.PI / 2;
    scene.physics.velocityFromRotation(
      dashAngle,
      cfg.dashSpeed,
      ship.body.velocity
    );
  }
}
