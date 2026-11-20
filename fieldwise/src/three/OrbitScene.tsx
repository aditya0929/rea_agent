import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { LatLng } from "../types";
import { buildBeam, buildSatellite } from "./satellite";

// Whole-world true-colour mosaic, rendered on demand by Esri as one equirectangular image.
const earthUrl = (w: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=-180,-90,180,90&bboxSR=4326&imageSR=4326&size=${w},${w / 2}&format=jpg&f=image`;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

let earthLow: Promise<HTMLImageElement> | null = null;
let earthHigh: Promise<HTMLImageElement> | null = null;
/** Start loading once per page: a quick 2048 px image, then a sharper 4096 px one. */
export function preloadEarth() {
  earthLow ??= loadImage(earthUrl(2048));
  earthHigh ??= earthLow.then(() => loadImage(earthUrl(4096)));
  return earthLow;
}

/** Web-mercator imagery stops near 85°; paint the missing polar rows as ice instead of black. */
function withIceCaps(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const cap = Math.ceil(((90 - 84.5) / 180) * c.height);
  for (const [y0, y1] of [[0, cap], [c.height - cap, c.height]]) {
    const grad = g.createLinearGradient(0, y0 === 0 ? y1 : y0, 0, y0 === 0 ? 0 : y1);
    grad.addColorStop(0, "rgba(214,226,232,0.0)");
    grad.addColorStop(0.35, "#d6e2e8");
    grad.addColorStop(1, "#eef3f6");
    g.fillStyle = grad;
    g.fillRect(0, y0, c.width, y1 - y0);
  }
  return c;
}

function oceanTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#0c2b3d");
  grad.addColorStop(0.5, "#0b3a4f");
  grad.addColorStop(1, "#0c2b3d");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  return new THREE.CanvasTexture(c);
}

/** Unit vector for a lat/lng under three.js SphereGeometry's UV layout. */
function surfaceDir({ lat, lng }: LatLng) {
  const u = ((lng + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(-Math.cos(u) * Math.sin(theta), Math.cos(theta), Math.sin(u) * Math.sin(theta));
}

export type OrbitMode = "splash" | "close";

const R = 5;
const ORBIT = 7.1;

export function OrbitScene({ mode = "splash", focus, className, children }: {
  mode?: OrbitMode;
  /** Point the satellite at this place; the globe turns to bring it underneath. */
  focus?: LatLng | null;
  className?: string;
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(mode === "close" ? 38 : 34, 1, 0.1, 1000);
    if (mode === "close") {
      camera.position.set(3.4, 8.6, 6.6);
      camera.lookAt(0, 6.1, 0);
    } else {
      camera.position.set(0, 1.5, 31);
      camera.lookAt(0, -2.2, 0);
    }

    // Light: a warm sun from the upper left, cool fill, and ambient.
    const sun = new THREE.DirectionalLight("#fff4e0", 2.6);
    sun.position.set(-12, 10, 9);
    scene.add(sun, new THREE.AmbientLight("#4a6b86", 0.55));
    const rim = new THREE.DirectionalLight("#7fd3ff", 0.8);
    rim.position.set(10, -4, -8);
    scene.add(rim);

    // Stars.
    const starGeo = new THREE.BufferGeometry();
    const pts = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(180 + Math.random() * 120);
      pts.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
    const starMat = new THREE.PointsMaterial({ color: "#cfe3ff", size: 0.7, sizeAttenuation: true, transparent: true, opacity: 0.8 });
    scene.add(new THREE.Points(starGeo, starMat));

    // Earth.
    const globe = new THREE.Group();
    scene.add(globe);
    const earthGeo = new THREE.SphereGeometry(R, 128, 64);
    const fallback = oceanTexture();
    const earthMat = new THREE.MeshStandardMaterial({ map: fallback, roughness: 0.85, metalness: 0.05 });
    globe.add(new THREE.Mesh(earthGeo, earthMat));
    let earthTex: THREE.Texture | null = null;
    const applyEarth = (img: HTMLImageElement) => {
      if (disposed || (earthTex && (earthTex.image as HTMLCanvasElement).width >= img.width)) return;
      earthTex?.dispose();
      earthTex = new THREE.CanvasTexture(withIceCaps(img));
      earthTex.colorSpace = THREE.SRGBColorSpace;
      earthTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      earthTex.needsUpdate = true;
      earthMat.map = earthTex;
      earthMat.needsUpdate = true;
    };
    preloadEarth().then(applyEarth).catch(() => {});
    earthHigh?.then(applyEarth).catch(() => {});

    // Atmosphere: fresnel glow on a slightly larger back-faced shell.
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { color: { value: new THREE.Color("#5fc4ff") } },
      vertexShader: `varying vec3 vN; varying vec3 vP;
        void main(){ vN = normalize(normalMatrix * normal); vec4 p = modelViewMatrix * vec4(position,1.0); vP = p.xyz; gl_Position = projectionMatrix * p; }`,
      // Back faces: the facing term is 0 at the shell silhouette and grows towards the Earth limb.
      fragmentShader: `uniform vec3 color; varying vec3 vN; varying vec3 vP;
        void main(){ float d = -dot(vN, normalize(-vP)); float g = pow(smoothstep(0.0, 0.42, d), 1.6); gl_FragColor = vec4(color * g, g * 0.9); }`,
    });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 96, 48), atmoMat);
    scene.add(atmo);

    // Target ring on the surface, parented to the globe so it turns with it.
    const ringMat = new THREE.MeshBasicMaterial({ color: "#c6f432", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 48), ringMat);
    const ringPulse = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.26, 48), ringMat.clone());
    globe.add(ring, ringPulse);

    // Satellite on a pivot, so rotating the pivot moves it along its orbit while it keeps facing nadir.
    const pivot = new THREE.Group();
    scene.add(pivot);
    const sat = buildSatellite();
    sat.group.scale.setScalar(mode === "close" ? 0.34 : 0.42);
    sat.group.position.y = ORBIT;
    pivot.add(sat.group);
    const beam = buildBeam();
    beam.mesh.position.y = ORBIT - 0.3;
    beam.mesh.scale.set(0.55, ORBIT - R - 0.3, 0.55);
    pivot.add(beam.mesh);

    // Orbit trail.
    const trail = new THREE.Mesh(
      new THREE.TorusGeometry(ORBIT, 0.006, 6, 256),
      new THREE.MeshBasicMaterial({ color: "#9fdcff", transparent: true, opacity: 0.35 }),
    );
    trail.rotation.y = Math.PI / 2;
    pivot.add(trail);

    const up = new THREE.Vector3(0, 1, 0);
    const target = new THREE.Quaternion();
    let lastFocusKey = "";
    const placeRing = (f: LatLng) => {
      const d = surfaceDir(f);
      for (const m of [ring, ringPulse]) {
        m.position.copy(d.clone().multiplyScalar(R * 1.002));
        m.lookAt(d.clone().multiplyScalar(R * 2));
      }
    };

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      // Keep the globe framed on narrow screens.
      camera.zoom = mode === "splash" ? Math.min(1, camera.aspect / 1.2) : 1;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let disposed = false;
    let raf = 0;
    const start = performance.now();
    const spin = new THREE.Quaternion();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = (performance.now() - start) / 1000;
      const f = focusRef.current;
      if (f) {
        const key = `${f.lat.toFixed(4)},${f.lng.toFixed(4)}`;
        const first = !lastFocusKey;
        if (key !== lastFocusKey) {
          lastFocusKey = key;
          target.setFromUnitVectors(surfaceDir(f), up);
          placeRing(f);
        }
        // Swivel slowly about the vertical so the target stays under the satellite.
        // Snap on the first frame (the scene is short-lived); ease on later focus changes.
        spin.setFromAxisAngle(up, t * 0.05);
        const goal = spin.clone().multiply(target);
        if (first) globe.quaternion.copy(goal);
        else globe.quaternion.slerp(goal, 0.06);
        pivot.rotation.z = Math.sin(t * 0.6) * 0.06;
        ring.visible = ringPulse.visible = true;
      } else {
        globe.rotation.y = t * 0.06;
        globe.rotation.x = 0.35;
        pivot.rotation.z = -0.9 + ((t * 0.12) % 1.8);
        ring.visible = ringPulse.visible = false;
      }
      const s = 1 + ((t * 0.9) % 1) * 1.6;
      ringPulse.scale.setScalar(s);
      (ringPulse.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - ((t * 0.9) % 1));
      beam.material.opacity = 0.13 + 0.07 * Math.sin(t * 4);
      sat.lens.emissiveIntensity = 1.3 + 0.6 * Math.sin(t * 4);
      sat.group.rotation.y = Math.sin(t * 0.4) * 0.25;
      sat.wings.forEach((w, i) => (w.rotation.x = Math.sin(t * 0.3 + i) * 0.08));
      atmo.rotation.y = t * 0.01;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      sat.dispose();
      beam.dispose();
      [starGeo, earthGeo, fallback, atmoMat, atmo.geometry, ring.geometry, ringPulse.geometry, ringMat, ringPulse.material as THREE.Material, trail.geometry, trail.material as THREE.Material, starMat, earthMat].forEach((d) => d.dispose());
      earthTex?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [mode]);

  return (
    <div className={`orbit ${className ?? ""}`}>
      <div className="orbit-canvas" ref={host} />
      {children && <div className="orbit-content">{children}</div>}
    </div>
  );
}
