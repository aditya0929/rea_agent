import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { LatLng } from "../types";
import { OrbitScene, preloadEarth } from "../three/OrbitScene";
import { Icon } from "../components/Icon";

interface Scene {
  id: number;
  caption: string;
  sub?: string;
  focus?: LatLng | null;
  ms: number;
}

const FxContext = createContext<{ play: (s: Omit<Scene, "id" | "ms"> & { ms?: number }) => void }>({ play: () => {} });
export const useFx = () => useContext(FxContext);

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const BOOT_STEPS = ["Acquiring satellite lock", "Downloading the latest passes", "Calibrating crop indices", "Preparing your fields"];

function Splash({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const finish = useCallback(() => {
    setLeaving(true);
    setTimeout(onDone, 600);
  }, [onDone]);
  useEffect(() => {
    const iv = setInterval(() => setStep((s) => Math.min(BOOT_STEPS.length - 1, s + 1)), 900);
    // Stay at least 3.6 s, and until the globe imagery has arrived (at most 7 s).
    let cancelled = false;
    const minWait = new Promise((r) => setTimeout(r, 3600));
    const earth = preloadEarth().catch(() => {});
    const cap = setTimeout(() => !cancelled && finish(), 7000);
    Promise.all([minWait, earth]).then(() => !cancelled && finish());
    return () => {
      cancelled = true;
      clearInterval(iv);
      clearTimeout(cap);
    };
  }, [finish]);
  return (
    <div className={`fx-full splash ${leaving ? "leaving" : ""}`}>
      <OrbitScene mode="splash">
        <div className="splash-copy">
          <span className="brand-mark lg"><Icon name="leaf" size={26} /></span>
          <h1>Fieldwise</h1>
          <p>Every field, seen from space.</p>
          <div className="boot">
            <div className="boot-bar"><i style={{ width: `${((step + 1) / BOOT_STEPS.length) * 100}%` }} /></div>
            <small><span className="dot-live" /> {BOOT_STEPS[step]}…</small>
          </div>
        </div>
        <button className="skip" onClick={finish}>Skip <Icon name="chevron" size={14} /></button>
      </OrbitScene>
    </div>
  );
}

function Transition({ scene, onDone }: { scene: Scene; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setLeaving(true), scene.ms - 450);
    const b = setTimeout(onDone, scene.ms);
    return () => (clearTimeout(a), clearTimeout(b));
  }, [scene, onDone]);
  return (
    <div className={`fx-full transition ${leaving ? "leaving" : ""}`} onClick={onDone}>
      <OrbitScene mode="close" focus={scene.focus ?? null}>
        <div className="transition-copy">
          <small className="eyebrow"><span className="dot-live" /> Retasking satellite</small>
          <h2>{scene.caption}</h2>
          {scene.sub && <p>{scene.sub}</p>}
        </div>
      </OrbitScene>
    </div>
  );
}

const SECTION: Record<string, { caption: string; sub: string }> = {
  "/": { caption: "Field analysis", sub: "Latest clear images and crop indices" },
  "/analytics": { caption: "Analytics", sub: "Comparing every field over the season" },
  "/reports": { caption: "Field reports", sub: "Compiling condition, zones and advice" },
  "/weather": { caption: "Weather", sub: "Forecasts, spray windows and crop water use" },
  "/ops": { caption: "Operations", sub: "Turning what we see into field work" },
};
const sectionOf = (path: string) => (path.startsWith("/ops") ? "/ops" : path.startsWith("/fields") ? null : (path in SECTION ? path : "/"));

export function FxProvider({ children }: { children: ReactNode }) {
  const [splash, setSplash] = useState(() => !sessionStorage.getItem("fieldwise-splash") && !reducedMotion());
  const [scene, setScene] = useState<Scene | null>(null);
  const counter = useRef(0);
  const location = useLocation();
  const lastSection = useRef(sectionOf(location.pathname));

  useEffect(() => void preloadEarth().catch(() => {}), []);

  const play = useCallback((s: Omit<Scene, "id" | "ms"> & { ms?: number }) => {
    if (reducedMotion()) return;
    setScene({ ms: 1900, ...s, id: ++counter.current });
  }, []);

  // A short orbital transition whenever the main section changes.
  useEffect(() => {
    const sec = sectionOf(location.pathname);
    if (sec && lastSection.current && sec !== lastSection.current && !splash) play(SECTION[sec]);
    lastSection.current = sec ?? lastSection.current;
  }, [location.pathname, play, splash]);

  const endSplash = useCallback(() => {
    sessionStorage.setItem("fieldwise-splash", "1");
    setSplash(false);
  }, []);
  const endScene = useCallback(() => setScene(null), []);

  return (
    <FxContext.Provider value={{ play }}>
      {children}
      {scene && <Transition key={scene.id} scene={scene} onDone={endScene} />}
      {splash && <Splash onDone={endSplash} />}
    </FxContext.Provider>
  );
}
