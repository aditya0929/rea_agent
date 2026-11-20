export interface Crop {
  id: string;
  name: string;
  /** Days from sowing to harvest. */
  season: number;
  /** Day of peak canopy. */
  peak: number;
  /** Typical good-season yield, tonnes per hectare. */
  yieldTHa: number;
  perennial?: boolean;
}

export const CROPS: Crop[] = [
  { id: "rice", name: "Rice", season: 120, peak: 75, yieldTHa: 6 },
  { id: "wheat", name: "Wheat", season: 130, peak: 80, yieldTHa: 5 },
  { id: "maize", name: "Maize", season: 110, peak: 65, yieldTHa: 9 },
  { id: "cotton", name: "Cotton", season: 160, peak: 100, yieldTHa: 2.5 },
  { id: "soybean", name: "Soybean", season: 100, peak: 60, yieldTHa: 3 },
  { id: "sugarcane", name: "Sugarcane", season: 330, peak: 200, yieldTHa: 80 },
  { id: "potato", name: "Potato", season: 100, peak: 55, yieldTHa: 30 },
  { id: "tomato", name: "Tomato", season: 120, peak: 70, yieldTHa: 60 },
  { id: "grapes", name: "Grapes", season: 365, peak: 150, yieldTHa: 20, perennial: true },
  { id: "tea", name: "Tea", season: 365, peak: 120, yieldTHa: 2.5, perennial: true },
  { id: "oil-palm", name: "Oil palm", season: 365, peak: 180, yieldTHa: 20, perennial: true },
  { id: "almonds", name: "Almonds", season: 365, peak: 160, yieldTHa: 2.5, perennial: true },
  { id: "apple", name: "Apple", season: 365, peak: 140, yieldTHa: 40, perennial: true },
];

export const cropById = (id: string) => CROPS.find((c) => c.id === id) ?? CROPS[0];

export function growthStage(cropId: string, days: number): string {
  const c = cropById(cropId);
  if (days < 0) return "Not sown yet";
  const d = c.perennial ? days % c.season : days;
  if (d > c.season) return "Past harvest";
  const f = d / c.season;
  if (f < 0.12) return "Establishment";
  if (f < 0.4) return "Vegetative";
  if (f < 0.65) return "Flowering";
  if (f < 0.9) return "Maturing";
  return "Harvest window";
}

/** Canopy vigour 0..1 for a crop `days` after sowing: rises to the peak, then senesces. */
export function growthCurve(cropId: string, days: number): number {
  const c = cropById(cropId);
  if (days < 0) return 0.18;
  const d = c.perennial ? days % c.season : Math.min(days, c.season + 20);
  if (d <= c.peak) return 0.22 + 0.68 / (1 + Math.exp(-10 * (d / c.peak - 0.5)));
  const after = (d - c.peak) / Math.max(1, c.season - c.peak);
  return Math.max(0.25, 0.9 - 0.5 * after * after);
}
