import * as THREE from "three";
import { colorHex } from "../data/cosmetics";
import { mapExtent, type ArenaMap } from "../data/maps";
import type { Particle } from "../game/effects";
import { ACTION, ATTACKS, type Fighter } from "../game/fighter";
import type { Game } from "../game/game";
import { clamp, smoothing } from "../game/math";
import { buildArena, buildBean, disposeBean, type ArenaScene, type BeanRig } from "./models";

const MOBILE = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
const FOV = 42;
const TILT = (54 * Math.PI) / 180;

class ParticleLayer {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly capacity: number;

  constructor(capacity: number, additive: boolean) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("pcolor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("psize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("palpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        uniform float uScale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
          vColor = pcolor; vAlpha = palpha;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, (1.0 - smoothstep(0.15, 0.5, d)) * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
  }

  fill(list: Particle[], accept: (p: Particle) => boolean) {
    let n = 0;
    for (const p of list) {
      if (n >= this.capacity || !accept(p)) continue;
      const t = p.life / p.maxLife;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.z;
      this.pos[n * 3 + 2] = p.y;
      const [r, g, b] = p.color.split(",").map(Number);
      this.col[n * 3] = r / 255;
      this.col[n * 3 + 1] = g / 255;
      this.col[n * 3 + 2] = b / 255;
      this.size[n] = p.size * 2;
      this.alpha[n] = p.kind === "smoke" ? 0.55 * t : p.kind === "dust" ? 0.45 * t : p.kind === "drop" ? Math.min(1, t * 2) : Math.min(1, t * 1.6);
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const name of ["position", "pcolor", "psize", "palpha"]) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 10, 9000);
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly overlay: HTMLCanvasElement;
  private readonly octx: CanvasRenderingContext2D;
  private arena: ArenaScene | null = null;
  private map: ArenaMap | null = null;
  private rigs = new Map<string, BeanRig>();
  private shadows = new Map<string, THREE.Mesh>();
  private soft = new ParticleLayer(700, false);
  private glow = new ParticleLayer(500, true);
  private lights: THREE.PointLight[] = [];
  private focusX = 0;
  private focusY = 0;
  private targetX = 0;
  private targetY = 0;
  private shakeAmount = 0;
  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private time = 0;
  private readonly vec = new THREE.Vector3();
  private readonly blobGeo = new THREE.CircleGeometry(17, 24).rotateX(-Math.PI / 2);
  private readonly blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

  constructor(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE || window.devicePixelRatio < 2, powerPreference: "high-performance" });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.1;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.overlay = overlay;
    this.octx = overlay.getContext("2d")!;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.3);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.sun.position.set(-260, 620, 320);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(MOBILE ? 1024 : 2048, MOBILE ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -620, right: 620, top: 620, bottom: -620, near: 50, far: 1800 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.soft.points, this.glow.points);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xfff1c0, 0, 260, 1.5);
      this.lights.push(l);
      this.scene.add(l);
    }
    this.resize();
  }

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.6 : 2);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(this.cssW, this.cssH, false);
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
    this.overlay.width = Math.round(this.cssW * this.dpr);
    this.overlay.height = Math.round(this.cssH * this.dpr);
    const scale = (this.cssH * this.dpr) / (2 * Math.tan(((FOV / 2) * Math.PI) / 180));
    this.soft.material.uniforms.uScale.value = scale;
    this.glow.material.uniforms.uScale.value = scale;
  }

  setMap(map: ArenaMap) {
    if (this.arena) {
      this.scene.remove(this.arena.group);
      this.arena.group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
          o.geometry.dispose();
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          }
        }
      });
    }
    for (const [id, rig] of this.rigs) {
      this.scene.remove(rig.root);
      disposeBean(rig);
      this.rigs.delete(id);
    }
    for (const blob of this.shadows.values()) this.scene.remove(blob);
    this.shadows.clear();
    this.map = map;
    this.arena = buildArena(map);
    this.scene.add(this.arena.group);
    const c = map.colors;
    this.scene.background = new THREE.Color(c.sky);
    this.scene.fog = new THREE.Fog(c.fog, 1400, map.void === "space" ? 6000 : 3600);
    this.sun.color.set(c.sun);
    this.hemi.color.set(c.hemiSky);
    this.hemi.groundColor.set(c.hemiGround);
    this.focusX = this.targetX = 0;
    this.focusY = this.targetY = 0;
  }

  focus(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  get focusPoint() {
    return { x: this.focusX, y: this.focusY };
  }

  shake(amount: number) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  private project(x: number, h: number, y: number) {
    this.vec.set(x, h, y).project(this.camera);
    return { x: ((this.vec.x + 1) / 2) * this.cssW, y: ((1 - this.vec.y) / 2) * this.cssH, behind: this.vec.z > 1 };
  }

  private updateCamera(dt: number) {
    const k = smoothing(4, dt);
    this.focusX += (this.targetX - this.focusX) * k;
    this.focusY += (this.targetY - this.focusY) * k;
    // Seluruh arena kira-kira terlihat; layar sempit (portrait) mundur sedikit
    const extent = this.map ? mapExtent(this.map) : 450;
    const width = Math.max(extent * 1.35, 600);
    const d = clamp(width / (2 * Math.tan(((FOV / 2) * Math.PI) / 180) * this.camera.aspect), 440, 1200);
    const sx = this.shakeAmount > 0.3 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    const sz = this.shakeAmount > 0.3 ? (Math.random() - 0.5) * this.shakeAmount : 0;
    this.shakeAmount *= Math.exp(-dt * 10);
    this.camera.position.set(this.focusX + sx, Math.sin(TILT) * d, this.focusY + Math.cos(TILT) * d + sz);
    this.camera.lookAt(this.focusX + sx, 0, this.focusY + sz);
  }

  render(dt: number, game: Game) {
    if (game.map !== this.map) this.setMap(game.map);
    if (window.innerWidth !== this.cssW || window.innerHeight !== this.cssH) this.resize();
    this.time += dt;
    this.arena?.animate(this.time);
    this.syncFighters(game.fighters, dt);
    const ps = game.effects.particles;
    this.soft.fill(ps, (p) => p.kind === "smoke" || p.kind === "dust" || p.kind === "drop");
    this.glow.fill(ps, (p) => p.kind === "glow" || p.kind === "star");
    const flashes = [...game.effects.flashes].sort((a, b) => b.intensity - a.intensity);
    this.lights.forEach((l, i) => {
      const f = flashes[i];
      if (!f) return void (l.intensity = 0);
      l.position.set(f.x, f.z + 20, f.y);
      l.color.setHex(f.color);
      l.intensity = f.intensity * (f.life / f.maxLife) * 3000;
    });
    this.updateCamera(dt);
    this.gl.render(this.scene, this.camera);
    this.drawOverlay(game);
  }

  private syncFighters(fighters: Fighter[], dt: number) {
    const present = new Set<string>();
    for (const f of fighters) {
      present.add(f.id);
      let rig = this.rigs.get(f.id);
      if (!rig || rig.color !== f.color || rig.hat !== f.hat) {
        if (rig) {
          this.scene.remove(rig.root);
          disposeBean(rig);
        }
        rig = buildBean(f.color, f.hat);
        this.rigs.set(f.id, rig);
        this.scene.add(rig.root);
      }
      let blob = this.shadows.get(f.id);
      if (!blob) {
        blob = new THREE.Mesh(this.blobGeo, this.blobMat);
        this.shadows.set(f.id, blob);
        this.scene.add(blob);
      }
      this.pose(rig, f, dt);
      blob.visible = rig.root.visible && !f.falling && f.z > 2;
      blob.position.set(f.x, 0.6, f.y);
      blob.scale.setScalar(clamp(1 - f.z / 300, 0.4, 1));
    }
    for (const [id, rig] of this.rigs) {
      if (present.has(id)) continue;
      this.scene.remove(rig.root);
      disposeBean(rig);
      this.rigs.delete(id);
      const blob = this.shadows.get(id);
      if (blob) this.scene.remove(blob);
      this.shadows.delete(id);
    }
  }

  /** Animasi prosedural: langkah, pukulan, tendangan, dash, terhuyung, jatuh */
  private pose(rig: BeanRig, f: Fighter, dt: number) {
    const { root, body, legs, fists, stars } = rig;
    const visible = f.alive || f.falling;
    // Kedip sesaat (1 dari 3 ketukan) saat kebal setelah muncul kembali
    const blink = f.invuln > 0.25 && f.action !== ACTION.dash && Math.floor(this.time * 10) % 3 === 0;
    root.visible = visible && !blink;
    if (!visible) return;

    root.position.set(f.x, f.z, f.y);
    root.rotation.y = -f.facing;

    const speed = Math.hypot(f.vx, f.vy);
    const walking = speed > 25 && f.z < 1 && f.action === ACTION.idle;
    const step = Math.sin(f.walk);
    legs[0].position.set(walking ? step * 6 : 0, 8.5 + (walking ? Math.max(0, step) * 3 : 0), -8);
    legs[1].position.set(walking ? -step * 6 : 0, 8.5 + (walking ? Math.max(0, -step) * 3 : 0), 8);
    body.position.y = walking ? Math.abs(step) * 2 : 0;
    body.rotation.set(0, 0, 0);
    fists[0].position.set(6 + (walking ? -step * 3 : 0), 24, -21);
    fists[1].position.set(6 + (walking ? step * 3 : 0), 24, 21);
    stars.visible = false;

    if (f.action === ACTION.punch || f.action === ACTION.kick) {
      const a = f.action === ACTION.kick ? ATTACKS.kick : f.combo === 3 ? ATTACKS.finisher : ATTACKS.punch;
      const peak = a.startup + a.active;
      const ext = f.actionTime < peak ? Math.sin((f.actionTime / peak) * (Math.PI / 2)) : Math.max(0, 1 - (f.actionTime - peak) / a.recovery);
      if (f.action === ACTION.punch) {
        const hands = f.combo === 3 ? [0, 1] : [f.combo % 2];
        for (const h of hands) {
          fists[h].position.x = 6 + ext * 30;
          fists[h].position.z = (h ? 1 : -1) * (21 - ext * 13);
          fists[h].position.y = 26;
        }
        body.rotation.y = (f.combo % 2 ? 1 : -1) * ext * 0.25;
      } else {
        legs[1].position.set(ext * 24, 8.5 + ext * 14, 6);
        body.rotation.z = ext * 0.3;
      }
    } else if (f.action === ACTION.dash) {
      body.rotation.z = -0.4;
      fists[0].position.x = fists[1].position.x = -6;
    } else if (f.action === ACTION.stun || f.stun > 0) {
      body.rotation.z = Math.sin(this.time * 30) * 0.18 + 0.15;
      stars.visible = f.percent > 40;
      stars.rotation.y = this.time * 6;
    }
    if (f.falling) {
      body.rotation.x = this.time * 7;
      body.rotation.z = this.time * 3;
    }

    // Efek mengempis saat terkena / mendarat
    const sq = f.squash;
    root.scale.set(1 + sq * 0.18, 1 - sq * 0.22, 1 + sq * 0.18);
    const flash = f.hitFlash * 0.6;
    for (const m of rig.paint) m.emissive.setRGB(flash, flash, flash);
    void dt;
  }

  // ---------------- Lapisan 2D ----------------

  private drawOverlay(game: Game) {
    const ctx = this.octx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    const inMatch = game.inMatch;

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    if (inMatch) {
      for (const f of game.fighters) {
        if (!f.alive || f.falling) continue;
        const p = this.project(f.x, f.z + 76, f.y);
        if (p.behind) continue;
        const local = f === game.local;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.font = `700 ${local ? 14 : 13}px Fredoka, Nunito, sans-serif`;
        ctx.strokeText(local ? `▼ ${f.name}` : f.name, p.x, p.y);
        ctx.fillStyle = local ? "#ffe066" : colorHex(f.color) === "#3a3a44" ? "#ddd" : "#fff";
        ctx.fillText(local ? `▼ ${f.name}` : f.name, p.x, p.y);
        const pct = Math.round(f.percent);
        ctx.font = `800 13px Fredoka, Nunito, sans-serif`;
        ctx.strokeText(`${pct}%`, p.x, p.y + 15);
        ctx.fillStyle = percentColor(pct);
        ctx.fillText(`${pct}%`, p.x, p.y + 15);
      }
    }

    // Teks komik & angka kerusakan
    ctx.textBaseline = "middle";
    for (const t of game.effects.texts) {
      const p = this.project(t.x, t.z, t.y);
      if (p.behind) continue;
      const age = 1 - t.life / t.maxLife;
      const scale = t.pop ? (age < 0.15 ? 0.6 + age * 6 : 1.5 - Math.min(0.5, (age - 0.15) * 1.2)) : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(t.pop ? -0.12 : 0);
      ctx.scale(scale, scale);
      ctx.globalAlpha = Math.min(1, t.life * 3);
      ctx.font = `900 ${t.size}px "Luckiest Guy", Fredoka, sans-serif`;
      ctx.lineJoin = "round";
      ctx.lineWidth = t.pop ? 6 : 4;
      ctx.strokeStyle = "#1a1020";
      ctx.strokeText(t.text, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (inMatch) {
      this.drawIndicators(ctx, game);
      this.drawStick(ctx, game);
    }
  }

  private drawIndicators(ctx: CanvasRenderingContext2D, game: Game) {
    const cx = this.cssW / 2;
    const cy = this.cssH / 2;
    for (const f of game.fighters) {
      if (!f.alive || f.falling || f === game.local) continue;
      const p = this.project(f.x, 30, f.y);
      if (!p.behind && p.x > 0 && p.x < this.cssW && p.y > 0 && p.y < this.cssH) continue;
      const a = Math.atan2(p.y - cy, p.x - cx);
      const k = Math.min((cx - 26) / Math.abs(Math.cos(a) || 0.001), (cy - 26) / Math.abs(Math.sin(a) || 0.001));
      ctx.save();
      ctx.translate(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
      ctx.fillStyle = colorHex(f.color);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(a);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(11, -6);
      ctx.lineTo(11, 6);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawStick(ctx: CanvasRenderingContext2D, game: Game) {
    const s = game.input.stick;
    if (!s.active) return;
    const r = game.input.radius;
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    const k = d > r ? r / d : 1;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(s.ox + dx * k, s.oy + dy * k, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function percentColor(p: number) {
  if (p < 40) return "#ffffff";
  if (p < 80) return "#ffe066";
  if (p < 120) return "#ff9f43";
  return "#ff4d4d";
}
