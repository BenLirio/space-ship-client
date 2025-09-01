import Phaser from "phaser";

// Simple circular fire/shoot button for mobile. While pressed, `active` is true.
// It does not emit actual keyboard events; the scene inspects `active` and adds
// "SPACE" to the input snapshot so the server sees it like the SPACE key.
export class VirtualFireButton {
  private scene: Phaser.Scene;
  private base: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Graphics;
  private pointerId: number | null = null;
  private _active = false;
  private radius: number;
  private pos = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, x: number, y: number, radius = 60) {
    this.scene = scene;
    this.radius = radius;
    this.pos.set(x, y);
    this.base = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.base.setScrollFactor(0, 0).setDepth(1000);
    this.icon.setScrollFactor(0, 0).setDepth(1001);
    this.draw();

    const input = scene.input;
    input.on(Phaser.Input.Events.POINTER_DOWN, this.handleDown, this);
    input.on(Phaser.Input.Events.POINTER_UP, this.handleUp, this);
    input.on(Phaser.Input.Events.POINTER_MOVE, this.handleMove, this); // track leave
  }

  destroy() {
    this.base.destroy();
    this.icon.destroy();
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

  private draw() {
    this.base.clear();
    // Outer circle
    this.base.fillStyle(0x190d0d, 0.35);
    this.base.fillCircle(this.pos.x, this.pos.y, this.radius);
    this.base.lineStyle(2, 0x663c3c, 0.7);
    this.base.strokeCircle(this.pos.x, this.pos.y, this.radius);

    // Icon (stylized crosshair / burst). Change color when active.
    this.icon.clear();
    const mainColor = this._active ? 0xffc14d : 0xff884d;
    const alpha = this._active ? 0.95 : 0.75;
    this.icon.lineStyle(4, mainColor, alpha);
    const r = this.radius * 0.45;
    // Crosshair lines
    this.icon.beginPath();
    this.icon.moveTo(this.pos.x - r, this.pos.y);
    this.icon.lineTo(this.pos.x + r, this.pos.y);
    this.icon.moveTo(this.pos.x, this.pos.y - r);
    this.icon.lineTo(this.pos.x, this.pos.y + r);
    this.icon.strokePath();
    // Central circle
    this.icon.lineStyle(3, mainColor, alpha);
    this.icon.strokeCircle(this.pos.x, this.pos.y, r * 0.55);
  }

  private pointerWithin(pointer: Phaser.Input.Pointer) {
    const dist = Phaser.Math.Distance.Between(
      pointer.x,
      pointer.y,
      this.pos.x,
      this.pos.y
    );
    return dist <= this.radius * 1.05; // small breathing room
  }

  private handleDown(pointer: Phaser.Input.Pointer) {
    if (this.pointerId === null && this.pointerWithin(pointer)) {
      this.pointerId = pointer.id;
      this._active = true;
      this.draw();
    }
  }

  private handleUp(pointer: Phaser.Input.Pointer) {
    if (pointer.id === this.pointerId) {
      this.pointerId = null;
      this._active = false;
      this.draw();
    }
  }

  private handleMove(pointer: Phaser.Input.Pointer) {
    if (pointer.id === this.pointerId) {
      // If finger slides too far away, consider releasing (prevents stuck when user drags off)
      if (!this.pointerWithin(pointer)) {
        this.pointerId = null;
        this._active = false;
        this.draw();
      }
    }
  }

  setPosition(x: number, y: number) {
    this.pos.set(x, y);
    this.draw();
  }

  get active() {
    return this._active;
  }
}
