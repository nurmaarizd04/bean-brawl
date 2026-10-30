import * as THREE from "three";
import { buildBean, disposeBean, type BeanRig } from "./models";

/** Pratinjau karakter 3D yang berputar (lemari & lobi) */
export class BeanPreview {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 5, 2000);
  private rig: BeanRig | null = null;
  private frame = 0;
  private spin = -0.5;
  private last = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.shadowMap.enabled = true;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a5a8a, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(80, 160, 120);
    key.castShadow = true;
    const rim = new THREE.DirectionalLight(0x8fd3ff, 1.6);
    rim.position.set(-120, 60, -140);
    this.scene.add(key, rim);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(38, 40, 4, 48), new THREE.MeshStandardMaterial({ color: 0x3b2f5c, roughness: 0.6 }));
    stage.position.y = -2;
    stage.receiveShadow = true;
    this.scene.add(stage);
    this.camera.position.set(0, 75, 235);
    this.camera.lookAt(0, 34, 0);
  }

  show(color: string, hat: string) {
    if (this.rig && this.rig.color === color && this.rig.hat === hat) return;
    if (this.rig) {
      this.scene.remove(this.rig.root);
      disposeBean(this.rig);
    }
    this.rig = buildBean(color, hat);
    this.rig.root.scale.setScalar(1.15);
    this.scene.add(this.rig.root);
  }

  start() {
    cancelAnimationFrame(this.frame);
    this.last = performance.now();
    const loop = (time: number) => {
      this.frame = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (time - this.last) / 1000);
      this.last = time;
      this.resize();
      this.spin += dt * 0.6;
      if (this.rig) {
        this.rig.root.rotation.y = this.spin;
        // Gerakan "pamer" kecil: kepalan naik-turun & badan memantul
        const t = time / 1000;
        this.rig.body.position.y = Math.abs(Math.sin(t * 3)) * 2;
        this.rig.fists[0].position.y = 24 + Math.sin(t * 3) * 3;
        this.rig.fists[1].position.y = 24 + Math.sin(t * 3 + Math.PI) * 3;
      }
      this.gl.render(this.scene, this.camera);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.frame);
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.gl.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }
}
