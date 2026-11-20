import type { Field } from "../types";
import { cropById } from "./crops";
import { DAY, indexGrid, LAYERS, layerMeta, type Layer, type Pass } from "./sat";

export type Priority = "high" | "medium" | "low";

export interface LayerFinding {
  layer: Layer;
  /** Share of the field in the worst class. */
  worst: number;
  mean: number;
  priority: Priority;
  headline: string;
  advice: string;
}

const ADVICE: Record<Layer, [string, string, string]> = {
  health: [
    "Canopy is even and vigorous. Keep to the current programme and check again on the next image.",
    "Some patches are lagging. Scout the lighter zones to find out whether water, nutrients or pests are behind it.",
    "Large areas are stressed. Send someone to the flagged zones today and compare with the water and pest layers.",
  ],
  water: [
    "Moisture is even across the field. No change to irrigation needed.",
    "Parts of the field are drying. Check emitters and run times in those blocks.",
    "Several blocks are dry. Irrigate the flagged zones first and inspect the lines for blockages.",
  ],
  nutrients: [
    "Nitrogen looks sufficient for this growth stage.",
    "Nitrogen is low in places. Plan a top-dressing for the paler zones.",
    "Clear deficiency. Apply nitrogen to the flagged zones within the week and recheck on the next image.",
  ],
  pests: [
    "Low pest and disease pressure. Keep the routine scouting schedule.",
    "Pressure is building. Scout the hotspots and set traps before it spreads.",
    "High risk. Scout today and prepare to spray in the next calm, dry window.",
  ],
  soil: [
    "Soil organic carbon is healthy across the field.",
    "Carbon is average. Residue retention and cover crops will help build it.",
    "Soil is depleted in places. Add organic matter and consider a soil test for those zones.",
  ],
  yield: [
    "On course for a typical yield.",
    "Some blocks are running below target. Fixing the stressed zones now protects yield.",
    "Yield is at risk in the flagged blocks. Prioritise them for water and crop protection.",
  ],
};

export function findings(field: Field, pass: Pass): LayerFinding[] {
  return LAYERS.map((l) => {
    const g = indexGrid(field, l.id, pass);
    const worst = g.shares[2];
    const middle = g.shares[1];
    const priority: Priority = worst >= 0.15 ? "high" : worst >= 0.05 || middle >= 0.3 ? "medium" : "low";
    const cls = priority === "high" ? 2 : priority === "medium" ? 1 : 0;
    const meta = layerMeta(l.id);
    const headline =
      priority === "low"
        ? `${Math.round(g.shares[0] * 100)}% of the field is ${meta.classes[0].toLowerCase()}`
        : priority === "high"
          ? `${Math.round(worst * 100)}% of the field is ${meta.classes[2].toLowerCase()}`
          : `${Math.round((worst + middle) * 100)}% of the field is ${meta.classes[1].toLowerCase()} or worse`;
    if (l.id === "yield" && yieldEstimate(field, pass).early) {
      return { layer: l.id, worst: 0, mean: g.mean, priority: "low" as Priority, headline: "Too early to forecast yield", advice: "A forecast needs about a quarter of the season of canopy history. Focus on establishment for now." };
    }
    return { layer: l.id, worst, mean: g.mean, priority, headline, advice: ADVICE[l.id][cls] };
  });
}

const RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
export const byPriority = (a: LayerFinding, b: LayerFinding) => RANK[a.priority] - RANK[b.priority] || b.worst - a.worst;

/** 0–100 field score from canopy health, water and nutrients. */
export function healthScore(field: Field, pass: Pass) {
  const m = (l: Layer) => indexGrid(field, l, pass).classMean;
  const risk = indexGrid(field, "pests", pass).mean;
  const raw = 0.45 * m("health") + 0.2 * m("water") + 0.2 * m("nutrients") + 0.15 * (1 - risk);
  return Math.round(Math.min(1, raw / 0.8) * 100);
}

export function yieldEstimate(field: Field, pass: Pass) {
  const crop = cropById(field.crop);
  const days = (pass.date - new Date(field.sowingDate).getTime()) / DAY;
  // Before a quarter of the season has passed there is too little canopy history to forecast from.
  const early = !crop.perennial && days < crop.season * 0.25;
  const potential = indexGrid(field, "yield", pass).classMean;
  const perHa = crop.yieldTHa * Math.min(1.1, potential / 0.67);
  return { early, perHa, total: perHa * field.areaHa, target: crop.yieldTHa, vsTarget: perHa / crop.yieldTHa - 1 };
}
