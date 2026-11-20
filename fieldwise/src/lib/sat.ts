// Simulated satellite pipeline. Deterministic per field, so every reload shows
// the same passes, maps and zones. Replace with real Sentinel-2 indices later;
// the rest of the app only talks to the functions exported here.
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { FeatureCollection, Polygon } from "geojson";
import type { Field, LatLng, TaskType } from "../types";
import { bbox, toPolygon } from "./geo";
import { growthCurve } from "./crops";

export const DAY = 86_400_000;
export const REVISIT_DAYS = 5;
const HISTORY_DAYS = 60;

export type Layer = "health" | "water" | "nutrients" | "pests" | "soil" | "yield";

export interface LayerMeta {
  id: Layer;
  label: string;
  index: string;
  /** For "pests" a higher value is worse. */
  higherIsBetter: boolean;
  ramp: string[];
  classes: [string, string, string];
}

// One-hue sequential ramps, light -> dark (dark = more of the quantity).
export const LAYERS: LayerMeta[] = [
  { id: "health", label: "Crop health", index: "NDVI", higherIsBetter: true,
    ramp: ["#f3f8e6", "#d4eaa6", "#a9d273", "#74b148", "#3f8a2c", "#1d5e1c"], classes: ["Healthy", "Moderate", "Poor"] },
  { id: "water", label: "Water", index: "NDMI", higherIsBetter: true,
    ramp: ["#eef5fd", "#cde2fb", "#9ec5f4", "#5598e7", "#256abf", "#104281"], classes: ["Well watered", "Drying", "Dry"] },
  { id: "nutrients", label: "Nutrients", index: "N index", higherIsBetter: true,
    ramp: ["#f6f2fb", "#ddd2f3", "#b9a6e8", "#9085e9", "#6250d6", "#3d2f9a"], classes: ["Sufficient", "Low", "Deficient"] },
  { id: "pests", label: "Pest risk", index: "Risk", higherIsBetter: false,
    ramp: ["#fdf1ea", "#f9d3bf", "#f3a984", "#eb6834", "#c24a1c", "#8a3110"], classes: ["Low risk", "Elevated", "High risk"] },
  { id: "soil", label: "Soil", index: "SOC index", higherIsBetter: true,
    ramp: ["#f7efe6", "#e6cfb3", "#cfa57a", "#a87444", "#7a4e26", "#4f3115"], classes: ["Rich", "Average", "Depleted"] },
  { id: "yield", label: "Yield", index: "Yield potential", higherIsBetter: true,
    ramp: ["#fdf6e0", "#f8e3a3", "#f1c75e", "#d9a21c", "#a87a0c", "#6e4f06"], classes: ["On target", "Below target", "At risk"] },
];
export const layerMeta = (id: Layer) => LAYERS.find((l) => l.id === id)!;

// ---------- deterministic noise ----------
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lattice = (seed: number, x: number, y: number) => rng(seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263))();
const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(seed: number, x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smooth(x - xi), ty = smooth(y - yi);
  const a = lattice(seed, xi, yi), b = lattice(seed, xi + 1, yi);
  const c = lattice(seed, xi, yi + 1), d = lattice(seed, xi + 1, yi + 1);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

const fbm = (seed: number, x: number, y: number) =>
  0.55 * valueNoise(seed, x * 3, y * 3) + 0.3 * valueNoise(seed + 1, x * 7, y * 7) + 0.15 * valueNoise(seed + 2, x * 15, y * 15);

// ---------- passes ----------
export interface Pass {
  index: number;
  date: number;
  cloud: number;
  clear: boolean;
}

/** Revisit days fall on a fixed per-field phase, at 10:30 local. */
function passDay(field: Field, dayNumber: number) {
  return (dayNumber - (hashString(field.id) % REVISIT_DAYS)) % REVISIT_DAYS === 0;
}

const at1030 = (dayNumber: number) => {
  const d = new Date(dayNumber * DAY);
  d.setHours(10, 30, 0, 0);
  return d.getTime();
};

export function isProcessing(field: Field, now: number) {
  return now < field.readyAt;
}

export function passesFor(field: Field, now: number): Pass[] {
  if (isProcessing(field, now)) return [];
  const today = Math.floor(now / DAY);
  const out: Pass[] = [];
  for (let d = today - HISTORY_DAYS; d <= today; d++) {
    if (!passDay(field, d)) continue;
    const date = at1030(d);
    if (date > now) continue;
    const r = rng(hashString(field.id) ^ d)();
    const cloud = Math.round(r < 0.7 ? r * 40 : 40 + (r - 0.7) * 200);
    out.push({ index: out.length, date, cloud, clear: cloud < 45 });
  }
  // Always end on a usable image so a field is never empty.
  if (out.length && !out[out.length - 1].clear) out[out.length - 1] = { ...out[out.length - 1], cloud: 12, clear: true };
  return out;
}

export function nextPass(field: Field, now: number) {
  const today = Math.floor(now / DAY);
  for (let d = today; d <= today + REVISIT_DAYS + 1; d++) {
    if (passDay(field, d) && at1030(d) > now) {
      const cloud = Math.round(rng(hashString(field.id) ^ d)() * 100);
      return { date: at1030(d), cloudForecast: cloud };
    }
  }
  return { date: now + REVISIT_DAYS * DAY, cloudForecast: 50 };
}

// ---------- stress hotspots ----------
export interface Hotspot {
  id: string;
  label: string;
  layer: "water" | "pests" | "nutrients";
  /** Position in the field's unit bbox. */
  u: number;
  v: number;
  radius: number;
  /** Pass index at which the problem starts. */
  onset: number;
  growth: number;
}

const HOTSPOT_LAYERS: Hotspot["layer"][] = ["water", "pests", "nutrients"];

export function hotspots(field: Field): Hotspot[] {
  const r = rng(hashString(`${field.id}:hotspots`));
  const poly = toPolygon(field.boundary);
  const b = bbox(field.boundary);
  const count = 2 + Math.floor(r() * 3);
  const out: Hotspot[] = [];
  for (let i = 0, tries = 0; out.length < count && tries < 60; tries++) {
    const u = 0.15 + r() * 0.7, v = 0.15 + r() * 0.7;
    const pt = [b.minLng + u * (b.maxLng - b.minLng), b.minLat + v * (b.maxLat - b.minLat)];
    if (!booleanPointInPolygon(pt, poly)) continue;
    // Keep zones apart so each reads as its own problem on the map.
    if (out.some((o) => Math.hypot(o.u - u, o.v - v) < 0.28)) continue;
    out.push({
      id: `${field.id}-z${i}`,
      label: `Zone ${String.fromCharCode(65 + i)}`,
      layer: HOTSPOT_LAYERS[Math.floor(r() * HOTSPOT_LAYERS.length)],
      u, v,
      radius: 0.1 + r() * 0.12,
      onset: Math.floor(r() * 9),
      growth: 0.08 + r() * 0.1,
    });
    i++;
  }
  return out;
}

export const severity = (h: Hotspot, passIndex: number) => Math.min(0.75, Math.max(0, (passIndex - h.onset + 1) * h.growth));

// ---------- index values ----------
export function valueAt(field: Field, layer: Layer, u: number, v: number, pass: Pass, spots: Hotspot[]): number {
  if (layer === "soil") {
    // Soil carbon barely moves within a season: static texture plus a mild drag from nutrient hotspots.
    let value = 0.3 + 0.55 * fbm(hashString(field.id) + layerSeed("soil"), u * 0.7, v * 0.7);
    for (const h of spots) if (h.layer === "nutrients") value -= 0.25 * Math.exp(-((u - h.u) ** 2 + (v - h.v) ** 2) / (h.radius * 1.6) ** 2);
    return Math.min(1, Math.max(0, value));
  }
  if (layer === "yield") {
    // Yield potential integrates canopy health over the recent passes.
    let sum = 0, weight = 0;
    for (let k = 0; k < 5; k++) {
      const w = 1 / (k + 1);
      const p = { ...pass, index: pass.index - k, date: pass.date - k * REVISIT_DAYS * DAY };
      sum += w * valueAt(field, "health", u, v, p, spots);
      weight += w;
    }
    return Math.min(1, Math.max(0, (sum / weight) * 1.15));
  }
  const seed = hashString(field.id);
  const days = (pass.date - new Date(field.sowingDate).getTime()) / DAY;
  const vigour = growthCurve(field.crop, days);
  const texture = fbm(seed + layerSeed(layer), u, v);
  let value: number;
  if (layer === "pests") value = 0.08 + 0.18 * texture;
  else if (layer === "health") value = vigour * (0.78 + 0.3 * texture);
  else value = 0.55 + 0.25 * texture + 0.1 * vigour;

  for (const h of spots) {
    const s = severity(h, pass.index);
    if (!s) continue;
    const d2 = ((u - h.u) ** 2 + (v - h.v) ** 2) / h.radius ** 2;
    const k = s * Math.exp(-d2);
    if (layer === "pests" && h.layer === "pests") value += k * 1.1;
    else if (layer === h.layer) value -= k;
    else if (layer === "health") value -= k * 0.75; // every stress shows up in canopy health
  }
  return Math.min(1, Math.max(0, value));
}

const layerSeed = (layer: Layer) => ({ health: 11, water: 23, nutrients: 37, pests: 51, soil: 67, yield: 79 })[layer];

/** 0 = best class, 1 = middle, 2 = worst. */
export function classify(layer: Layer, value: number): 0 | 1 | 2 {
  if (layerMeta(layer).higherIsBetter) return value >= 0.55 ? 0 : value >= 0.38 ? 1 : 2;
  return value < 0.35 ? 0 : value < 0.55 ? 1 : 2;
}

/**
 * Canopy layers are judged against what the crop should look like at this stage,
 * so a freshly sown field is not "poor" just because it is still bare soil.
 * A field growing to plan scores about 0.67 on this relative scale.
 */
export function expectedFor(field: Field, layer: Layer, pass: Pass) {
  if (layer !== "health" && layer !== "yield") return null;
  const days = (pass.date - new Date(field.sowingDate).getTime()) / DAY;
  return Math.max(0.15, growthCurve(field.crop, days)) * (layer === "yield" ? 1.07 : 0.93);
}
export const relative = (value: number, expected: number | null) => (expected === null ? value : Math.min(1, (value / expected) * 0.67));

export function rampColor(layer: Layer, value: number) {
  const ramp = layerMeta(layer).ramp;
  return ramp[Math.min(ramp.length - 1, Math.floor(value * ramp.length))];
}

export interface IndexGrid {
  cells: FeatureCollection<Polygon, { value: number; cls: 0 | 1 | 2 }>;
  mean: number;
  /** Mean on the scale used for classes: stage-relative for health and yield, raw otherwise. */
  classMean: number;
  shares: [number, number, number];
}

const gridCache = new Map<string, IndexGrid>();

export function indexGrid(field: Field, layer: Layer, pass: Pass): IndexGrid {
  const key = `${field.id}|${field.boundary.length}|${layer}|${pass.date}`;
  const hit = gridCache.get(key);
  if (hit) return hit;

  const b = bbox(field.boundary);
  const poly = toPolygon(field.boundary);
  const spots = hotspots(field);
  const w = b.maxLng - b.minLng, h = b.maxLat - b.minLat;
  const metresW = w * 111320 * Math.cos((b.minLat * Math.PI) / 180), metresH = h * 111320;
  const n = 34;
  const cell = Math.max(metresW, metresH) / n;
  const nx = Math.max(4, Math.ceil(metresW / cell)), ny = Math.max(4, Math.ceil(metresH / cell));
  const features: IndexGrid["cells"]["features"] = [];
  const counts = [0, 0, 0];
  const expected = expectedFor(field, layer, pass);
  let sum = 0, classSum = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const u = (i + 0.5) / nx, v = (j + 0.5) / ny;
      const lng = b.minLng + u * w, lat = b.minLat + v * h;
      if (!booleanPointInPolygon([lng, lat], poly)) continue;
      const value = valueAt(field, layer, u, v, pass, spots);
      const rel = relative(value, expected);
      const cls = classify(layer, rel);
      counts[cls]++;
      sum += value;
      classSum += rel;
      const x0 = b.minLng + (i / nx) * w, x1 = b.minLng + ((i + 1) / nx) * w;
      const y0 = b.minLat + (j / ny) * h, y1 = b.minLat + ((j + 1) / ny) * h;
      features.push({
        type: "Feature",
        properties: { value, cls },
        geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
      });
    }
  }
  const total = Math.max(1, features.length);
  const grid: IndexGrid = {
    cells: { type: "FeatureCollection", features },
    mean: sum / total,
    classMean: classSum / total,
    shares: [counts[0] / total, counts[1] / total, counts[2] / total],
  };
  gridCache.set(key, grid);
  return grid;
}

export function seasonTrend(field: Field, layer: Layer, passes: Pass[]) {
  return passes.filter((p) => p.clear).map((p) => ({ date: p.date, value: indexGrid(field, layer, p).mean }));
}

// ---------- zones & alerts ----------
export interface Zone {
  id: string;
  label: string;
  layer: Hotspot["layer"];
  position: LatLng;
  severity: number;
}

export function zonesAt(field: Field, pass: Pass): Zone[] {
  const b = bbox(field.boundary);
  return hotspots(field)
    .map((h) => ({ h, s: severity(h, pass.index) }))
    .filter(({ s }) => s >= 0.15)
    .map(({ h, s }) => ({
      id: h.id,
      label: h.label,
      layer: h.layer,
      severity: s,
      position: { lat: b.minLat + h.v * (b.maxLat - b.minLat), lng: b.minLng + h.u * (b.maxLng - b.minLng) },
    }));
}

export interface Alert {
  /** Stable per field + zone, so one problem yields one suggestion until resolved. */
  id: string;
  fieldId: string;
  zone: Zone;
  level: "urgent" | "warn";
  title: string;
  detail: string;
  suggestion: { title: string; type: TaskType; instructions: string; resources: string[]; dueInHours: number };
}

const ALERT_COPY: Record<Zone["layer"], (z: Zone) => Omit<Alert, "id" | "fieldId" | "zone" | "level">> = {
  water: (z) => ({
    title: `Dry patch in ${z.label}`,
    detail: "Moisture index has dropped below the rest of the field since the last clear image.",
    suggestion: {
      title: `Check drip lines in ${z.label}`,
      type: "irrigation",
      instructions: "Walk the laterals through the flagged zone, look for blocked emitters or leaks, and log the pressure at the zone valve.",
      resources: ["Pressure gauge", "Spare emitters"],
      dueInHours: 24,
    },
  }),
  pests: (z) => ({
    title: `Pest pressure building in ${z.label}`,
    detail: "Canopy pattern and recent humidity point to pest or disease activity spreading from this zone.",
    suggestion: {
      title: `Scout ${z.label} for pests and disease`,
      type: "scouting",
      instructions: "Inspect 20 plants across the zone, photograph symptoms and note the pest count per plant. Flag if spraying is needed.",
      resources: ["Hand lens", "Sample bags"],
      dueInHours: 36,
    },
  }),
  nutrients: (z) => ({
    title: `Nutrient deficiency in ${z.label}`,
    detail: "Nitrogen index is lagging the field average and the canopy is paling.",
    suggestion: {
      title: `Top-dress fertilizer in ${z.label}`,
      type: "fertilizing",
      instructions: "Apply the recommended nitrogen top-dressing across the zone and record the quantity used.",
      resources: ["Urea, 2 bags", "Spreader"],
      dueInHours: 72,
    },
  }),
};

export function alertsFor(field: Field, now: number): Alert[] {
  const passes = passesFor(field, now).filter((p) => p.clear);
  const latest = passes[passes.length - 1];
  if (!latest) return [];
  return zonesAt(field, latest).map((zone) => ({
    id: `${zone.id}`,
    fieldId: field.id,
    zone,
    level: zone.severity >= 0.4 ? "urgent" : "warn",
    ...ALERT_COPY[zone.layer](zone),
  }));
}

// ---------- classified zone map ----------
// Five condition bands, worst -> best. Status hues (critical ... good) with a label for every
// band, so colour never carries the meaning alone; the worst band is also hatched.
export const BAND_COLORS = ["#d63a3a", "#ef7d32", "#f4c430", "#8fcf4a", "#2f9a3a"] as const;

const BAND_LABELS: Record<Layer, [string, string, string, string, string]> = {
  health: ["Very poor", "Poor", "Moderate", "Healthy", "Very healthy"],
  water: ["Very dry", "Dry", "Drying", "Adequate", "Well watered"],
  nutrients: ["Deficient", "Low", "Marginal", "Sufficient", "Optimal"],
  pests: ["High risk", "Elevated", "Watch", "Low", "Very low"],
  soil: ["Depleted", "Poor", "Average", "Good", "Rich"],
  yield: ["At risk", "Below target", "Near target", "On target", "Above target"],
};
export const bandLabels = (layer: Layer) => BAND_LABELS[layer];

/**
 * Band 0 (worst) .. 4 (best). The edges line up with the three-class statistics:
 * bands 0 / 1-2 / 3-4 are exactly the worst / middle / best classes.
 */
export function band(layer: Layer, v: number): 0 | 1 | 2 | 3 | 4 {
  if (layerMeta(layer).higherIsBetter) return v < 0.38 ? 0 : v < 0.465 ? 1 : v < 0.55 ? 2 : v < 0.68 ? 3 : 4;
  return v >= 0.55 ? 0 : v >= 0.45 ? 1 : v >= 0.35 ? 2 : v >= 0.2 ? 3 : 4;
}

export interface ZoneMap {
  url: string;
  /** Corner coordinates for a MapLibre image source: TL, TR, BR, BL as [lng, lat]. */
  corners: [[number, number], [number, number], [number, number], [number, number]];
  shares: [number, number, number, number, number];
}

const zoneCache = new Map<string, ZoneMap>();
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BAND_RGB = BAND_COLORS.map(hex);

/** Render the field as a smooth classified raster with zone outlines, clipped to the boundary. */
export function zoneMap(field: Field, layer: Layer, pass: Pass, size = 360): ZoneMap {
  const key = `${field.id}|${field.boundary.length}|${layer}|${pass.date}|${size}`;
  const hit = zoneCache.get(key);
  if (hit) return hit;

  const b = bbox(field.boundary);
  // Pad the box slightly so outlines at the edge aren't cut off.
  const padLng = (b.maxLng - b.minLng) * 0.02, padLat = (b.maxLat - b.minLat) * 0.02;
  const x0 = b.minLng - padLng, x1 = b.maxLng + padLng, y0 = b.minLat - padLat, y1 = b.maxLat + padLat;
  const metresW = (x1 - x0) * 111320 * Math.cos((y0 * Math.PI) / 180), metresH = (y1 - y0) * 111320;
  const W = metresW >= metresH ? size : Math.max(64, Math.round((size * metresW) / metresH));
  const H = metresH >= metresW ? size : Math.max(64, Math.round((size * metresH) / metresW));

  // Sample a coarse lattice, then interpolate per pixel: smooth zones without a per-pixel model run.
  const spots = hotspots(field);
  const expected = expectedFor(field, layer, pass);
  const G = 96;
  const lattice = new Float32Array((G + 1) * (G + 1));
  for (let j = 0; j <= G; j++) {
    for (let i = 0; i <= G; i++) {
      // Lattice coordinates in the unpadded unit box used by the model.
      const lng = x0 + (i / G) * (x1 - x0), lat = y0 + (j / G) * (y1 - y0);
      const u = (lng - b.minLng) / (b.maxLng - b.minLng), v = (lat - b.minLat) / (b.maxLat - b.minLat);
      lattice[j * (G + 1) + i] = relative(valueAt(field, layer, u, v, pass, spots), expected);
    }
  }
  const sample = (px: number, py: number) => {
    const gx = (px / (W - 1)) * G, gy = (1 - py / (H - 1)) * G; // canvas y grows downward
    const i = Math.min(G - 1, Math.floor(gx)), j = Math.min(G - 1, Math.floor(gy));
    const tx = gx - i, ty = gy - j;
    const a = lattice[j * (G + 1) + i], c = lattice[j * (G + 1) + i + 1];
    const d = lattice[(j + 1) * (G + 1) + i], e = lattice[(j + 1) * (G + 1) + i + 1];
    return (a * (1 - tx) + c * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
  };

  const bands = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) bands[y * W + x] = band(layer, sample(x, y));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x, bnd = bands[k];
      const edge = (x + 1 < W && bands[k + 1] !== bnd) || (y + 1 < H && bands[k + W] !== bnd);
      const [r, gg, bl] = BAND_RGB[bnd];
      const o = k * 4;
      if (edge) {
        img.data.set([255, 255, 255, 235], o);
      } else if (bnd === 0 && (x + y) % 9 < 2) {
        img.data.set([120, 18, 18, 230], o); // 45° hatch marks the worst band
      } else {
        img.data.set([r, gg, bl, 200], o);
      }
    }
  }
  g.putImageData(img, 0, 0);

  // Clip to the field boundary.
  const toPx = (p: LatLng) => [((p.lng - x0) / (x1 - x0)) * W, (1 - (p.lat - y0) / (y1 - y0)) * H];
  g.globalCompositeOperation = "destination-in";
  g.beginPath();
  field.boundary.forEach((p, i) => {
    const [px, py] = toPx(p);
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  });
  g.closePath();
  g.fill();

  // Shares, counted inside the boundary only.
  const counts = [0, 0, 0, 0, 0];
  const alpha = g.getImageData(0, 0, W, H).data;
  for (let k = 0; k < W * H; k++) if (alpha[k * 4 + 3] > 0) counts[bands[k]]++;
  const total = Math.max(1, counts.reduce((s, c) => s + c, 0));

  const map: ZoneMap = {
    url: canvas.toDataURL("image/png"),
    corners: [[x0, y1], [x1, y1], [x1, y0], [x0, y0]],
    shares: counts.map((c) => c / total) as ZoneMap["shares"],
  };
  zoneCache.set(key, map);
  return map;
}
