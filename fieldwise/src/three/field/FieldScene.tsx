import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Field } from "../../types";
import type { Layer } from "../../lib/sat";
import { bbox } from "../../lib/geo";
import { CONCERN_COLORS, localFrame, type ConcernGrid, type HotspotView, type Local, type ProbeReading } from "../../lib/fieldview";
import { beetle, crate, drone, moth, probe, rain, type Animated } from "./models";
import { stitchImagery } from "./imagery";

const PAD = 0.45; // imagery margin around the field, as a share of its size
const FRUIT: Record<string, string> = { apple: "#c8332c", grapes: "#6b2d6e", tomato: "#d8402e", maize: "#f1c232", soybean: "#d7c08a", "oil-palm": "#b5381e", almonds: "#b98a5a", tea: "#4f8a2f" };
const PROBE_HEADING: Partial<Record<Layer, string>> = { soil: "SOIL CARBON", water: "MOISTURE", nutrients: "NITROGEN" };

const v3 = (l: Local, y = 0) => new THREE.Vector3(l.x, y, -l.y);
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function inside(pt: Local, poly: Local[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function soilTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, "#5d4a33");
  grd.addColorStop(0.25, "#4a3a28");
  grd.addColorStop(1, "#1d1710");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "140,110,70"},0.25)`;
    g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Core {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  animated: Animated[];
  disposables: { dispose: () => void }[];
  reveal: null;
  pulse: { uniforms: { value: number }[] };
  label: THREE.Vector3 | null;
  span: number;
  camTween: { from: THREE.Vector3; to: THREE.Vector3; start: number; ms: number } | null;
  idleSince: number;
  /** Keep adjusting the distance to fit the free area until the user zooms. */
  autoFrame: boolean;
}

export function FieldScene({ field, layer, passKey, grid, hotspot, readings, threeD, insetLeft = 0, onHotspotClick }: {
  field: Field;
  layer: Layer;
  passKey: number;
  grid: ConcernGrid;
  hotspot: HotspotView | null;
  readings: ProbeReading[];
  threeD: boolean;
  /** Pixels covered by panels on the left; the field is centred in the space that remains. */
  insetLeft?: number;
  onHotspotClick: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLButtonElement>(null);
  const core = useRef<Core | null>(null);
  const threeDRef = useRef(threeD);
  threeDRef.current = threeD;
  const insetRef = useRef(insetLeft);
  insetRef.current = insetLeft;

  // ---- per field: renderer, camera, slab, imagery ----
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);

    const { toLocal } = localFrame(field);
    const b = bbox(field.boundary);
    const dLat = (b.maxLat - b.minLat) * PAD, dLng = (b.maxLng - b.minLng) * PAD;
    const minLat = b.minLat - dLat, maxLat = b.maxLat + dLat, minLng = b.minLng - dLng, maxLng = b.maxLng + dLng;
    const sw = toLocal({ lat: minLat, lng: minLng }), ne = toLocal({ lat: maxLat, lng: maxLng });
    const W = ne.x - sw.x, D = ne.y - sw.y;
    const span = Math.max(W, D) / (1 + 2 * PAD);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog("#0a2a33", span * 2.4, span * 7);
    // A near plane scaled to the field keeps depth precision high enough for layers a metre apart.
    const camera = new THREE.PerspectiveCamera(38, 1, Math.max(2, span * 0.06), span * 30);
    const disposables: { dispose: () => void }[] = [];
    const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

    scene.add(new THREE.HemisphereLight("#cfe8ff", "#3a2e1f", 1.1));
    const sun = new THREE.DirectionalLight("#fff1d6", 2.4);
    sun.position.set(-span * 0.9, span * 1.6, span * 0.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 5 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // Slab: imagery on top, soil on the sides.
    const soil = keep(soilTexture());
    const sideMat = keep(new THREE.MeshStandardMaterial({ map: soil, roughness: 1 }));
    const topMat = keep(new THREE.MeshStandardMaterial({ color: "#243a2c", roughness: 0.95 }));
    const bottomMat = keep(new THREE.MeshStandardMaterial({ color: "#120e09" }));
    const thick = Math.max(6, span * 0.035);
    const slab = new THREE.Mesh(keep(new THREE.BoxGeometry(W, thick, D)), [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat]);
    slab.position.set(sw.x + W / 2, -thick / 2, -(sw.y + D / 2));
    slab.receiveShadow = true;
    scene.add(slab);
    // Quick low-res imagery first, then the sharp version.
    let alive = true;
    const applyImagery = (canvas: HTMLCanvasElement) => {
      if (!alive) return;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      topMat.map?.dispose();
      topMat.map = tex;
      topMat.color.set("#ffffff");
      topMat.needsUpdate = true;
    };
    stitchImagery(minLng, minLat, maxLng, maxLat, 512).then(applyImagery)
      .then(() => stitchImagery(minLng, minLat, maxLng, maxLat, 2048)).then(applyImagery).catch(() => {});

    // The void: faint grid far below.
    const gridHelper = new THREE.GridHelper(span * 12, 48, "#1f5866", "#163f4a");
    gridHelper.position.y = -span * 0.35;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.35;
    keep(gridHelper.geometry);
    keep(gridHelper.material as THREE.Material);
    scene.add(gridHelper);

    const content = new THREE.Group();
    scene.add(content);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(78);
    controls.minDistance = span * 0.35;
    controls.maxDistance = span * 3.5;
    controls.autoRotateSpeed = 0.45;
    controls.enabled = false;

    const c: Core = {
      renderer, scene, camera, controls, content, animated: [], disposables,
      reveal: null, pulse: { uniforms: [] }, label: null, span, camTween: null, idleSince: performance.now(), autoFrame: true,
    };
    core.current = c;
    if (import.meta.env.DEV) (window as unknown as { __fieldScene: Core }).__fieldScene = c;
    controls.addEventListener("start", () => ((controls.autoRotate = false), (c.idleSince = Infinity)));
    // A manual zoom means the user has chosen a distance; stop auto-framing.
    renderer.domElement.addEventListener("wheel", () => (c.autoFrame = false), { passive: true });
    controls.addEventListener("end", () => (c.idleSince = performance.now()));

    // Intro: swoop down from orbit into a tilted three-quarter view.
    const dist = span * 1.95;
    const fit = THREE.MathUtils.clamp((0.95 * el.clientWidth) / Math.max(1, el.clientWidth - insetRef.current), 1, 1.65);
    const final = new THREE.Vector3().setFromSphericalCoords(dist * fit, THREE.MathUtils.degToRad(threeDRef.current ? 52 : 1), THREE.MathUtils.degToRad(-32));
    camera.position.set(0, span * 3.6, span * 0.4);
    camera.lookAt(0, 0, 0);
    c.camTween = { from: camera.position.clone(), to: final, start: performance.now(), ms: 2600 };

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    let offset = insetRef.current;
    let last = performance.now();
    const t0 = last;
    const tmp = new THREE.Vector3();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      // Glide the projection centre into the free area beside the panels.
      offset += (insetRef.current - offset) * 0.08;
      camera.setViewOffset(el.clientWidth, el.clientHeight, -offset / 2, 0, el.clientWidth, el.clientHeight);
      // Back the camera off when panels leave less room, so the whole field stays in view.
      const room = THREE.MathUtils.clamp((0.95 * el.clientWidth) / Math.max(1, el.clientWidth - offset), 1, 1.65);
      if (!c.camTween && now - c.idleSince > 400) {
        const d = camera.position.distanceTo(controls.target);
        const want = span * 1.95 * room;
        if (Math.abs(want - d) > span * 0.01 && c.autoFrame) {
          camera.position.sub(controls.target).multiplyScalar(1 + ((want - d) / d) * 0.06).add(controls.target);
        }
      }
      if (c.camTween) {
        const k = Math.min(1, (now - c.camTween.start) / c.camTween.ms);
        camera.position.lerpVectors(c.camTween.from, c.camTween.to, ease(k));
        camera.lookAt(controls.target);
        if (k >= 1) {
          c.camTween = null;
          controls.enabled = true;
          c.idleSince = now;
        }
      } else {
        // Resume a slow orbit after a few idle seconds (not in top-down mode).
        controls.autoRotate = threeDRef.current && now - c.idleSince > 6000;
        controls.update();
      }
      c.pulse.uniforms.forEach((u) => (u.value = t));
      c.animated.forEach((a) => a.update(t, dt));
      if (labelRef.current) {
        if (c.label && !c.camTween) {
          tmp.copy(c.label).project(camera);
          const x = (tmp.x * 0.5 + 0.5) * el.clientWidth, y = (-tmp.y * 0.5 + 0.5) * el.clientHeight;
          labelRef.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
          labelRef.current.style.opacity = tmp.z < 1 ? "1" : "0";
        } else labelRef.current.style.opacity = "0";
      }
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      alive = false;
      topMat.map?.dispose();
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      c.animated.forEach((a) => a.dispose());
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      core.current = null;
    };
  }, [field.id, field.boundary.length]);

  // ---- per layer / image: zones, outlines, models ----
  useEffect(() => {
    const c = core.current;
    if (!c) return;
    // Clear the previous content.
    c.animated.forEach((a) => a.dispose());
    c.animated = [];
    const old = c.content.children.slice();
    old.forEach((o) => {
      c.content.remove(o);
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((mt) => {
            (mt as THREE.MeshBasicMaterial).map?.dispose();
            mt.dispose();
          });
        }
      });
    });
    c.pulse.uniforms = [];

    const { toLocal } = localFrame(field);
    const boundary = field.boundary.map(toLocal);
    const span = c.span;
    // Vertical stacking above the slab, scaled so layers stay depth-separated at any field size.
    const lift = Math.max(0.6, span * 0.0025);

    // Zone pixels: one flat instanced square per 10 m satellite pixel, coloured by concern.
    // A scan sweep pops them in west to east, with a lime scan bar riding the front.
    const timeU = { value: 0 };
    c.pulse.uniforms.push(timeU);
    const cellGeo = new THREE.PlaneGeometry(grid.cell * 0.94, grid.cell * 0.94);
    cellGeo.rotateX(-Math.PI / 2);
    const cells: { idx: number; x: number; z: number; lvl: number }[] = [];
    for (let r = 0; r < grid.rows; r++) for (let col = 0; col < grid.cols; col++) {
      const lvl = grid.levels[r * grid.cols + col];
      if (lvl < 0) continue;
      cells.push({ idx: r * grid.cols + col, x: grid.x0 + (col + 0.5) * grid.cell, z: -(grid.y0 + (r + 0.5) * grid.cell), lvl });
    }
    const hot = cells.filter((x) => x.lvl > 0), calm = cells.filter((x) => x.lvl === 0);
    const hotMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.78, depthWrite: false });
    const calmMat = new THREE.MeshBasicMaterial({ color: "#f7e3f2", transparent: true, opacity: 0.2, depthWrite: false });
    const hotMesh = new THREE.InstancedMesh(cellGeo, hotMat, Math.max(1, hot.length));
    const calmMesh = new THREE.InstancedMesh(cellGeo.clone(), calmMat, Math.max(1, calm.length));
    hotMesh.count = hot.length;
    calmMesh.count = calm.length;
    const colors = CONCERN_COLORS.map((h) => new THREE.Color(h));
    hot.forEach((x, i) => hotMesh.setColorAt(i, colors[x.lvl - 1]));
    if (hotMesh.instanceColor) hotMesh.instanceColor.needsUpdate = true;
    hotMesh.position.y = lift;
    calmMesh.position.y = lift * 0.6;
    // Bounds are computed while every pixel is still at scale 0, so skip frustum culling.
    hotMesh.frustumCulled = calmMesh.frustumCulled = false;
    c.content.add(calmMesh, hotMesh);

    const xs = cells.map((x) => x.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const barGeo = new THREE.PlaneGeometry(grid.cell * 0.6, grid.rows * grid.cell * 1.05);
    barGeo.rotateX(-Math.PI / 2);
    const barMat = new THREE.MeshBasicMaterial({ color: "#c6f432", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(minX, lift * 2, -(grid.y0 + (grid.rows * grid.cell) / 2));
    c.content.add(bar);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const place = (mesh: THREE.InstancedMesh, list: typeof cells, front: number) => {
      list.forEach((x, i) => {
        const k = THREE.MathUtils.clamp((front - x.x) / (grid.cell * 3), 0, 1);
        const pop = k < 1 ? k * (1.25 - 0.25 * k) : 1; // slight overshoot as each pixel lands
        sc.set(pop, 1, pop);
        pos.set(x.x, 0, x.z);
        mesh.setMatrixAt(i, m4.compose(pos, q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    const revealStart = performance.now() + (c.camTween ? 1400 : 0);
    let revealed = false;
    place(hotMesh, hot, -Infinity);
    place(calmMesh, calm, -Infinity);
    c.animated.push({
      object: bar,
      update: () => {
        if (revealed) return;
        const k = Math.max(0, (performance.now() - revealStart) / 1800);
        const front = minX - grid.cell * 2 + k * (maxX - minX + grid.cell * 6);
        place(hotMesh, hot, front);
        place(calmMesh, calm, front);
        bar.position.x = front;
        barMat.opacity = k > 0 && k < 1 ? 0.55 : 0;
        if (k >= 1) revealed = true;
      },
      dispose: () => {},
    });
    c.reveal = null;

    // Field boundary: a bright white tube with a soft glow.
    const path = new THREE.CurvePath<THREE.Vector3>();
    boundary.forEach((p, i) => path.add(new THREE.LineCurve3(v3(p, lift * 3), v3(boundary[(i + 1) % boundary.length], lift * 3))));
    const segs = Math.max(64, boundary.length * 6);
    c.content.add(new THREE.Mesh(new THREE.TubeGeometry(path, segs, Math.max(0.7, span * 0.0035), 6, false), new THREE.MeshBasicMaterial({ color: "#ffffff" })));
    c.content.add(new THREE.Mesh(new THREE.TubeGeometry(path, segs, Math.max(2, span * 0.01), 6, false), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.12, depthWrite: false })));

    // Hotspot: animated dashed glow outline, soft fill and pulsing dots.
    c.label = null;
    if (hotspot) {
      const curve = new THREE.CatmullRomCurve3(hotspot.loop.map((p) => v3(p, lift * 3.4)), true, "centripetal");
      const dashMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: timeU },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          void main(){
            float d = fract(vUv.x * 36.0 - uTime * 0.8);
            float on = smoothstep(0.0, 0.08, d) * (1.0 - smoothstep(0.55, 0.63, d));
            vec3 col = mix(vec3(0.78, 0.96, 0.2), vec3(1.0), on * 0.6);
            gl_FragColor = vec4(col, 0.55 + on * 0.45);
          }`,
      });
      const r = Math.max(0.9, span * 0.0045);
      c.content.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 256, r, 8, true), dashMat));
      const glowMat = new THREE.MeshBasicMaterial({ color: "#c6f432", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
      c.content.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 256, r * 3.2, 8, true), glowMat));
      const shape = new THREE.Shape(hotspot.loop.map((p) => new THREE.Vector2(p.x, p.y)));
      const fillGeo = new THREE.ShapeGeometry(shape, 24);
      fillGeo.rotateX(-Math.PI / 2);
      const fillMat = new THREE.MeshBasicMaterial({ color: "#c6f432", transparent: true, opacity: 0.1, depthWrite: false });
      const fill = new THREE.Mesh(fillGeo, fillMat);
      fill.position.y = lift * 2;
      c.content.add(fill);
      // Pulsing dots inside the hotspot.
      const dotGeo = new THREE.RingGeometry(1, 1.5, 24);
      dotGeo.rotateX(-Math.PI / 2);
      const dots: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; ph: number }[] = [];
      const xs = hotspot.loop.map((p) => p.x), ys = hotspot.loop.map((p) => p.y);
      let tries = 0;
      while (dots.length < 16 && tries++ < 400) {
        const p = { x: Math.min(...xs) + Math.random() * (Math.max(...xs) - Math.min(...xs)), y: Math.min(...ys) + Math.random() * (Math.max(...ys) - Math.min(...ys)) };
        if (!inside(p, hotspot.loop)) continue;
        const mat = new THREE.MeshBasicMaterial({ color: "#f4ffd1", transparent: true, opacity: 0.6, depthWrite: false });
        const m = new THREE.Mesh(dotGeo, mat);
        m.position.copy(v3(p, lift * 2.4));
        m.scale.setScalar(Math.max(1, span * 0.005));
        c.content.add(m);
        dots.push({ m, mat, ph: Math.random() * 6 });
      }
      c.animated.push({
        object: fill,
        update: (t) => {
          fillMat.opacity = 0.08 + 0.05 * Math.sin(t * 2);
          glowMat.opacity = 0.16 + 0.1 * Math.sin(t * 2.4);
          dots.forEach((d) => {
            const k = (t * 0.5 + d.ph) % 1;
            d.mat.opacity = 0.75 * (1 - k);
            d.m.scale.setScalar(Math.max(1, span * 0.005) * (0.6 + k * 0.9));
          });
        },
        dispose: () => {},
      });
      c.label = v3(hotspot.center, Math.max(14, span * 0.07));
    }

    // Layer models.
    const scale = Math.max(1.2, span / 150);
    const add = (a: Animated) => {
      a.object.scale.multiplyScalar(scale);
      c.content.add(a.object);
      c.animated.push(a);
    };
    const hc = hotspot ? hotspot.center : { x: 0, y: 0 };
    const hr = hotspot ? Math.max(...hotspot.loop.map((p) => Math.hypot(p.x - hc.x, p.y - hc.y))) : span * 0.15;

    if (layer === "pests") {
      for (let i = 0; i < 9; i++) {
        const m = moth(i * 1.7);
        m.object.scale.setScalar(2); // insects are drawn larger than life so they read from orbit
        const rad = hr * (0.35 + Math.random() * 0.75), h = (8 + Math.random() * 14) * scale, sp = 0.25 + Math.random() * 0.35, ph = Math.random() * 6.28;
        const base = m.update;
        const pos = (t: number) => new THREE.Vector3(hc.x + Math.cos(t * sp + ph) * rad, h + Math.sin(t * 1.7 + ph) * 2 * scale, -(hc.y + Math.sin(t * sp * 1.3 + ph) * rad * 0.8));
        add({ ...m, update: (t, dt) => { base(t, dt); m.object.position.copy(pos(t)); m.object.lookAt(pos(t + 0.15)); } });
      }
      const len = path.getLength();
      for (let i = 0; i < 7; i++) {
        const bt = beetle();
        const off = i / 7, sp = (4 + Math.random() * 3) * scale;
        const base = bt.update;
        add({ ...bt, update: (t, dt) => {
          base(t, dt);
          const u = (off + (t * sp) / len) % 1;
          const p = path.getPointAt(u), q = path.getPointAt((u + 0.002) % 1);
          bt.object.position.set(p.x, lift * 3, p.z);
          bt.object.lookAt(q.x, lift * 3, q.z);
        } });
      }
    } else if (layer === "health") {
      const d = drone();
      const base = d.update;
      add({ ...d, update: (t, dt) => {
        base(t, dt);
        d.object.position.set(hc.x + hr * 0.6 + Math.sin(t * 0.45) * hr * 0.4, 34 * scale + Math.sin(t * 1.2) * 1.5, -(hc.y + Math.sin(t * 0.9) * hr * 0.35));
      } });
    } else if (layer === "yield") {
      const good = [];
      for (let i = 0; i < grid.levels.length && good.length < 60; i += 7) if (grid.levels[i] === 0) good.push(i);
      for (let k = 0; k < Math.min(5, good.length); k++) {
        const idx = good[Math.floor((k / 5) * good.length)];
        const cr = crate(FRUIT[field.crop] ?? "#e07a2f", k);
        cr.object.position.copy(v3({ x: grid.x0 + ((idx % grid.cols) + 0.5) * grid.cell, y: grid.y0 + (Math.floor(idx / grid.cols) + 0.5) * grid.cell }, 0.4));
        cr.object.rotation.y = k * 0.7;
        add(cr);
      }
    }
    if (PROBE_HEADING[layer]) {
      readings.forEach((r, i) => {
        const p = probe(PROBE_HEADING[layer]!, r.status, r.value, r.bad, i);
        p.object.position.copy(v3(r.at, 0.3));
        p.object.rotation.y = -0.55; // face the default camera angle
        add(p);
        p.object.scale.multiplyScalar(1.7); // probes carry text, so they need to be larger

      });
    }
    if (layer === "water" && hotspot) {
      const rr = rain(v3(hc, 0), hr * 0.6, "#7cc8ff", 70, true);
      rr.object.scale.setScalar(1);
      c.content.add(rr.object);
      c.animated.push(rr);
    }
    if (layer === "nutrients" && hotspot) {
      const pellets = rain(v3(hc, 0), hr * 0.6, "#f4f1e8", 90, false);
      c.content.add(pellets.object);
      c.animated.push(pellets);
    }
  }, [field.id, layer, passKey, grid, hotspot, readings]);

  // ---- 2D / 3D camera switch ----
  useEffect(() => {
    const c = core.current;
    if (!c || c.camTween) return;
    const dist = c.camera.position.distanceTo(c.controls.target);
    const sph = new THREE.Spherical().setFromVector3(c.camera.position.clone().sub(c.controls.target));
    const to = new THREE.Vector3().setFromSphericalCoords(dist, THREE.MathUtils.degToRad(threeD ? 52 : 0.5), threeD ? sph.theta : 0).add(c.controls.target);
    c.controls.enabled = false;
    c.camTween = { from: c.camera.position.clone(), to, start: performance.now(), ms: 1200 };
  }, [threeD]);

  return (
    <div className="field-scene">
      <div className="field-scene-canvas" ref={host} />
      {hotspot && (
        <button ref={labelRef} className="scene-label" onClick={onHotspotClick} style={{ opacity: 0 }}>
          <b>{hotspot.label[0]}</b>
          <small>{hotspot.label[1]}</small>
        </button>
      )}
    </div>
  );
}
