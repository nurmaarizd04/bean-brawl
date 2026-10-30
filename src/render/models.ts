import * as THREE from "three";
import { colorHex } from "../data/cosmetics";
import type { ArenaMap, Prop } from "../data/maps";

/** Koordinat: x dunia → X, y dunia → Z, tinggi → Y. Hadap θ → rotation.y = −θ. */

// ---------------- Karakter "kacang" ----------------

export interface BeanRig {
  root: THREE.Group;
  /** Badan (dimiringkan saat menendang/terpukul) */
  body: THREE.Group;
  legs: [THREE.Mesh, THREE.Mesh];
  fists: [THREE.Mesh, THREE.Mesh];
  stars: THREE.Group;
  paint: THREE.MeshStandardMaterial[];
  color: string;
  hat: string;
}

const geo = {
  body: new THREE.CapsuleGeometry(16, 15, 8, 20),
  visor: new THREE.SphereGeometry(1, 24, 16),
  pack: new THREE.CapsuleGeometry(7, 12, 4, 10),
  leg: new THREE.CapsuleGeometry(6, 5, 4, 10),
  fist: new THREE.SphereGeometry(6.5, 16, 12),
  star: new THREE.OctahedronGeometry(3.2),
};

const visorMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, roughness: 0.08, metalness: 0.35, emissive: 0x1d3c5a, emissiveIntensity: 0.35 });
const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
const fistMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 });
const starMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });

function hatMesh(hat: string): THREE.Object3D | null {
  const g = new THREE.Group();
  const mat = (color: number, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  switch (hat) {
    case "party": {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(8, 20, 20), mat(0xff4fa3));
      cone.position.y = 10;
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(5.6, 1.2, 6, 20), mat(0xffe066));
      stripe.rotation.x = Math.PI / 2;
      stripe.position.y = 7;
      const pom = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), mat(0xffe066));
      pom.position.y = 21;
      g.add(cone, stripe, pom);
      g.rotation.z = 0.25;
      break;
    }
    case "crown": {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 7, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.25, metalness: 0.8, side: THREE.DoubleSide }));
      ring.position.y = 3.5;
      g.add(ring);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(2.2, 6, 8), ring.material);
        spike.position.set(Math.cos(a) * 10, 9.5, Math.sin(a) * 10);
        g.add(spike);
      }
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(2.4), mat(0xe63946, 0.2, 0.3));
      gem.position.set(10.3, 3.5, 0);
      g.add(gem);
      break;
    }
    case "cap": {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(15.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2b59c3));
      dome.position.y = -6;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.4, 20, 1, false, -Math.PI / 2, Math.PI), mat(0x1d3f8f));
      brim.position.set(13, -5, 0);
      brim.scale.set(1.3, 1, 1);
      g.add(dome, brim);
      break;
    }
    case "peci": {
      const peci = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 13, 9, 24), mat(0x16161a, 0.85));
      peci.position.y = 0.5;
      g.add(peci);
      break;
    }
    case "band": {
      const band = new THREE.Mesh(new THREE.TorusGeometry(16.2, 2, 8, 28), mat(0xe63946));
      band.rotation.x = Math.PI / 2;
      band.position.y = -8;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 3), band.material);
      tail.position.set(-17, -12, 3);
      tail.rotation.z = -0.5;
      g.add(band, tail);
      break;
    }
    case "horns": {
      for (const s of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(3.4, 12, 12), mat(0xc0392b, 0.4));
        horn.position.set(2, 2, s * 9);
        horn.rotation.x = s * 0.45;
        g.add(horn);
      }
      break;
    }
    case "flower": {
      const center = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), mat(0xffc93c));
      center.position.y = 2;
      g.add(center);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), mat(0xffffff));
        petal.scale.set(1, 0.5, 1);
        petal.position.set(Math.cos(a) * 5, 2, Math.sin(a) * 5);
        g.add(petal);
      }
      g.position.set(-4, 0, 6);
      g.rotation.x = 0.3;
      break;
    }
    case "chef": {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 10, 20), mat(0xffffff, 0.9));
      base.position.y = 4;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(13, 16, 12), base.material);
      puff.scale.set(1, 0.7, 1);
      puff.position.y = 13;
      g.add(base, puff);
      break;
    }
    case "antenna": {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 16, 6), mat(0x555555, 0.4, 0.6));
      pole.position.y = 7;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff5e5b, emissive: 0xff2d2d, emissiveIntensity: 0.6 }));
      ball.position.y = 16;
      g.add(pole, ball);
      break;
    }
    default:
      return null;
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function buildBean(colorId: string, hat: string): BeanRig {
  const base = new THREE.Color(colorHex(colorId));
  const bodyMat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.42, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.7), roughness: 0.5 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const torso = new THREE.Mesh(geo.body, bodyMat);
  torso.position.y = 29.5;
  torso.castShadow = true;
  body.add(torso);

  const visor = new THREE.Mesh(geo.visor, visorMat);
  visor.scale.set(7, 8, 12.5);
  visor.position.set(11.5, 37, 0);
  visor.castShadow = true;
  body.add(visor);
  const shine = new THREE.Mesh(geo.visor, shineMat);
  shine.scale.set(1.5, 2, 4.5);
  shine.position.set(17.6, 40, -3.5);
  body.add(shine);

  const pack = new THREE.Mesh(geo.pack, darkMat);
  pack.position.set(-16, 28, 0);
  pack.castShadow = true;
  body.add(pack);

  const legs: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(geo.leg, darkMat), new THREE.Mesh(geo.leg, darkMat)];
  legs[0].position.set(0, 8.5, -8);
  legs[1].position.set(0, 8.5, 8);
  for (const leg of legs) {
    leg.castShadow = true;
    root.add(leg);
  }

  const fists: [THREE.Mesh, THREE.Mesh] = [new THREE.Mesh(geo.fist, fistMat), new THREE.Mesh(geo.fist, fistMat)];
  fists[0].position.set(6, 24, -21);
  fists[1].position.set(6, 24, 21);
  for (const fist of fists) {
    fist.castShadow = true;
    body.add(fist);
  }

  const hatObj = hatMesh(hat);
  if (hatObj) {
    hatObj.position.y = 52;
    body.add(hatObj);
  }

  const stars = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(geo.star, starMat);
    const a = (i / 3) * Math.PI * 2;
    s.position.set(Math.cos(a) * 14, 0, Math.sin(a) * 14);
    stars.add(s);
  }
  stars.position.y = 58;
  stars.visible = false;
  body.add(stars);

  return { root, body, legs, fists, stars, paint: [bodyMat, darkMat], color: colorId, hat };
}

export function disposeBean(rig: BeanRig) {
  rig.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (!Object.values(geo).includes(o.geometry)) o.geometry.dispose();
    const m = o.material as THREE.Material;
    if (m !== visorMat && m !== shineMat && m !== fistMat && m !== starMat) m.dispose();
  });
}

// ---------------- Tekstur ----------------

function canvasTex(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d")!, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat !== 1) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  return tex;
}

const noise = (ctx: CanvasRenderingContext2D, s: number, count: number, colors: string[], min: number, max: number) => {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.ellipse(Math.random() * s, Math.random() * s, min + Math.random() * (max - min), min + Math.random() * (max - min), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

function groundTexture(map: ArenaMap) {
  const c = map.colors;
  return canvasTex(1024, (ctx, s) => {
    ctx.fillStyle = c.ground;
    ctx.fillRect(0, 0, s, s);
    const round = map.shape !== "rect";
    switch (map.id) {
      case "island": {
        noise(ctx, s, 260, ["rgba(70,140,50,0.35)", "rgba(120,190,80,0.3)", "rgba(40,110,40,0.25)"], 10, 60);
        for (let i = 0; i < 700; i++) {
          ctx.fillStyle = Math.random() < 0.05 ? "#ffe8f0" : "rgba(30,90,30,0.4)";
          ctx.fillRect(Math.random() * s, Math.random() * s, 3, 3);
        }
        // Pantai di tepi
        const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.4, s / 2, s / 2, s * 0.5);
        g.addColorStop(0, "rgba(231,211,154,0)");
        g.addColorStop(0.35, c.groundAlt);
        g.addColorStop(1, "#d8c088");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        break;
      }
      case "ship": {
        ctx.strokeStyle = "rgba(30,35,45,0.5)";
        ctx.lineWidth = 4;
        for (let i = 0; i <= 8; i++) {
          ctx.beginPath();
          ctx.moveTo((i * s) / 8, 0);
          ctx.lineTo((i * s) / 8, s);
          ctx.moveTo(0, (i * s) / 8);
          ctx.lineTo(s, (i * s) / 8);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) if ((x + y) % 2) ctx.fillRect((x * s) / 8 + 4, (y * s) / 8 + 4, s / 8 - 8, s / 8 - 8);
        // Garis bahaya kuning-hitam di tepi
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, s, s);
        ctx.rect(36, 36, s - 72, s - 72);
        ctx.clip("evenodd");
        for (let i = -s; i < s * 2; i += 48) {
          ctx.fillStyle = (i / 48) % 2 ? "#f5c542" : "#222";
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + 24, 0);
          ctx.lineTo(i + 24 - s, s);
          ctx.lineTo(i - s, s);
          ctx.fill();
        }
        ctx.restore();
        break;
      }
      case "volcano": {
        noise(ctx, s, 200, ["rgba(90,70,62,0.5)", "rgba(40,30,26,0.5)"], 10, 50);
        ctx.strokeStyle = "rgba(255,120,40,0.85)";
        ctx.shadowColor = "#ff7a2a";
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3;
        for (let i = 0; i < 26; i++) {
          let x = Math.random() * s;
          let y = Math.random() * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (let k = 0; k < 5; k++) {
            x += (Math.random() - 0.5) * 80;
            y += (Math.random() - 0.5) * 80;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        break;
      }
      case "rooftop": {
        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = 3;
        for (let i = 0; i <= 12; i++) {
          ctx.beginPath();
          ctx.moveTo((i * s) / 12, 0);
          ctx.lineTo((i * s) / 12, s);
          ctx.moveTo(0, (i * s) / 12);
          ctx.lineTo(s, (i * s) / 12);
          ctx.stroke();
        }
        noise(ctx, s, 120, ["rgba(0,0,0,0.06)", "rgba(255,255,255,0.05)"], 8, 40);
        // Helipad
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s * 0.17, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#ffd166";
        ctx.font = `bold ${s * 0.18}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("H", s / 2, s / 2 + 6);
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 10;
        ctx.strokeRect(14, 14, s - 28, s - 28);
        break;
      }
      case "ice": {
        noise(ctx, s, 160, ["rgba(255,255,255,0.35)", "rgba(150,210,240,0.35)"], 10, 70);
        ctx.strokeStyle = "rgba(255,255,255,0.7)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 40; i++) {
          const x = Math.random() * s;
          const y = Math.random() * s;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (Math.random() - 0.5) * 160, y + (Math.random() - 0.5) * 160);
          ctx.stroke();
        }
        break;
      }
    }
    if (round) {
      // Bingkai tepi arena agar batas terlihat jelas
      ctx.strokeStyle = c.rim;
      ctx.lineWidth = s * 0.012;
      ctx.beginPath();
      if (map.shape === "circle") ctx.arc(s / 2, s / 2, s / 2 - ctx.lineWidth, 0, Math.PI * 2);
      else
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const x = s / 2 + Math.cos(a) * (s / 2 - ctx.lineWidth);
          const y = s / 2 + Math.sin(a) * (s / 2 - ctx.lineWidth);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
      ctx.stroke();
    }
  });
}

const waterTexture = (deep: string, light: string) =>
  canvasTex(
    256,
    (ctx, s) => {
      ctx.fillStyle = deep;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = light;
      ctx.lineWidth = 3;
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        ctx.beginPath();
        ctx.arc(x, y, 6 + Math.random() * 16, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    },
    24,
  );

const lavaTexture = () =>
  canvasTex(
    256,
    (ctx, s) => {
      ctx.fillStyle = "#ff5a14";
      ctx.fillRect(0, 0, s, s);
      noise(ctx, s, 90, ["rgba(255,210,80,0.7)", "rgba(180,30,0,0.6)", "rgba(255,140,30,0.6)"], 8, 34);
    },
    16,
  );

const windowsTexture = () =>
  canvasTex(
    128,
    (ctx, s) => {
      ctx.fillStyle = "#2b2438";
      ctx.fillRect(0, 0, s, s);
      for (let x = 0; x < 8; x++)
        for (let y = 0; y < 8; y++) {
          ctx.fillStyle = Math.random() < 0.45 ? "#ffd27a" : "#1a1625";
          ctx.fillRect(x * 16 + 4, y * 16 + 4, 8, 9);
        }
    },
    1,
  );

// ---------------- Arena ----------------

export interface ArenaScene {
  group: THREE.Group;
  /** Dipanggil tiap frame untuk animasi (air, lava, bintang) */
  animate: (time: number) => void;
}

function prop(p: Prop, map: ArenaMap): THREE.Object3D {
  const g = new THREE.Group();
  const std = (color: number | string, rough = 0.7, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  switch (p.kind) {
    case "palm": {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(6, 40, 3), new THREE.Vector3(18, 80, 6), new THREE.Vector3(26, 100, 8)]);
      const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 5, 8), std(0x8b6b45, 0.9));
      g.add(trunk);
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(9, 55, 4), std(0x3f9b3a, 0.8, 0, { flatShading: true }));
        leaf.scale.set(1, 1, 0.25);
        leaf.position.set(26, 100, 8);
        leaf.rotation.set(0, (i / 7) * Math.PI * 2, 1.9);
        leaf.translateY(24);
        g.add(leaf);
      }
      for (let i = 0; i < 3; i++) {
        const nut = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), std(0x6b4a2b));
        nut.position.set(24 + Math.cos(i * 2) * 5, 94, 8 + Math.sin(i * 2) * 5);
        g.add(nut);
      }
      break;
    }
    case "rock": {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(p.r * 1.15, 0), std(map.id === "volcano" ? 0x3a2d28 : 0x8c8a80, 0.95, 0, { flatShading: true }));
      rock.scale.set(1, 0.8, 1);
      rock.position.y = p.r * 0.55;
      rock.rotation.set(p.x * 0.01, p.y * 0.02, 0);
      g.add(rock);
      break;
    }
    case "crate": {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(p.r * 1.8, p.r * 1.8, p.r * 1.8), std(0x6f7c8f, 0.5, 0.6));
      crate.position.y = p.r * 0.9;
      const band = new THREE.Mesh(new THREE.BoxGeometry(p.r * 1.85, 5, p.r * 1.85), std(0xf5c542, 0.4, 0.3));
      band.position.y = p.r * 0.9;
      g.add(crate, band);
      break;
    }
    case "pillar": {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r * 1.1, 70, 20), std(map.id === "ship" ? 0x5b6577 : 0x9a968f, 0.5, map.id === "ship" ? 0.6 : 0));
      col.position.y = 35;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.2, p.r * 1.2, 6, 20), std(map.colors.rim, 0.4, 0.3, { emissive: map.id === "ship" ? 0x3a2a00 : 0 }));
      cap.position.y = 72;
      g.add(col, cap);
      break;
    }
    case "ac": {
      const box = new THREE.Mesh(new THREE.BoxGeometry(p.r * 2, 34, p.r * 1.6), std(0xc9c6bf, 0.6, 0.2));
      box.position.y = 17;
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 0.6, p.r * 0.6, 2, 20), std(0x333333, 0.5));
      fan.position.y = 35;
      g.add(box, fan);
      break;
    }
    case "crystal": {
      const mat = std(0xbfe9ff, 0.1, 0.1, { transparent: true, opacity: 0.85, emissive: 0x2a6f9a, emissiveIntensity: 0.3 });
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(6 + i, 30 + i * 10, 6), mat);
        c.position.set(Math.cos(i * 1.7) * 6, (30 + i * 10) / 2, Math.sin(i * 1.7) * 6);
        c.rotation.set(Math.cos(i) * 0.25, 0, Math.sin(i) * 0.25);
        g.add(c);
      }
      break;
    }
    case "lamp": {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(2, 3, 70, 8), std(0x3a3d44, 0.5, 0.6));
      pole.position.y = 35;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff1c0, emissive: 0xffd27a, emissiveIntensity: 1.5 }));
      bulb.position.y = 72;
      g.add(pole, bulb);
      break;
    }
  }
  g.position.set(p.x, 0, p.y);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

export function buildArena(map: ArenaMap): ArenaScene {
  const group = new THREE.Group();
  const animated: ((t: number) => void)[] = [];

  // Lantai arena
  const top = new THREE.MeshStandardMaterial({ map: groundTexture(map), roughness: map.id === "ice" ? 0.15 : map.id === "ship" ? 0.45 : 0.9, metalness: map.id === "ship" ? 0.5 : map.id === "ice" ? 0.1 : 0 });
  const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(map.id === "island" ? "#b89a62" : map.colors.groundAlt).multiplyScalar(0.8), roughness: 0.9 });
  let floor: THREE.Mesh;
  if (map.shape === "rect") {
    floor = new THREE.Mesh(new THREE.BoxGeometry(map.w * 2, 50, map.h * 2), [side, side, top, side, side, side]);
  } else {
    const segments = map.shape === "hex" ? 6 : 72;
    floor = new THREE.Mesh(new THREE.CylinderGeometry(map.size, map.size * 0.86, 50, segments, 1, false, map.shape === "hex" ? Math.PI / 2 : 0), [side, top, side]);
  }
  floor.position.y = -25;
  floor.receiveShadow = true;
  floor.castShadow = true;
  group.add(floor);

  for (const p of map.props) group.add(prop(p, map));

  switch (map.void) {
    case "water":
    case "icewater": {
      const ice = map.void === "icewater";
      const tex = waterTexture(ice ? "#5fb3dc" : "#1f86c9", ice ? "rgba(255,255,255,0.45)" : "rgba(170,225,255,0.5)");
      const water = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.15, transparent: true, opacity: 0.95 }));
      water.position.y = -60;
      water.receiveShadow = true;
      group.add(water);
      // Pulau di bawah air (pasir) & buih di sekeliling
      if (!ice) {
        const sand = new THREE.Mesh(new THREE.CylinderGeometry(map.size * 0.86, map.size * 1.15, 200, 72), new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 1 }));
        sand.position.y = -150;
        group.add(sand);
      }
      const foam = new THREE.Mesh(new THREE.RingGeometry(map.size * 0.9, map.size * 1.02, 72).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
      foam.position.y = -59;
      group.add(foam);
      animated.push((t) => {
        tex.offset.set(t * 0.01, t * 0.006);
        foam.scale.setScalar(1 + Math.sin(t * 1.6) * 0.015);
      });
      break;
    }
    case "lava": {
      const tex = lavaTexture();
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xff4a10, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.6 }));
      lava.position.y = -60;
      group.add(lava);
      // Pilar batu di bawah arena
      const base = new THREE.Mesh(new THREE.CylinderGeometry(map.size * 0.86, map.size * 0.7, 80, 6, 1, false, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a201c, roughness: 1 }));
      base.position.y = -90;
      group.add(base);
      animated.push((t) => {
        tex.offset.set(t * 0.012, Math.sin(t * 0.3) * 0.05);
        (lava.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + Math.sin(t * 2) * 0.15;
      });
      break;
    }
    case "space": {
      const count = 1600;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const r = 2600 + Math.random() * 600;
        pos[i * 3] = Math.sqrt(1 - u * u) * Math.cos(a) * r;
        pos[i * 3 + 1] = u * r - 900;
        pos[i * 3 + 2] = Math.sqrt(1 - u * u) * Math.sin(a) * r;
      }
      const starsGeo = new THREE.BufferGeometry();
      starsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const stars = new THREE.Points(starsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 6, sizeAttenuation: true, fog: false }));
      group.add(stars);
      const planet = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 32), new THREE.MeshStandardMaterial({ color: 0x6a5acd, roughness: 0.8, emissive: 0x1a1240, fog: false }));
      planet.position.set(-1500, -1300, -1800);
      group.add(planet);
      const ring = new THREE.Mesh(new THREE.RingGeometry(560, 760, 64), new THREE.MeshBasicMaterial({ color: 0xc9b7ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5, fog: false }));
      ring.position.copy(planet.position);
      ring.rotation.x = 1.2;
      group.add(ring);
      // Mesin pendorong di bawah dek
      const hull = new THREE.Mesh(new THREE.BoxGeometry(map.w * 1.7, 60, map.h * 1.7), new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.4, metalness: 0.7 }));
      hull.position.y = -80;
      group.add(hull);
      animated.push((t) => (stars.rotation.y = t * 0.01));
      break;
    }
    case "street": {
      const building = new THREE.Mesh(new THREE.BoxGeometry(map.w * 2 - 10, 700, map.h * 2 - 10), new THREE.MeshStandardMaterial({ map: windowsTexture(), roughness: 0.7 }));
      ((building.material as THREE.MeshStandardMaterial).map as THREE.Texture).repeat.set(8, 30);
      ((building.material as THREE.MeshStandardMaterial).map as THREE.Texture).wrapS = THREE.RepeatWrapping;
      ((building.material as THREE.MeshStandardMaterial).map as THREE.Texture).wrapT = THREE.RepeatWrapping;
      building.position.y = -400;
      group.add(building);
      const street = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c2933, roughness: 1 }));
      street.position.y = -750;
      group.add(street);
      // Gedung-gedung kota di sekitar
      const win = windowsTexture();
      win.wrapS = win.wrapT = THREE.RepeatWrapping;
      win.repeat.set(3, 10);
      const cityMat = new THREE.MeshStandardMaterial({ map: win, emissive: 0xffc070, emissiveMap: win, emissiveIntensity: 0.6, roughness: 0.8 });
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
        const dist = 900 + Math.random() * 900;
        const h = 300 + Math.random() * 500;
        const w = 120 + Math.random() * 160;
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), cityMat);
        b.position.set(Math.cos(a) * dist, -750 + h / 2, Math.sin(a) * dist);
        group.add(b);
      }
      break;
    }
  }
  return { group, animate: (t) => animated.forEach((fn) => fn(t)) };
}

/** Gambar kecil map (tampak atas) untuk kartu pilihan map */
export function drawMapThumb(canvas: HTMLCanvasElement, map: ArenaMap) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width;
  const H = canvas.height;
  const voidColor: Record<string, string> = { water: "#1f86c9", icewater: "#5fb3dc", lava: "#ff5a14", space: "#05060f", street: "#2b2438" };
  ctx.fillStyle = voidColor[map.void];
  ctx.fillRect(0, 0, W, H);
  if (map.void === "space") {
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 60; i++) ctx.fillRect((i * 97) % W, (i * 53) % H, 2, 2);
  }
  const ext = map.shape === "rect" ? Math.max(map.w, map.h) : map.size;
  const k = (Math.min(W, H) * 0.44) / ext;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.fillStyle = map.colors.ground;
  ctx.strokeStyle = map.colors.rim;
  ctx.lineWidth = 4;
  ctx.beginPath();
  if (map.shape === "circle") ctx.arc(0, 0, map.size * k, 0, Math.PI * 2);
  else if (map.shape === "rect") ctx.rect(-map.w * k, -map.h * k, map.w * 2 * k, map.h * 2 * k);
  else
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      if (i) ctx.lineTo(Math.cos(a) * map.size * k, Math.sin(a) * map.size * k);
      else ctx.moveTo(Math.cos(a) * map.size * k, Math.sin(a) * map.size * k);
    }
  ctx.fill();
  ctx.stroke();
  const propColor: Record<string, string> = { palm: "#2f7d2a", rock: "#7a7468", crate: "#6f7c8f", pillar: "#9aa0aa", ac: "#d6d3cc", crystal: "#cdf0ff", lamp: "#ffd27a" };
  for (const p of map.props) {
    ctx.fillStyle = propColor[p.kind];
    ctx.beginPath();
    ctx.arc(p.x * k, p.y * k, Math.max(3, p.r * k), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
