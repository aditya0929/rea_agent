import { useState } from "react";
import { CROPS } from "../../lib/crops";
import { formatArea, formatDistance, haToAcres } from "../../lib/geo";
import { Icon } from "../../components/Icon";

export interface Details {
  fieldName: string;
  crop: string;
  sowingDate: string;
  contactName: string;
  phone: string;
  email: string;
  company: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s()-]{7,}$/;

export function DetailsStep({ details, onChange, areaHa, perimeter, points, onBack, onNext }: {
  details: Details;
  onChange: (d: Details) => void;
  areaHa: number;
  perimeter: number;
  points: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const [touched, setTouched] = useState<Partial<Record<keyof Details, boolean>>>({});
  const set = (k: keyof Details) => (e: { target: { value: string } }) => onChange({ ...details, [k]: e.target.value });
  const blur = (k: keyof Details) => () => setTouched((t) => ({ ...t, [k]: true }));

  const checks: [keyof Details, boolean, string][] = [
    ["fieldName", details.fieldName.trim().length > 0, "Name the field"],
    ["crop", !!details.crop, "Choose a crop"],
    ["sowingDate", !!details.sowingDate, "Pick a date"],
    ["contactName", details.contactName.trim().length > 0, "Who should get alerts?"],
    ["phone", PHONE.test(details.phone), "Enter a phone number"],
    ["email", EMAIL.test(details.email), "Enter a valid email"],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const error = (k: keyof Details) => {
    const c = checks.find(([key]) => key === k);
    return c && touched[k] && !c[1] ? <small className="text-critical">{c[2]}</small> : null;
  };

  return (
    <aside className="float-panel right">
      <div className="eyebrow">Step 2 · Field details</div>
      <h2>Tell us about this field</h2>
      <div className="boundary-summary">
        <div>
          <b>{formatArea(areaHa)} ha</b>
          <small>{formatArea(haToAcres(areaHa))} ac · {formatDistance(perimeter)} perimeter · {points} points</small>
        </div>
        <button className="btn btn-sm" onClick={onBack}><Icon name="edit" size={14} /> Edit boundary</button>
      </div>

      <h3 className="section-num"><span>1</span>About the field</h3>
      <div className="form-grid">
        <label className="span-2"><span>Field name *</span>
          <input value={details.fieldName} onChange={set("fieldName")} onBlur={blur("fieldName")} placeholder="e.g. Block 7, east vineyard" />{error("fieldName")}
        </label>
        <label><span>Crop *</span>
          <select value={details.crop} onChange={set("crop")} onBlur={blur("crop")}>
            <option value="">Choose…</option>
            {CROPS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>{error("crop")}
        </label>
        <label><span>Sowing / season start *</span>
          <input type="date" value={details.sowingDate} onChange={set("sowingDate")} onBlur={blur("sowingDate")} />{error("sowingDate")}
        </label>
      </div>

      <h3 className="section-num"><span>2</span>Contact <small className="muted">· reports and alerts go here</small></h3>
      <div className="form-grid">
        <label><span>Full name *</span><input value={details.contactName} onChange={set("contactName")} onBlur={blur("contactName")} />{error("contactName")}</label>
        <label><span>Phone *</span><input value={details.phone} onChange={set("phone")} onBlur={blur("phone")} placeholder="+91 98765 43210" inputMode="tel" />{error("phone")}</label>
        <label><span>Email *</span><input value={details.email} onChange={set("email")} onBlur={blur("email")} type="email" />{error("email")}</label>
        <label><span>Company <small className="muted">optional</small></span><input value={details.company} onChange={set("company")} /></label>
      </div>

      <p className="note"><Icon name="clock" size={14} /> Next, we fetch the satellite history for this boundary. The first crop health, water and nutrient maps arrive in under a minute in this demo.</p>

      <div className="panel-foot">
        <div className="progress-text">
          <small>{done} of {checks.length} required</small>
          <div className="meter"><i style={{ width: `${(done / checks.length) * 100}%` }} /></div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => (done === checks.length ? onNext() : setTouched(Object.fromEntries(checks.map(([k]) => [k, true]))))}
        >
          Continue to plans <Icon name="chevron" size={16} />
        </button>
      </div>
    </aside>
  );
}
