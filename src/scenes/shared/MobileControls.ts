import Phaser from "phaser";
import { VirtualJoystick } from "../../mobile/VirtualJoystick";
import { VirtualFireButton } from "../../mobile/VirtualFireButton";

export interface JoystickSnapshot {
  x: number;
  y: number;
}

export class MobileControls {
  private scene: Phaser.Scene;
  private joystick?: VirtualJoystick;
  private fireButton?: VirtualFireButton;
  private resizeListenerBound = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.scene.input.addPointer(3);
    this.scene.scale.on("resize", () => this.reposition());
    window.addEventListener("orientationchange", this.onOrientationChange);
    this.resizeListenerBound = true;
    this.maybeToggle();
    this.reposition();
  }

  destroy() {
    if (this.joystick) this.joystick.destroy();
    if (this.fireButton) this.fireButton.destroy();
    this.joystick = undefined;
    this.fireButton = undefined;
    if (this.resizeListenerBound) {
      window.removeEventListener("orientationchange", this.onOrientationChange);
      this.resizeListenerBound = false;
    }
  }

  private onOrientationChange = () => {
    setTimeout(() => {
      this.maybeToggle();
      this.reposition();
    }, 60);
  };

  private shouldShow(): boolean {
    const isTouch = this.scene.sys.game.device.input.touch;
    if (!isTouch) return false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const isSmallViewport = w <= 1100 || h <= 800;
    const ua = navigator.userAgent.toLowerCase();
    const mobileUA =
      /iphone|ipad|ipod|android|mobile|silk|kindle|playbook/.test(ua);
    return isTouch && (mobileUA || isSmallViewport);
  }

  private maybeToggle() {
    const want = this.shouldShow();
    if (want && !this.joystick) {
      this.joystick = new VirtualJoystick(
        this.scene,
        90,
        this.scene.scale.height - 90,
        80
      );
      this.fireButton = new VirtualFireButton(
        this.scene,
        this.scene.scale.width - 90,
        this.scene.scale.height - 90,
        70
      );
    } else if (!want && this.joystick) {
      this.joystick.destroy();
      this.joystick = undefined;
      if (this.fireButton) {
        this.fireButton.destroy();
        this.fireButton = undefined;
      }
    }
  }

  private reposition() {
    if (this.joystick)
      this.joystick.setCenter(90, this.scene.scale.height - 90);
    if (this.fireButton)
      this.fireButton.setPosition(
        this.scene.scale.width - 90,
        this.scene.scale.height - 90
      );
  }

  snapshot(): { keysDown: Set<string>; joystick: JoystickSnapshot } {
    const keysDown = new Set<string>();
    let jx = 0;
    let jy = 0;
    if (this.joystick && this.joystick.active) {
      const angle = this.joystick.angle;
      const strength = this.joystick.strength;
      jx = Math.cos(angle) * strength;
      jy = Math.sin(angle) * strength;
    }
    if (this.fireButton?.active) keysDown.add("SPACE");
    return { keysDown, joystick: { x: jx, y: jy } };
  }
}
