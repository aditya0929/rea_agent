import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildBeam, buildSatellite } from "./satellite";

const DURATION = 3.2;

/**
 * Transparent overlay: the satellite glides across the top of the map and
 * sweeps its beam over the centre, once per `runKey`. Pointer events pass through.
 */
export function ScanOverlay({ runKey, onDone }: { runKey: string; onDone?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done.current?.();
      return;
    }
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.2, 14);
    camera.lookAt(0, 0.6, 0);
    const sun = new THREE.DirectionalLight("#fff4e0", 2.8);
    sun.position.set(-6, 8, 6);
    scene.add(sun, new THREE.AmbientLight("#6b8aa3", 0.8));

    const sat = buildSatellite();
    sat.group.scale.setScalar(0.42);
    sat.group.rotation.set(0.25, 0.5, 0);
    scene.add(sat.group);
    const beam = buildBeam();
    scene.add(beam.mesh);

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    // Half-width of the view at the satellite's depth, so it enters and exits off-screen.
    const halfW = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z * camera.aspect;
    let raf = 0;
    let finished = false;
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      const k = Math.min(1, t / DURATION);
      // Ease in, linger over the field, ease out.
      const e = k < 0.5 ? 0.5 - 0.5 * Math.pow(1 - 2 * k, 2.2) : 0.5 + 0.5 * Math.pow(2 * k - 1, 2.2);
      const x = THREE.MathUtils.lerp(-halfW() - 3, halfW() + 3, e);
      sat.group.position.set(x, 3.2, 0);
      sat.group.rotation.z = Math.sin(t * 2) * 0.04;
      const over = Math.max(0, 1 - Math.abs(x) / (halfW() * 0.9));
      beam.mesh.position.set(x, 2.75, 0);
      beam.mesh.scale.set(0.9 + over * 0.8, 6.5, 0.9 + over * 0.8);
      beam.material.opacity = 0.06 + 0.2 * over * (0.85 + 0.15 * Math.sin(t * 12));
      sat.lens.emissiveIntensity = 1 + over * 1.5;
      renderer.render(scene, camera);
      if (k >= 1) {
        if (!finished) (finished = true), done.current?.();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      sat.dispose();
      beam.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [runKey]);

  return <div className="scan-overlay" ref={host} aria-hidden="true" />;
}
