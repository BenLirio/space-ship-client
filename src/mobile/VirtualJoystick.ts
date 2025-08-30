import Phaser from "phaser";

// Lightweight virtual joystick for mobile landscape input.
export class VirtualJoystick {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Graphics;
  private thumb: Phaser.GameObjects.Graphics;
  private pointerId: number | null = null;
  private _active = false;
  private center = new Phaser.Math.Vector2();
  private current = new Phaser.Math.Vector2();
  private radius: number;

  constructor(scene: Phaser.Scene, x: number, y: number, radius = 70) {
    this.scene = scene;
    this.radius = radius;
    this.center.set(x, y);
    this.current.copy(this.center);
    this.base = scene.add.graphics();
    this.thumb = scene.add.graphics();
    this.base.setScrollFactor(0, 0);
    this.thumb.setScrollFactor(0, 0);
    this.base.setDepth(1000);
    this.thumb.setDepth(1001);
    this.drawBase();
    this.drawThumb(this.center.x, this.center.y);
    const input = scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this);
  }

  destroy() {
    this.base.destroy();
    this.thumb.destroy();
    this.scene.input.off(
      Phaser.Input.Events.POINTER_DOWN,
      this.handleDown,
      this
    );
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    this.scene.input.off(
      Phaser.Input.Events.POINTER_MOVE,
      this.handleMove,
      this
    );
  }

  private drawBase() {
    this.base.clear();
    this.base.fillStyle(0x0d0d19, 0.35);
    this.base.fillCircle(this.center.x, this.center.y, this.radius);
    this.base.lineStyle(2, 0x444a66, 0.7);
    this.base.strokeCircle(this.center.x, this.center.y, this.radius);
  }

  private drawThumb(x: number, y: number) {
    this.thumb.clear();
    this.thumb.fillStyle(0x2c5d9b, 0.5);
    this.thumb.fillCircle(x, y, this.radius * 0.35);
    this.thumb.lineStyle(2, 0x6aa8ff, 0.9);
    this.thumb.strokeCircle(x, y, this.radius * 0.35);
  }

  private handleDown(pointer: Phaser.Input.Pointer) {
    if (this.pointerId === null) {
      const dist = Phaser.Math.Distance.Between(
        pointer.x,
        pointer.y,
        this.center.x,
        this.center.y
      );
      if (dist <= this.radius * 1.1) {
        this.pointerId = pointer.id;
        this._active = true;
        this.updateThumb(pointer.x, pointer.y);
      }
    }
  }

  private handleUp(pointer: Phaser.Input.Pointer) {
    if (pointer.id === this.pointerId) {
      this.pointerId = null;
      this._active = false;
      this.updateThumb(this.center.x, this.center.y);
    }
  }

  private handleMove(pointer: Phaser.Input.Pointer) {
    if (pointer.id === this.pointerId) {
      this.updateThumb(pointer.x, pointer.y);
    }
  }

  private updateThumb(x: number, y: number) {
    const v = new Phaser.Math.Vector2(x - this.center.x, y - this.center.y);
    if (v.length() > this.radius) v.setLength(this.radius);
    this.current.set(this.center.x + v.x, this.center.y + v.y);
    this.drawThumb(this.current.x, this.current.y);
  }

  get active() {
    return this._active;
  }
  get strength() {
    const dist = Phaser.Math.Distance.Between(
      this.current.x,
      this.current.y,
      this.center.x,
      this.center.y
    );
    return Phaser.Math.Clamp(dist / this.radius, 0, 1);
  }
  get angle() {
    // Phaser angle where 0 is right, increases counter-clockwise
    return Phaser.Math.Angle.Between(
      this.center.x,
      this.center.y,
      this.current.x,
      this.current.y
    );
  }
}
