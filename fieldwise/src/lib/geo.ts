import area from "@turf/area";
import length from "@turf/length";
import { lineString, polygon } from "@turf/helpers";
import { kml } from "@tmcw/togeojson";
import JSZip from "jszip";
import type { Feature, Geometry, Position } from "geojson";
import type { LatLng } from "../types";

export const MIN_POINTS = 3;

const ring = (pts: LatLng[]): Position[] => {
  const r = pts.map((p) => [p.lng, p.lat]);
  return [...r, r[0]];
};

export const toPolygon = (pts: LatLng[]) => polygon([ring(pts)]);

export function areaM2(pts: LatLng[]): number {
  return pts.length < MIN_POINTS ? 0 : area(toPolygon(pts));
}

export function perimeterM(pts: LatLng[]): number {
  if (pts.length < 2) return 0;
  const line = pts.length >= MIN_POINTS ? ring(pts) : pts.map((p) => [p.lng, p.lat]);
  return length(lineString(line), { units: "meters" });
}

/** Polygon approximating a circle; metres-per-degree projection, good for field-sized radii. */
export function circlePoints(center: LatLng, radiusM: number, n = 64): LatLng[] {
  const pts: LatLng[] = [];
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push({
      lat: center.lat + (radiusM / 111320) * Math.cos(a),
      lng: center.lng + (radiusM / (111320 * cosLat)) * Math.sin(a),
    });
  }
  return pts;
}

export function bbox(pts: LatLng[]) {
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) };
}

export function centroid(pts: LatLng[]): LatLng {
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}

export const haToAcres = (ha: number) => ha * 2.47105;

export function formatArea(ha: number) {
  return ha >= 100 ? ha.toFixed(0) : ha >= 10 ? ha.toFixed(1) : ha.toFixed(2);
}

export function formatDistance(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/** Parse "lat, lng" typed into the search box. */
export function parseCoordinates(text: string): LatLng | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function outerRing(geometry: Geometry | null): Position[] | null {
  if (!geometry) return null;
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates[0] ?? null;
    case "MultiPolygon": {
      // Take the largest part.
      const parts = geometry.coordinates.map((p) => p[0]).filter(Boolean);
      return parts.sort((a, b) => b.length - a.length)[0] ?? null;
    }
    case "GeometryCollection":
      for (const g of geometry.geometries) {
        const r = outerRing(g);
        if (r) return r;
      }
      return null;
    default:
      return null;
  }
}

function firstRing(geojson: unknown): Position[] | null {
  const g = geojson as { type?: string; features?: Feature[]; geometry?: Geometry };
  if (g.type === "FeatureCollection") {
    for (const f of g.features ?? []) {
      const r = outerRing(f.geometry);
      if (r) return r;
    }
    return null;
  }
  if (g.type === "Feature") return outerRing(g.geometry ?? null);
  return outerRing(geojson as Geometry);
}

/** Read a KML, KMZ or GeoJSON file and return the first polygon's outer ring. */
export async function parseBoundaryFile(file: File): Promise<LatLng[]> {
  const name = file.name.toLowerCase();
  let geojson: unknown;
  if (name.endsWith(".geojson") || name.endsWith(".json")) {
    geojson = JSON.parse(await file.text());
  } else if (name.endsWith(".kml")) {
    geojson = kml(new DOMParser().parseFromString(await file.text(), "text/xml"));
  } else if (name.endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const entry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml"));
    if (!entry) throw new Error("This KMZ has no KML document inside.");
    geojson = kml(new DOMParser().parseFromString(await entry.async("text"), "text/xml"));
  } else {
    throw new Error("Use a KML, KMZ or GeoJSON file.");
  }
  const r = firstRing(geojson);
  if (!r || r.length < MIN_POINTS) throw new Error("No polygon found in this file.");
  const pts = r.map(([lng, lat]) => ({ lat, lng }));
  const [first, last] = [pts[0], pts[pts.length - 1]];
  if (first.lat === last.lat && first.lng === last.lng) pts.pop();
  if (pts.length < MIN_POINTS) throw new Error("The polygon needs at least 3 corners.");
  return pts;
}
