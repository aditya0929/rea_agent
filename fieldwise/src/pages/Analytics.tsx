import { useState } from "react";
import { useStore } from "../store/store";
import { classify, indexGrid, isProcessing, LAYERS, layerMeta, passesFor, seasonTrend, type Layer } from "../lib/sat";
import { cropById } from "../lib/crops";
import { formatArea } from "../lib/geo";
import { healthScore } from "../lib/advisory";
import { TrendLine } from "../components/charts";
import { Icon } from "../components/Icon";
import { useNow } from "../components/ui";
import { useGoToField } from "../App";

const TONE = ["good", "warning", "critical"] as const;

export default function Analytics() {
  const now = useNow(60_000);
  const { fields } = useStore();
  const goTo = useGoToField();
  const [layer, setLayer] = useState<Layer>("health");
  const meta = layerMeta(layer);
  const ready = fields.filter((f) => !isProcessing(f, now));

  const rows = ready.map((f) => {
    const clear = passesFor(f, now).filter((p) => p.clear);
    const latest = clear[clear.length - 1], prev = clear[clear.length - 2];
    const g = indexGrid(f, layer, latest);
    const mean = g.mean;
    const delta = prev ? mean - indexGrid(f, layer, prev).mean : 0;
    return { f, clear, latest, mean, cls: classify(layer, g.classMean), delta, score: healthScore(f, latest) };
  });

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow">Analytics</div>
          <h1>How every field is trending</h1>
          <p className="muted">Mean {meta.index} per clear satellite pass over the last 60 days.</p>
        </div>
        <div className="seg">
          {LAYERS.map((l) => <button key={l.id} className={layer === l.id ? "active" : ""} onClick={() => setLayer(l.id)}>{l.label}</button>)}
        </div>
      </header>

      <div className="cards-3">
        {rows.map(({ f, clear, mean, cls, delta }) => {
          const better = meta.higherIsBetter ? delta >= 0 : delta <= 0;
          return (
            <section key={f.id} className="card">
              <div className="card-head">
                <div>
                  <h3>{f.name}</h3>
                  <small className="muted">{cropById(f.crop).name} · {formatArea(f.areaHa)} ha</small>
                </div>
                <button className="btn btn-sm btn-glass" onClick={() => goTo(f.id)}><Icon name="map" size={14} /> Map</button>
              </div>
              <div className="kpi-row">
                <b>{mean.toFixed(2)}</b>
                <span className={`pill pill-${TONE[cls]} pill-xs`}><Icon name={cls ? "alert" : "check"} size={11} />{meta.classes[cls]}</span>
                <span className={better ? "text-good small" : "text-critical small"}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} since last image</span>
              </div>
              <TrendLine points={seasonTrend(f, layer, clear)} color={meta.ramp[3]} format={(v) => `${meta.index} ${v.toFixed(2)}`} />
            </section>
          );
        })}
      </div>

      <section className="card">
        <div className="card-head"><h3>All layers, latest image</h3><span className="muted small">Mean index value and condition class</span></div>
        <div className="table-wrap flat">
          <table className="table">
            <thead>
              <tr><th>Field</th><th className="num">Score</th>{LAYERS.map((l) => <th key={l.id} className="num">{l.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(({ f, latest, score }) => (
                <tr key={f.id} onClick={() => goTo(f.id)}>
                  <td><strong>{f.name}</strong><small>{latest && new Date(latest.date).toLocaleDateString([], { day: "numeric", month: "short" })}</small></td>
                  <td className="num"><b>{score}</b></td>
                  {LAYERS.map((l) => {
                    const g = indexGrid(f, l.id, latest);
                    const v = g.mean;
                    const c = classify(l.id, g.classMean);
                    return (
                      <td key={l.id} className="num">
                        <span className="cell-val"><Icon name={c ? "alert" : "check"} size={12} className={`text-${TONE[c]}`} />{v.toFixed(2)}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {fields.length > ready.length && <p className="muted small">{fields.length - ready.length} field(s) are still fetching satellite history.</p>}
    </div>
  );
}
