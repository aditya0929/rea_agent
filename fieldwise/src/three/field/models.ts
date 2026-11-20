// Stylised, procedural models for the field diorama. Sizes are in metres but exaggerated
// (a moth spans ~9 m) so they read from the orbit camera. Each factory returns an object
// with an `update(t)` for its idle animation and a `dispose()`.
import * as THREE from "three";

export interface Animated {
  object: THREE.Object3D;
  update: (t: number, dt: number) => void;
  dispose: () => void;
}

class Bag {
  private items: { dispose: () => void }[] = [];
  add<T extends { dispose: () => void }>(x: T): T {
    this.items.push(x);
    return x;
  }
  dispose() {
    this.items.forEach((x) => x.dispose());
  }
}

const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

const shadow = (o: THREE.Object3D) => o.traverse((m) => ((m as THREE.Mesh).isMesh ? (((m as THREE.Mesh).castShadow = true), ((m as THREE.Mesh).receiveShadow = true)) : null));

// ---------------- moth ----------------
export function moth(phase: number): Animated & { wingL: THREE.Object3D; wingR: THREE.Object3D } {
  const bag = new Bag();
  const g = new THREE.Group();
  const bodyMat = bag.add(new THREE.MeshStandardMaterial({ color: "#5a4632", roughness: 0.8 }));
  const body = new THREE.Mesh(bag.add(new THREE.SphereGeometry(1, 16, 12)), bodyMat);
  body.scale.set(0.55, 0.5, 2.1);
  g.add(body);
  const head = new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.55, 12, 10)), bodyMat);
  head.position.z = 2.1;
  g.add(head);
  const eyeMat = bag.add(new THREE.MeshStandardMaterial({ color: "#111", roughness: 0.2, metalness: 0.4 }));
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.2, 8, 6)), eyeMat);
    eye.position.set(0.32 * s, 0.15, 2.45);
    g.add(eye);
    const ant = new THREE.Mesh(bag.add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5)), bodyMat);
    ant.position.set(0.35 * s, 0.7, 2.9);
    ant.rotation.set(0.9, 0, -0.35 * s);
    g.add(ant);
  }
  // Wing: a rounded triangle with a patterned texture, hinged at the body.
  const wingTex = bag.add(canvasTex(128, 128, (x) => {
    const grd = x.createLinearGradient(0, 0, 128, 128);
    grd.addColorStop(0, "#c9a77c");
    grd.addColorStop(1, "#7d6247");
    x.fillStyle = grd;
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = "rgba(40,25,10,0.5)";
    x.lineWidth = 3;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(0, 0); x.lineTo(128, 25 + i * 22); x.stroke(); }
    x.fillStyle = "#3b2a1a";
    x.beginPath(); x.arc(86, 70, 13, 0, 7); x.fill();
    x.fillStyle = "#e9d2a8";
    x.beginPath(); x.arc(86, 70, 6, 0, 7); x.fill();
  }));
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(1.5, 1.6, 4.2, 2.2, 4.6, 0.4);
  shape.bezierCurveTo(4.4, -1.4, 2, -2.6, 0, -0.9);
  const wingGeo = bag.add(new THREE.ShapeGeometry(shape, 12));
  wingGeo.rotateX(-Math.PI / 2);
  const uv = wingGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4.6, (uv.getY(i) + 2.6) / 4.8);
  const wingMat = bag.add(new THREE.MeshStandardMaterial({ map: wingTex, side: THREE.DoubleSide, roughness: 0.9, transparent: true, opacity: 0.95 }));
  const wingL = new THREE.Group(), wingR = new THREE.Group();
  const wl = new THREE.Mesh(wingGeo, wingMat);
  const wr = new THREE.Mesh(wingGeo, wingMat);
  wr.scale.x = -1;
  wingL.add(wl);
  wingR.add(wr);
  wingL.position.set(0.3, 0.25, 0.6);
  wingR.position.set(-0.3, 0.25, 0.6);
  g.add(wingL, wingR);
  shadow(g);
  return {
    object: g,
    wingL,
    wingR,
    update: (t) => {
      const flap = Math.sin(t * 26 + phase) * 0.85;
      wingL.rotation.z = flap;
      wingR.rotation.z = -flap;
    },
    dispose: () => bag.dispose(),
  };
}

// ---------------- beetle ----------------
export function beetle(): Animated {
  const bag = new Bag();
  const g = new THREE.Group();
  const shell = bag.add(new THREE.MeshStandardMaterial({ color: "#2b2620", roughness: 0.25, metalness: 0.35 }));
  const body = new THREE.Mesh(bag.add(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2)), shell);
  body.scale.set(1.3, 0.9, 1.9);
  g.add(body);
  const seam = new THREE.Mesh(bag.add(new THREE.BoxGeometry(0.06, 0.05, 3.4)), bag.add(new THREE.MeshBasicMaterial({ color: "#0d0b09" })));
  seam.position.y = 0.88;
  g.add(seam);
  const head = new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.6, 12, 10)), shell);
  head.position.set(0, 0.2, 2);
  g.add(head);
  const legMat = bag.add(new THREE.MeshStandardMaterial({ color: "#1a1612" }));
  const legs: THREE.Mesh[] = [];
  const legGeo = bag.add(new THREE.CylinderGeometry(0.07, 0.05, 1.6, 5));
  for (const s of [-1, 1]) for (const z of [-0.9, 0.1, 1.1]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(1.25 * s, 0.05, z);
    leg.rotation.z = 1.1 * s;
    g.add(leg);
    legs.push(leg);
  }
  shadow(g);
  return {
    object: g,
    update: (t) => legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 14 + i * 1.3) * 0.45)),
    dispose: () => bag.dispose(),
  };
}

// ---------------- field probe ----------------
export function probe(heading: string, status: string, value: string, bad: boolean, phase: number): Animated {
  const bag = new Bag();
  const g = new THREE.Group();
  const dark = bag.add(new THREE.MeshStandardMaterial({ color: "#1c2a2e", roughness: 0.55, metalness: 0.3 }));
  const housing = new THREE.Group();
  const box = new THREE.Mesh(bag.add(new THREE.BoxGeometry(5.2, 4, 1.4)), dark);
  housing.add(box);
  const accent = bag.add(new THREE.MeshStandardMaterial({ color: bad ? "#cc45b0" : "#8fcf4a", emissive: bad ? "#9d1f8a" : "#4f7a12", emissiveIntensity: 0.6 }));
  const trim = new THREE.Mesh(bag.add(new THREE.BoxGeometry(5.3, 0.25, 1.45)), accent);
  trim.position.y = -2;
  housing.add(trim);
  const screenTex = bag.add(canvasTex(256, 192, (x) => {
    x.fillStyle = "#06140f";
    x.fillRect(0, 0, 256, 192);
    x.fillStyle = "#7fa6a0";
    x.font = "700 20px system-ui";
    x.textAlign = "center";
    x.fillText(heading, 128, 34);
    x.fillStyle = bad ? "#ff6fd0" : "#c6f432";
    x.font = "900 70px system-ui";
    x.fillText(status, 128, 112);
    x.fillStyle = "#d9e7e3";
    x.font = "600 22px system-ui";
    x.fillText(value, 128, 150);
    const w = bad ? 70 : 170;
    x.fillStyle = "rgba(255,255,255,0.12)";
    x.fillRect(38, 164, 180, 10);
    x.fillStyle = bad ? "#ff6fd0" : "#c6f432";
    x.fillRect(38, 164, w, 10);
  }));
  const screen = new THREE.Mesh(bag.add(new THREE.PlaneGeometry(4.4, 3.3)), bag.add(new THREE.MeshBasicMaterial({ map: screenTex })));
  screen.position.set(0, 0.1, 0.71);
  housing.add(screen);
  const ledMat = bag.add(new THREE.MeshBasicMaterial({ color: bad ? "#ff6fd0" : "#c6f432" }));
  const led = new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.28, 10, 8)), ledMat);
  led.position.set(1.9, -1.55, 0.75);
  housing.add(led);
  housing.position.y = 7.5;
  g.add(housing);
  // Two legs into the ground.
  const legGeo = bag.add(new THREE.CylinderGeometry(0.22, 0.12, 6, 8));
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(1.4 * s, 2.8, 0);
    g.add(leg);
  }
  shadow(g);
  return {
    object: g,
    update: (t) => {
      housing.position.y = 7.5 + Math.sin(t * 1.4 + phase) * 0.15;
      ledMat.color.set(Math.sin(t * 4 + phase) > 0.2 ? (bad ? "#ff6fd0" : "#c6f432") : "#1c2a2e");
    },
    dispose: () => bag.dispose(),
  };
}

// ---------------- scouting drone ----------------
export function drone(): Animated {
  const bag = new Bag();
  const g = new THREE.Group();
  const shell = bag.add(new THREE.MeshStandardMaterial({ color: "#e9eef0", roughness: 0.35, metalness: 0.2 }));
  const dark = bag.add(new THREE.MeshStandardMaterial({ color: "#1d2329", roughness: 0.5 }));
  const body = new THREE.Mesh(bag.add(new THREE.BoxGeometry(3.4, 1.2, 3.4)), shell);
  g.add(body);
  const top = new THREE.Mesh(bag.add(new THREE.SphereGeometry(1.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), shell);
  top.position.y = 0.55;
  top.scale.y = 0.5;
  g.add(top);
  const rotors: THREE.Mesh[] = [];
  const armGeo = bag.add(new THREE.BoxGeometry(5.2, 0.35, 0.45));
  const rotorGeo = bag.add(new THREE.CylinderGeometry(1.9, 1.9, 0.06, 24));
  const rotorMat = bag.add(new THREE.MeshBasicMaterial({ color: "#9fb4bb", transparent: true, opacity: 0.35 }));
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(armGeo, dark);
    arm.rotation.y = a;
    g.add(arm);
  }
  for (const [x, z] of [[1.85, 1.85], [-1.85, 1.85], [1.85, -1.85], [-1.85, -1.85]]) {
    const motor = new THREE.Mesh(bag.add(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 10)), dark);
    motor.position.set(x, 0.3, z);
    g.add(motor);
    const rotor = new THREE.Mesh(rotorGeo, rotorMat);
    rotor.position.set(x, 0.65, z);
    g.add(rotor);
    rotors.push(rotor);
  }
  const cam = new THREE.Mesh(bag.add(new THREE.SphereGeometry(0.6, 12, 10)), dark);
  cam.position.y = -0.9;
  g.add(cam);
  const lens = new THREE.Mesh(bag.add(new THREE.CircleGeometry(0.35, 16)), bag.add(new THREE.MeshBasicMaterial({ color: "#c6f432" })));
  lens.rotation.x = Math.PI / 2;
  lens.position.y = -1.45;
  g.add(lens);
  // Scan cone towards the ground.
  const coneGeo = bag.add(new THREE.ConeGeometry(9, 22, 40, 1, true));
  coneGeo.translate(0, -11, 0);
  const coneMat = bag.add(new THREE.MeshBasicMaterial({ color: "#c6f432", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = -1.4;
  g.add(cone);
  shadow(body);
  body.castShadow = true;
  return {
    object: g,
    update: (t) => {
      rotors.forEach((r, i) => (r.rotation.y = t * (i % 2 ? -40 : 40)));
      coneMat.opacity = 0.09 + 0.06 * Math.sin(t * 5);
      g.rotation.z = Math.sin(t * 1.3) * 0.05;
      g.rotation.x = Math.cos(t * 1.1) * 0.05;
    },
    dispose: () => bag.dispose(),
  };
}

// ---------------- harvest crate ----------------
export function crate(fruit: string, phase: number): Animated {
  const bag = new Bag();
  const g = new THREE.Group();
  const woodTex = bag.add(canvasTex(128, 128, (x) => {
    x.fillStyle = "#b07a44";
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = i % 2 ? "#a46f3c" : "#bb8550";
      x.fillRect(0, i * 32 + 2, 128, 28);
    }
    x.strokeStyle = "rgba(60,35,10,0.6)";
    x.lineWidth = 3;
    x.strokeRect(2, 2, 124, 124);
  }));
  const wood = bag.add(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85 }));
  const box = new THREE.Mesh(bag.add(new THREE.BoxGeometry(6, 3.2, 4.2)), wood);
  box.position.y = 1.6;
  g.add(box);
  const fruitMat = bag.add(new THREE.MeshStandardMaterial({ color: fruit, roughness: 0.4 }));
  const fruitGeo = bag.add(new THREE.SphereGeometry(0.75, 12, 10));
  const pile = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const f = new THREE.Mesh(fruitGeo, fruitMat);
    f.position.set(-2.2 + (i % 5) * 1.1, 3.4 + Math.floor(i / 5) * 0.55, -1.2 + (Math.floor(i / 5) % 3) * 1.1);
    pile.add(f);
  }
  g.add(pile);
  shadow(g);
  return {
    object: g,
    update: (t) => (pile.position.y = Math.max(0, Math.sin(t * 2 + phase)) * 0.25),
    dispose: () => bag.dispose(),
  };
}

// ---------------- particles: falling drops or pellets with ground ripples ----------------
export function rain(center: THREE.Vector3, radius: number, color: string, count = 60, ripples = true): Animated {
  const bag = new Bag();
  const g = new THREE.Group();
  const geo = bag.add(new THREE.SphereGeometry(0.45, 8, 6));
  geo.scale(1, 1.8, 1);
  const mat = bag.add(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }));
  const drops = new THREE.InstancedMesh(geo, mat, count);
  const state = Array.from({ length: count }, () => ({ x: (Math.random() - 0.5) * 2 * radius, z: (Math.random() - 0.5) * 2 * radius, y: Math.random() * 40, v: 18 + Math.random() * 10 }));
  g.add(drops);
  const ringGeo = bag.add(new THREE.RingGeometry(0.8, 1.1, 32));
  ringGeo.rotateX(-Math.PI / 2);
  const ringsMat: THREE.MeshBasicMaterial[] = [];
  const rings: THREE.Mesh[] = [];
  if (ripples) {
    for (let i = 0; i < 8; i++) {
      const m = bag.add(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
      const r = new THREE.Mesh(ringGeo, m);
      r.position.set((Math.random() - 0.5) * radius * 1.6, 0.6, (Math.random() - 0.5) * radius * 1.6);
      rings.push(r);
      ringsMat.push(m);
      g.add(r);
    }
  }
  g.position.copy(center);
  const m4 = new THREE.Matrix4();
  return {
    object: g,
    update: (t, dt) => {
      state.forEach((s, i) => {
        s.y -= s.v * dt;
        if (s.y < 0.5) s.y = 30 + Math.random() * 15;
        m4.makeTranslation(s.x, s.y, s.z);
        drops.setMatrixAt(i, m4);
      });
      drops.instanceMatrix.needsUpdate = true;
      rings.forEach((r, i) => {
        const k = (t * 0.6 + i / rings.length) % 1;
        r.scale.setScalar(1 + k * 6);
        ringsMat[i].opacity = 0.7 * (1 - k);
      });
    },
    dispose: () => bag.dispose(),
  };
}
