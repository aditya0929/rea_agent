// Data for the 3D field diorama: satellite-pixel concern cells, the hotspot to scout first,
// probe readings and crop threats. Everything is in local metres around the field centroid.
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Field, LatLng } from "../types";
import { bbox, centroid, toPolygon } from "./geo";
import { band, expectedFor, hashString, hotspots, layerMeta, relative, rng, valueAt, type Layer, type Pass } from "./sat";

/** Sentinel-2's visible bands are 10 m pixels; we draw the field at that resolution. */
export const PIXEL_M = 10;

// Concern ramp, one hue (magenta), light -> dark = more concern. Level 0 is "no concern" and is left unfilled.
export const CONCERN_COLORS = ["#f2b8e4", "#e57ccc", "#cc45b0", "#9d1f8a"] as const;

export interface Local {
  x: number; // metres east of the centroid
  y: number; // metres north of the centroid
}

export function localFrame(field: Field) {
  const c = centroid(field.boundary);
  const k = 111320 * Math.cos((c.lat * Math.PI) / 180);
  return {
    origin: c,
    toLocal: (p: LatLng): Local => ({ x: (p.lng - c.lng) * k, y: (p.lat - c.lat) * 111320 }),
    toLatLng: (l: Local): LatLng => ({ lat: c.lat + l.y / 111320, lng: c.lng + l.x / k }),
  };
}

export interface ConcernGrid {
  cols: number;
  rows: number;
  cell: number;
  /** Local metres of the grid's south-west corner. */
  x0: number;
  y0: number;
  /** -1 outside the field, otherwise 0 (fine) .. 3 (most concern). Row 0 is the southern row. */
  levels: Int8Array;
  /** Condition per cell, higher is better (NaN outside the field). */
  condition: Float32Array;
  /** Share of the field at each concern level. */
  shares: [number, number, number, number];
}

const BAND_TO_CONCERN = [3, 2, 1, 0, 0] as const;
const gridCache = new Map<string, ConcernGrid>();

export function concernGrid(field: Field, layer: Layer, pass: Pass): ConcernGrid {
  const key = `${field.id}|${field.boundary.length}|${layer}|${pass.date}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const { toLocal } = localFrame(field);
  const b = bbox(field.boundary);
  const sw = toLocal({ lat: b.minLat, lng: b.minLng }), ne = toLocal({ lat: b.maxLat, lng: b.maxLng });
  const span = Math.max(ne.x - sw.x, ne.y - sw.y);
  const cell = Math.max(PIXEL_M, span / 80); // cap very large fields at 80 pixels across
  const cols = Math.ceil((ne.x - sw.x) / cell), rows = Math.ceil((ne.y - sw.y) / cell);
  const poly = toPolygon(field.boundary);
  const spots = hotspots(field);
  const expected = expectedFor(field, layer, pass);
  const levels = new Int8Array(cols * rows).fill(-1);
  const condition = new Float32Array(cols * rows).fill(NaN);
  const better = layerMeta(layer).higherIsBetter;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5) / cols, v = (r + 0.5) / rows;
      const lng = b.minLng + u * (b.maxLng - b.minLng), lat = b.minLat + v * (b.maxLat - b.minLat);
      if (!booleanPointInPolygon([lng, lat], poly)) continue;
      const rel = relative(valueAt(field, layer, u, v, pass, spots), expected);
      levels[r * cols + c] = BAND_TO_CONCERN[band(layer, rel)];
      condition[r * cols + c] = better ? rel : 1 - rel;
    }
  }
  // Absolute thresholds decide "Act soon" / "Act now". On top of that, the weakest 30% of
  // the field is marked "Watch", so within-field variation is always visible.
  const inField = [...condition].filter((x) => !Number.isNaN(x)).sort((a, z) => a - z);
  const p30 = inField[Math.floor(inField.length * 0.3)] ?? -Infinity;
  for (let i = 0; i < levels.length; i++) if (levels[i] === 0 && condition[i] < p30) levels[i] = 1;
  const counts = [0, 0, 0, 0];
  for (const l of levels) if (l >= 0) counts[l]++;
  const total = Math.max(1, counts.reduce((s, x) => s + x, 0));
  const grid: ConcernGrid = { cols, rows, cell, x0: sw.x, y0: sw.y, levels, condition, shares: counts.map((x) => x / total) as ConcernGrid["shares"] };
  gridCache.set(key, grid);
  return grid;
}

export interface HotspotView {
  center: Local;
  /** Organic closed outline in local metres. */
  loop: Local[];
  areaHa: number;
  share: number;
  confidence: "Low" | "Medium" | "High";
  eyebrow: string;
  title: string;
  subtitle: string;
  label: [string, string];
}

const shoelace = (pts: Local[]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

/** The one place to send someone first for this layer. */
export function hotspotFor(field: Field, layer: Layer, pass: Pass): HotspotView | null {
  const { toLocal, toLatLng } = localFrame(field);
  const b = bbox(field.boundary);
  const sw = toLocal({ lat: b.minLat, lng: b.minLng }), ne = toLocal({ lat: b.maxLat, lng: b.maxLng });
  const span = ((ne.x - sw.x) + (ne.y - sw.y)) / 2;
  const poly = toPolygon(field.boundary);
  const inside = (l: Local) => { const p = toLatLng(l); return booleanPointInPolygon([p.lng, p.lat], poly); };

  // Grow the hotspot from the weakest patch across connected pixels of similar concern,
  // so the outline always wraps what the pixels on the map show.
  const g = concernGrid(field, layer, pass);
  let worst = Infinity, seed = -1;
  for (let r = 1; r < g.rows - 1; r++) for (let c = 1; c < g.cols - 1; c++) {
    let sum = 0, n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const v = g.condition[(r + dr) * g.cols + c + dc];
      if (!Number.isNaN(v)) (sum += v), n++;
    }
    if (n === 9 && sum / n < worst) (worst = sum / n), (seed = r * g.cols + c);
  }
  if (seed < 0) return null;
  const floor = Math.max(1, g.levels[seed] - 1);
  const seen = new Set([seed]);
  const queue = [seed];
  while (queue.length && seen.size < g.levels.length * 0.25) {
    const i = queue.shift()!;
    const r = Math.floor(i / g.cols), c = i % g.cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc, j = rr * g.cols + cc;
      if (rr < 0 || cc < 0 || rr >= g.rows || cc >= g.cols || seen.has(j) || g.levels[j] < floor) continue;
      seen.add(j);
      queue.push(j);
    }
  }
  // The cluster can be long and thin; centre on its densest part and cap the radius.
  const cellsIn = [...seen].map((i) => ({ x: g.x0 + ((i % g.cols) + 0.5) * g.cell, y: g.y0 + (Math.floor(i / g.cols) + 0.5) * g.cell }));
  const center: Local = { x: cellsIn.reduce((t, q) => t + q.x, 0) / cellsIn.length, y: cellsIn.reduce((t, q) => t + q.y, 0) / cellsIn.length };
  const radius = Math.min(span * 0.22, Math.max(g.cell * 2.5, Math.sqrt((cellsIn.length * g.cell * g.cell) / Math.PI) * 1.05));
  const sev = Math.max(0.15, 0.7 - worst);

  const r = rng(hashString(`${field.id}:${layer}:loop`));
  const p1 = r() * 6.28, p2 = r() * 6.28;
  const loop: Local[] = [];
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    let rad = radius * (1 + 0.2 * Math.sin(3 * t + p1) + 0.1 * Math.sin(5 * t + p2));
    let pt = { x: center.x + Math.cos(t) * rad, y: center.y + Math.sin(t) * rad };
    // Pull points that fall outside the field back towards the centre.
    for (let k = 0; k < 12 && !inside(pt); k++) {
      rad *= 0.85;
      pt = { x: center.x + Math.cos(t) * rad, y: center.y + Math.sin(t) * rad };
    }
    loop.push(pt);
  }
  const areaHa = shoelace(loop) / 10_000;
  const forecast = layer === "pests" || layer === "yield";
  const meta = layerMeta(layer);
  const copy: Record<Layer, Omit<HotspotView, "center" | "loop" | "areaHa" | "share" | "confidence">> = {
    pests: { eyebrow: "Forecast · no damage seen yet", title: "Scout here first", subtitle: "where these threats usually start", label: ["Likely to start here", "Forecast · not a sighting"] },
    health: { eyebrow: "Measured · latest image", title: "Weakest canopy", subtitle: "where the crop is falling behind", label: ["Weakest canopy here", `${meta.index} below field average`] },
    water: { eyebrow: "Measured · latest image", title: "Driest patch", subtitle: "where the crop is drying first", label: ["Driest here", "Check the drip lines"] },
    nutrients: { eyebrow: "Measured · latest image", title: "Lowest nitrogen", subtitle: "where the canopy is paling", label: ["Lowest nitrogen here", "Top-dress this patch"] },
    soil: { eyebrow: "Estimate · bare-soil reflectance", title: "Lowest carbon", subtitle: "where the soil needs organic matter", label: ["Lowest carbon here", "Estimate"] },
    yield: { eyebrow: "Forecast · canopy history", title: "Yield at risk", subtitle: "where the harvest will fall short first", label: ["Lowest yield potential", "Forecast"] },
  };
  return {
    center, loop, areaHa,
    share: Math.min(1, areaHa / Math.max(0.01, field.areaHa)),
    confidence: forecast ? (sev > 0.5 ? "Medium" : "Low") : sev > 0.45 ? "High" : "Medium",
    ...copy[layer],
  };
}

/** Evenly spread probe positions inside the field. */
export function probeSites(field: Field, count = 9): Local[] {
  const { toLocal, toLatLng } = localFrame(field);
  const poly = toPolygon(field.boundary);
  const b = bbox(field.boundary);
  const sw = toLocal({ lat: b.minLat, lng: b.minLng }), ne = toLocal({ lat: b.maxLat, lng: b.maxLng });
  const n = Math.ceil(Math.sqrt(count * 1.6));
  const r = rng(hashString(`${field.id}:probes`));
  const out: Local[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = { x: sw.x + ((i + 0.5 + (r() - 0.5) * 0.5) / n) * (ne.x - sw.x), y: sw.y + ((j + 0.5 + (r() - 0.5) * 0.5) / n) * (ne.y - sw.y) };
    const p = toLatLng(l);
    if (booleanPointInPolygon([p.lng, p.lat], poly)) out.push(l);
  }
  return out.slice(0, count);
}

export interface ProbeReading {
  at: Local;
  value: string;
  status: "LOW" | "OK" | "HIGH" | "DRY" | "WET";
  bad: boolean;
}

/** Simulated in-field sensor readings for layers that have probes. */
export function probeReadings(field: Field, layer: Layer, pass: Pass): ProbeReading[] {
  if (layer !== "soil" && layer !== "water" && layer !== "nutrients") return [];
  const { toLatLng } = localFrame(field);
  const b = bbox(field.boundary);
  const spots = hotspots(field);
  const expected = expectedFor(field, layer, pass);
  // Half the probes are spread out; the rest sit on the worst pixels, where a reading matters most.
  const g = concernGrid(field, layer, pass);
  const worst = [...g.condition.keys()].filter((i) => !Number.isNaN(g.condition[i])).sort((a, z) => g.condition[a] - g.condition[z]);
  const picks: Local[] = [];
  for (const i of worst) {
    const at = { x: g.x0 + ((i % g.cols) + 0.5) * g.cell, y: g.y0 + (Math.floor(i / g.cols) + 0.5) * g.cell };
    if (picks.every((q) => Math.hypot(q.x - at.x, q.y - at.y) > g.cell * 4)) picks.push(at);
    if (picks.length === 4) break;
  }
  const spread = probeSites(field, 9).filter((at) => picks.every((q) => Math.hypot(q.x - at.x, q.y - at.y) > g.cell * 4)).slice(0, 5);
  return [...spread, ...picks].map((at) => {
    const p = toLatLng(at);
    const u = (p.lng - b.minLng) / (b.maxLng - b.minLng), v = (p.lat - b.minLat) / (b.maxLat - b.minLat);
    const val = valueAt(field, layer, u, v, pass, spots);
    // Same classification as the pixels, so a probe never contradicts the map around it.
    const bnd = band(layer, relative(val, expected));
    const bad = bnd <= 1, high = bnd === 4;
    if (layer === "soil") return { at, value: `SOC ${(0.1 + val * 1.5).toFixed(2)}%`, status: bad ? "LOW" : high ? "HIGH" : "OK", bad };
    if (layer === "water") return { at, value: `${Math.round(8 + val * 34)}% moisture`, status: bad ? "DRY" : high ? "WET" : "OK", bad };
    return { at, value: `N ${Math.round(12 + val * 50)} ppm`, status: bad ? "LOW" : high ? "HIGH" : "OK", bad };
  });
}

const THREATS: Record<string, [string, string, "pest" | "disease"][]> = {
  apple: [["Codling moth", "vigorous canopy and field edges", "pest"], ["Apple scab", "dense, humid canopy and wetter spots", "disease"], ["San Jose scale", "older wood near the edges", "pest"], ["Powdery mildew", "shaded, sheltered rows", "disease"]],
  grapes: [["Downy mildew", "low, humid corners after rain", "disease"], ["Powdery mildew", "dense canopy with poor airflow", "disease"], ["Mealybug", "older vines along the edges", "pest"], ["Thrips", "young shoots in warm spells", "pest"]],
  tomato: [["Fruit borer", "flowering rows near the edges", "pest"], ["Early blight", "lower leaves in wetter patches", "disease"], ["Whitefly", "sheltered, warm rows", "pest"], ["Late blight", "cool, humid low spots", "disease"]],
  maize: [["Fall armyworm", "whorls of young plants at field edges", "pest"], ["Stem borer", "stressed, thinner patches", "pest"], ["Leaf blight", "humid, dense stands", "disease"], ["Rust", "warm, humid spells", "disease"]],
  default: [["Aphids", "tender new growth at the edges", "pest"], ["Leaf spot", "dense, humid canopy", "disease"], ["Caterpillars", "lush patches near the boundary", "pest"], ["Mildew", "sheltered, shaded rows", "disease"]],
};

export interface Threat {
  name: string;
  where: string;
  kind: "pest" | "disease";
  chance: number;
  color: string;
}

const THREAT_DOTS = ["#7cc8ff", "#ff8fc7", "#b9a8ff", "#ffd36b"];

export function threatsFor(field: Field, pass: Pass, pestRisk: number): Threat[] {
  const r = rng(hashString(`${field.id}:threats:${pass.date}`));
  return (THREATS[field.crop] ?? THREATS.default)
    .map(([name, where, kind], i) => ({ name, where, kind, color: THREAT_DOTS[i], chance: Math.min(0.95, Math.max(0.08, 0.15 + pestRisk * 1.3 + r() * 0.35 - i * 0.08)) }))
    .sort((a, b) => b.chance - a.chance);
}
