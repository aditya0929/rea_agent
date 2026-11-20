import { useStore } from "../store/store";
import { forecast } from "../lib/weather";
import { Columns } from "../components/charts";
import { Icon } from "../components/Icon";
import { Empty, useNow } from "../components/ui";

export default function Weather() {
  const now = useNow(60_000);
  const { fields, selectedFieldId, selectField } = useStore();
  const field = fields.find((f) => f.id === selectedFieldId) ?? fields[0];
  if (!field) return <div className="page"><Empty icon="sun" title="Add a field to see its weather" /></div>;
  const days = forecast(field, now, 7);
  const day = (t: number) => new Date(t).toLocaleDateString([], { weekday: "short" });
  const rain = days.reduce((s, d) => s + d.rainMm, 0);
  const et = days.reduce((s, d) => s + d.et0, 0);
  const deficit = et - rain;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Weather</div>
          <h1>7-day outlook for {field.name}</h1>
          <p className="muted">Forecast at the field centre, with spray windows and crop water use (Hargreaves ET₀).</p>
        </div>
        <select value={field.id} onChange={(e) => selectField(e.target.value)} aria-label="Field" className="w-auto">
          {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </header>

      <div className="wx-week">
        {days.map((d) => (
          <div key={d.date} className="wx-day card">
            <small className="muted">{new Date(d.date).toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</small>
            <Icon name={d.rainMm ? "rain" : "sun"} size={30} />
            <b className="wx-temp">{d.tMax}°<span className="muted">/{d.tMin}°</span></b>
            <span className="small"><Icon name="rain" size={13} /> {d.rainMm ? `${d.rainMm} mm` : "Dry"}</span>
            <span className="small"><Icon name="wind" size={13} /> {d.windKmh} km/h</span>
            <span className="small"><Icon name="drop" size={13} /> ET₀ {d.et0.toFixed(1)} mm</span>
            <span className={`pill ${d.sprayOk ? "pill-good" : "pill-neutral"} pill-xs`}>
              <Icon name={d.sprayOk ? "check" : "x"} size={11} />{d.sprayOk ? "Spray window 6–10 AM" : d.rainMm ? "Rain: no spraying" : "Too windy to spray"}
            </span>
          </div>
        ))}
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-label">Rain this week</div><div className="stat-value">{rain} mm</div></div>
        <div className="stat"><div className="stat-label">Crop water use (ET₀)</div><div className="stat-value">{et.toFixed(0)} mm</div></div>
        <div className="stat">
          <div className="stat-label">Water balance</div>
          <div className="stat-value">{deficit > 0 ? "−" : "+"}{Math.abs(deficit).toFixed(0)} mm</div>
          <div className={`stat-sub ${deficit > 0 ? "text-critical" : "text-good"}`}>{deficit > 0 ? "Irrigation needed to cover the gap" : "Rain covers crop demand"}</div>
        </div>
        <div className="stat"><div className="stat-label">Spray-friendly days</div><div className="stat-value">{days.filter((d) => d.sprayOk).length} of 7</div></div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Daily rain</h3><span className="muted small">mm</span></div>
          <Columns data={days.map((d) => ({ id: String(d.date), label: day(d.date), value: d.rainMm }))} color="var(--series-1)" unit="mm rain" />
        </section>
        <section className="card">
          <div className="card-head"><h3>Daily crop water use</h3><span className="muted small">ET₀, mm</span></div>
          <Columns data={days.map((d) => ({ id: String(d.date), label: day(d.date), value: d.et0 }))} color="var(--series-2)" unit="mm ET₀" />
        </section>
      </div>
    </div>
  );
}
