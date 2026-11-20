import type { Field } from "../types";
import { centroid } from "./geo";
import { DAY, hashString, rng } from "./sat";

export interface DayForecast {
  date: number;
  tMin: number;
  tMax: number;
  rainMm: number;
  windKmh: number;
  et0: number;
  /** Morning spray window: calm and dry. */
  sprayOk: boolean;
}

/**
 * Hargreaves reference evapotranspiration (mm/day), with extraterrestrial
 * radiation from latitude and day of year.
 */
export function hargreavesEt0(tMin: number, tMax: number, latDeg: number, date: Date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = Math.floor((date.getTime() - start) / DAY);
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl))));
  const ra = ((24 * 60) / Math.PI) * 0.082 * dr * (ws * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(ws));
  // 0.408 converts MJ m-2 day-1 to mm day-1.
  return Math.max(0, 0.0023 * ((tMin + tMax) / 2 + 17.8) * Math.sqrt(Math.max(0, tMax - tMin)) * ra * 0.408);
}

export function forecast(field: Field, now: number, days = 5): DayForecast[] {
  const c = centroid(field.boundary);
  const base = 31 - Math.abs(c.lat) * 0.35;
  const today = Math.floor(now / DAY);
  return Array.from({ length: days }, (_, i) => {
    const r = rng(hashString(field.id) ^ (today + i) * 7919);
    const tMax = Math.round(base + r() * 6 - 2);
    const tMin = Math.round(tMax - 8 - r() * 5);
    const rainMm = r() < 0.65 ? 0 : Math.round(r() * 25);
    const windKmh = Math.round(4 + r() * 22);
    const date = (today + i) * DAY;
    return {
      date,
      tMin,
      tMax,
      rainMm,
      windKmh,
      et0: hargreavesEt0(tMin, tMax, c.lat, new Date(date)),
      sprayOk: rainMm === 0 && windKmh < 15,
    };
  });
}
