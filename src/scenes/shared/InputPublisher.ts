import Phaser from "phaser";
import { setInputSnapshot } from "../../clientState";
import type { MobileControls } from "./MobileControls";

export class InputPublisher {
  private scene: Phaser.Scene;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private inputKeys!: Record<string, Phaser.Input.Keyboard.Key>;
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private mobile?: MobileControls;

  constructor(scene: Phaser.Scene, mobile?: MobileControls) {
    this.scene = scene;
    this.mobile = mobile;
    const kb = this.scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.inputKeys = kb.addKeys({ W: "W", A: "A", S: "S", D: "D" }) as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  update() {
    const keysDown = new Set<string>();
    const captureKey = (k?: Phaser.Input.Keyboard.Key, name?: string) => {
      if (k && k.isDown && name) keysDown.add(name);
    };
    const c = this.cursors;
    captureKey(c.up, "ArrowUp");
    captureKey(c.down, "ArrowDown");
    captureKey(c.left, "ArrowLeft");
    captureKey(c.right, "ArrowRight");
    captureKey(this.inputKeys?.W, "W");
    captureKey(this.inputKeys?.A, "A");
    captureKey(this.inputKeys?.S, "S");
    captureKey(this.inputKeys?.D, "D");
    captureKey(this.spaceKey, "SPACE");

    let joystick = { x: 0, y: 0 };
    if (this.mobile) {
      const m = this.mobile.snapshot();
      // merge FIRE
      m.keysDown.forEach((k) => keysDown.add(k));
      joystick = m.joystick;
    }

    setInputSnapshot({ keysDown, joystick });
  }
}
