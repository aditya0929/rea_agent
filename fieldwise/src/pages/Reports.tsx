import { useStore } from "../store/store";
import { alertsFor, indexGrid, isProcessing, LAYERS, nextPass, passesFor } from "../lib/sat";
import { byPriority, findings, healthScore, yieldEstimate } from "../lib/advisory";
import { cropById, growthStage } from "../lib/crops";
import { formatArea, formatDistance, haToAcres } from "../lib/geo";
import { forecast } from "../lib/weather";
import { assigneeName, formatDue, statusOf } from "../lib/tasks";
import { DAY } from "../lib/sat";
import { Icon } from "../components/Icon";
import { Empty, StatusPill, useNow } from "../components/ui";

export default function Reports() {
  const now = useNow(60_000);
  const { fields, tasks, members, teams, selectedFieldId, selectField, orgName } = useStore();
  const field = fields.find((f) => f.id === selectedFieldId) ?? fields[0];
  if (!field) return <div className="page"><Empty icon="map" title="No fields to report on" /></div>;
  const ready = !isProcessing(field, now);
  const clear = ready ? passesFor(field, now).filter((p) => p.clear) : [];
  const latest = clear[clear.length - 1];
  const days = Math.floor((now - new Date(field.sowingDate).getTime()) / DAY);

  return (
    <div className="page">
      <header className="page-head no-print">
        <div>
          <div className="eyebrow">Reports</div>
          <h1>Field report</h1>
          <p className="muted">A one-page summary to share with agronomists, buyers or lenders.</p>
        </div>
        <div className="row gap-s">
          <select value={field.id} onChange={(e) => selectField(e.target.value)} aria-label="Field">
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!latest}><Icon name="upload" size={15} /> Print / save PDF</button>
        </div>
      </header>

      {!latest ? (
        <Empty icon="satellite" title="Satellite history is still loading">This field's first images will be ready shortly.</Empty>
      ) : (
        <article className="report-sheet">
          <header className="sheet-head">
            <div>
              <small>{orgName} · Field report</small>
              <h2>{field.name}</h2>
              <p>{cropById(field.crop).name} · {growthStage(field.crop, days)} · {formatArea(field.areaHa)} ha ({formatArea(haToAcres(field.areaHa))} ac) · {formatDistance(field.perimeterM)} perimeter</p>
            </div>
            <div className="sheet-score">
              <b>{healthScore(field, latest)}</b>
              <small>Field score / 100</small>
            </div>
          </header>
          <p className="sheet-meta">Based on the clear image of {new Date(latest.date).toLocaleDateString([], { dateStyle: "long" })} ({latest.cloud}% cloud). Next image {new Date(nextPass(field, now).date).toLocaleDateString([], { dateStyle: "medium" })}.</p>

          <h3>Condition by layer</h3>
          <table className="sheet-table">
            <thead><tr><th>Layer</th><th>Index</th><th className="num">Mean</th><th className="num">Good</th><th className="num">Middle</th><th className="num">Worst</th><th>Assessment</th></tr></thead>
            <tbody>
              {findings(field, latest).sort(byPriority).map((f) => {
                const g = indexGrid(field, f.layer, latest);
                const meta = LAYERS.find((l) => l.id === f.layer)!;
                return (
                  <tr key={f.layer}>
                    <td><b>{meta.label}</b></td><td>{meta.index}</td><td className="num">{g.mean.toFixed(2)}</td>
                    {g.shares.map((s, i) => <td key={i} className="num">{Math.round(s * 100)}%</td>)}
                    <td>{f.headline}. {f.advice}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(() => {
            const y = yieldEstimate(field, latest);
            return (
              <div className="sheet-kpis">
                <div><small>Yield estimate</small><b>{y.early ? "Too early" : `${y.perHa.toFixed(1)} t/ha`}</b><span>{y.early ? "Not enough canopy history yet" : `${y.total.toFixed(0)} t across the field`}</span></div>
                <div><small>Versus a typical season</small><b>{y.early ? "–" : `${y.vsTarget >= 0 ? "+" : ""}${Math.round(y.vsTarget * 100)}%`}</b><span>Typical {y.target} t/ha for {cropById(field.crop).name.toLowerCase()}</span></div>
                <div><small>5-day rain</small><b>{forecast(field, now).reduce((s, w) => s + w.rainMm, 0)} mm</b><span>{forecast(field, now).filter((w) => w.sprayOk).length} spray-friendly days</span></div>
              </div>
            );
          })()}

          <h3>Zones that need attention</h3>
          <ul className="sheet-list">
            {alertsFor(field, now).map((a) => <li key={a.id}><b>{a.title}.</b> {a.detail} <em>Suggested: {a.suggestion.title.toLowerCase()}.</em></li>)}
            {alertsFor(field, now).length === 0 && <li>No problem zones on the latest image.</li>}
          </ul>

          <h3>Field work in progress</h3>
          <table className="sheet-table">
            <thead><tr><th>Task</th><th>Assigned to</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {tasks.filter((t) => t.fieldId === field.id).sort((a, b) => b.due - a.due).slice(0, 8).map((t) => (
                <tr key={t.id}><td>{t.title}</td><td>{assigneeName(t, members, teams)}</td><td>{formatDue(t.due, now)}</td><td><StatusPill status={statusOf(t, now)} /></td></tr>
              ))}
            </tbody>
          </table>
          <footer className="sheet-foot">Generated by Fieldwise on {new Date(now).toLocaleString()}. Satellite indices in this demo are simulated.</footer>
        </article>
      )}
    </div>
  );
}
