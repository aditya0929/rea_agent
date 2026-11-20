// Procedural Earth-observation satellite. Built from primitives so it needs no model files.
// The group's -Y axis is the imaging direction (nadir); point it at the target with lookDown().
import * as THREE from "three";

function panelTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b1d3a";
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 16; x++) {
    for (let y = 0; y < 8; y++) {
      const grad = g.createLinearGradient(x * 16, y * 16, x * 16 + 14, y * 16 + 14);
      grad.addColorStop(0, "#2a5ea8");
      grad.addColorStop(1, "#14305f");
      g.fillStyle = grad;
      g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
    }
  }
  g.strokeStyle = "rgba(200,220,255,0.35)";
  g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 126);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function foilTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, "#f3cf6b");
  grad.addColorStop(0.45, "#b8862a");
  grad.addColorStop(1, "#e8b84e");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Crinkles.
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? "255,240,190" : "90,60,10"},${0.15 + Math.random() * 0.2})`;
    g.beginPath();
    g.moveTo(Math.random() * 128, Math.random() * 128);
    g.lineTo(Math.random() * 128, Math.random() * 128);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Satellite {
  group: THREE.Group;
  /** Glowing lens; pulse its intensity while scanning. */
  lens: THREE.MeshStandardMaterial;
  wings: THREE.Group[];
  dispose: () => void;
}

export function buildSatellite(): Satellite {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  const foil = track(new THREE.MeshStandardMaterial({ map: track(foilTexture()), metalness: 0.85, roughness: 0.32 }));
  const white = track(new THREE.MeshStandardMaterial({ color: "#e9edf2", metalness: 0.3, roughness: 0.45 }));
  const dark = track(new THREE.MeshStandardMaterial({ color: "#1d2329", metalness: 0.6, roughness: 0.4 }));
  const panel = track(new THREE.MeshStandardMaterial({ map: track(panelTexture()), metalness: 0.5, roughness: 0.25, emissive: "#0a1f45", emissiveIntensity: 0.4 }));
  const lens = track(new THREE.MeshStandardMaterial({ color: "#d9f99d", emissive: "#b5f05a", emissiveIntensity: 1.6 }));

  // Bus with a white top deck and dark radiator bands.
  const bus = new THREE.Mesh(track(new THREE.BoxGeometry(1, 1.3, 1)), foil);
  group.add(bus);
  const deck = new THREE.Mesh(track(new THREE.BoxGeometry(1.04, 0.12, 1.04)), white);
  deck.position.y = 0.66;
  group.add(deck);
  for (const y of [-0.25, 0.2]) {
    const band = new THREE.Mesh(track(new THREE.BoxGeometry(1.02, 0.06, 1.02)), dark);
    band.position.y = y;
    group.add(band);
  }

  // Imaging sensor on the nadir face.
  const barrel = new THREE.Mesh(track(new THREE.CylinderGeometry(0.22, 0.26, 0.4, 24)), dark);
  barrel.position.y = -0.85;
  group.add(barrel);
  const glass = new THREE.Mesh(track(new THREE.CircleGeometry(0.19, 24)), lens);
  glass.rotation.x = Math.PI / 2;
  glass.position.y = -1.06;
  group.add(glass);

  // Communications dish on top.
  const dish = new THREE.Mesh(track(new THREE.SphereGeometry(0.38, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6)), white);
  dish.material.side = THREE.DoubleSide;
  dish.position.set(0.15, 0.95, 0.1);
  dish.rotation.set(0.5, 0, -0.4);
  group.add(dish);
  const feed = new THREE.Mesh(track(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8)), dark);
  feed.position.set(0.15, 1.05, 0.1);
  feed.rotation.set(0.5, 0, -0.4);
  group.add(feed);

  // Solar wings: boom plus two hinged panels each side.
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    const boom = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8)), dark);
    boom.rotation.z = Math.PI / 2;
    boom.position.x = side * 0.85;
    wing.add(boom);
    for (let i = 0; i < 2; i++) {
      const p = new THREE.Mesh(track(new THREE.BoxGeometry(1.5, 0.03, 0.95)), panel);
      p.position.x = side * (1.25 + 0.78 + i * 1.56);
      wing.add(p);
    }
    group.add(wing);
    wings.push(wing);
  }

  return {
    group,
    lens,
    wings,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/** Scan beam: a soft additive cone from the lens down to the target. */
export function buildBeam(color = "#c6f432") {
  const geometry = new THREE.ConeGeometry(1, 1, 48, 1, true);
  geometry.translate(0, -0.5, 0); // apex at origin, opening downward
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, material, dispose: () => (geometry.dispose(), material.dispose()) };
}
