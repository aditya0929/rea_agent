import { useState } from "react";
import type { PlanId } from "../../types";
import { formatArea } from "../../lib/geo";
import { Icon } from "../../components/Icon";

const PLANS: { id: PlanId; name: string; perHa: number; min: number; blurb: string; features: string[] }[] = [
  { id: "basic", name: "Monitor", perHa: 0.6, min: 4, blurb: "See problems early",
    features: ["Crop health map every 5 days", "Cloud-free image picker", "Email alerts"] },
  { id: "pro", name: "Advise", perHa: 1.2, min: 8, blurb: "Know what to do next",
    features: ["Everything in Monitor", "Water, nutrient and pest-risk layers", "Weather and spray windows", "Zone-level advisories"] },
  { id: "enterprise", name: "Operate", perHa: 2, min: 20, blurb: "Run the field team",
    features: ["Everything in Advise", "Tasks for people and crews", "Field staff mobile view", "Team performance dashboard"] },
];

export function PlanStep({ areaHa, fieldName, onBack, onCreate }: {
  areaHa: number;
  fieldName: string;
  onBack: () => void;
  onCreate: (plan: PlanId) => void;
}) {
  const [plan, setPlan] = useState<PlanId>("enterprise");
  const price = (p: (typeof PLANS)[number]) => Math.max(p.min, p.perHa * areaHa);
  return (
    <aside className="float-panel right wide">
      <div className="eyebrow">Step 3 · Plan</div>
      <h2>Choose how you'll use {fieldName || "this field"}</h2>
      <p className="muted small">Prices for {formatArea(areaHa)} ha, billed monthly. This demo doesn't charge anything.</p>
      <div className="plans">
        {PLANS.map((p) => (
          <button key={p.id} className={`plan ${plan === p.id ? "active" : ""}`} onClick={() => setPlan(p.id)} aria-pressed={plan === p.id}>
            <div className="row between"><b>{p.name}</b>{p.id === "enterprise" && <span className="pill pill-info pill-xs">Includes tasks</span>}</div>
            <small className="muted">{p.blurb}</small>
            <div className="price">${price(p).toFixed(0)}<small>/month</small></div>
            <ul>{p.features.map((f) => <li key={f}><Icon name="check" size={13} />{f}</li>)}</ul>
          </button>
        ))}
      </div>
      <div className="panel-foot">
        <button className="btn" onClick={onBack}><Icon name="back" size={15} /> Back</button>
        <button className="btn btn-primary btn-lg" onClick={() => onCreate(plan)}>
          <Icon name="satellite" size={16} /> Start satellite monitoring
        </button>
      </div>
    </aside>
  );
}
