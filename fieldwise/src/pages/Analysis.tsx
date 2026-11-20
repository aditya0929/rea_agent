import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Field } from "../types";
import { useCurrentUser, useStore } from "../store/store";
import { can } from "../lib/permissions";
import { alertsFor, BAND_COLORS, bandLabels, DAY, indexGrid, isProcessing, LAYERS, layerMeta, nextPass, passesFor, seasonTrend, zoneMap, type Alert, type Layer } from "../lib/sat";
import { byPriority, findings, healthScore, yieldEstimate, type Priority } from "../lib/advisory";
import { forecast } from "../lib/weather";
import { cropById, growthStage } from "../lib/crops";
import { centroid, formatArea, haToAcres } from "../lib/geo";
import { statusOf } from "../lib/tasks";
import { Map3D, type MapMarker } from "../components/Map3D";
import { FieldScene } from "../three/field/FieldScene";
import { CONCERN_COLORS, concernGrid, hotspotFor, localFrame, probeReadings, threatsFor } from "../lib/fieldview";
import { Icon, type IconName } from "../components/Icon";
import { Empty, useNow } from "../components/ui";
import { TrendLine } from "../components/charts";
import { TaskEditor, type TaskDraft } from "../components/TaskEditor";
import { TaskDetail } from "../components/TaskDetail";
import { OrbitScene } from "../three/OrbitScene";
import { ScanOverlay } from "../three/ScanOverlay";

type Section = "overview" | Layer;
const CONCERN_LABELS = ["No concern", "Watch", "Act soon", "Act now"];

const LAYER_ICON: Record<Layer, IconName> = { health: "leaf", water: "drop", nutrients: "flask", pests: "bug", soil: "layers", yield: "chart" };
const PRIORITY: Record<Priority, { label: string; tone: string }> = {
  high: { label: "High priority", tone: "critical" },
  medium: { label: "Watch", tone: "warning" },
  low: { label: "Looks good", tone: "good" },
};
const EXPLAIN: Record<Layer, string> = {
  health: "NDVI measures how green and dense the canopy is, judged against what this crop should look like at its stage.",
  water: "NDMI tracks moisture in the leaves. Probes in the field show the soil moisture readings.",
  nutrients: "A chlorophyll-based nitrogen index. Pale canopy means the crop is running short.",
  pests: "Risk modelled from canopy anomalies, humidity and crop stage. It is a forecast, not a sighting.",
  soil: "Soil organic carbon estimated from bare-soil reflectance, checked against field probes.",
  yield: "Expected yield from canopy health over the last five passes, compared with a typical season.",
};

function Countdown({ to }: { to: number }) {
  const now = useNow(1000);
  const ms = Math.max(0, to - now);
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), s = Math.floor((ms % 60_000) / 1000);
  return (
    <span className="countdown">
      {d > 0 && <><b>{d}</b>d </>}<b>{h}</b>h <b>{String(m).padStart(2, "0")}</b>m <b>{String(s).padStart(2, "0")}</b>s
    </span>
  );
}

function ProcessingScene({ field }: { field: Field }) {
  const now = useNow(400);
  const done = Math.min(1, (now - field.createdAt) / (field.readyAt - field.createdAt));
  const steps = ["Boundary received", "Tasking satellite over the field", "Downloading 60 days of passes", "Removing clouds and shadows", "Computing crop indices"];
  const at = Math.min(steps.length - 1, Math.floor(done * steps.length));
  return (
    <div className="processing-scene">
      <OrbitScene mode="close" focus={centroid(field.boundary)}>
        <div className="processing-card glass">
          <div className="eyebrow"><span className="dot-live" /> Setting up {field.name}</div>
          <h2>Fetching satellite history</h2>
          <div className="boot-bar"><i style={{ width: `${done * 100}%` }} /></div>
          <ol className="steps">
            {steps.map((s, i) => (
              <li key={s} className={i < at ? "done" : i === at ? "active" : ""}>
                <Icon name={i < at ? "check" : i === at ? "satellite" : "clock"} size={14} /> {s}
              </li>
            ))}
          </ol>
          <small className="muted">Maps appear automatically in about {Math.max(1, Math.ceil((field.readyAt - now) / 1000))} s.</small>
        </div>
      </OrbitScene>
    </div>
  );
}

export default function Analysis() {
  const now = useNow(4000);
  const navigate = useNavigate();
  const me = useCurrentUser();
  const { fields, tasks, selectedFieldId, selectField, dismissedAlerts, dismissAlert } = useStore();
  const field = fields.find((f) => f.id === selectedFieldId) ?? fields[0];
  const [section, setSection] = useState<Section>("overview");
  const [passDate, setPassDate] = useState<number | null>(null);
  const [threeD, setThreeD] = useState(true);
  const [panelOpen, setPanelOpen] = useState(true);
  const [fly, setFly] = useState<{ lat: number; lng: number; key: string } | null>(null);
  const [scanKey, setScanKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [showWork, setShowWork] = useState(true);
  const [view, setView] = useState<"field" | "map">("field");
  const [cardOpen, setCardOpen] = useState(true);

  const layer: Layer = section === "overview" ? "health" : section;
  const processing = field ? isProcessing(field, now) : false;
  const passes = useMemo(() => (field ? passesFor(field, now) : []), [field, processing, Math.floor(now / 3_600_000)]);
  const clear = passes.filter((p) => p.clear);
  const pass = clear.find((p) => p.date === passDate) ?? clear[clear.length - 1];
  const latest = clear[clear.length - 1];
  const before = clear[clear.length - 2];

  useEffect(() => setPassDate(null), [field?.id]);
  // Each new view gets a satellite pass over the field.
  useEffect(() => {
    if (field && !processing) setScanKey(`${field.id}|${layer}|${pass?.date}`);
  }, [field?.id, layer, pass?.date, processing]);

  const grid = field && pass ? indexGrid(field, layer, pass) : null;
  const ready = !!(field && pass && !processing);
  const concern = useMemo(() => (ready ? concernGrid(field!, layer, pass!) : null), [ready, field, layer, pass]);
  const hotspot = useMemo(() => (ready ? hotspotFor(field!, layer, pass!) : null), [ready, field, layer, pass]);
  const readings = useMemo(() => (ready ? probeReadings(field!, layer, pass!) : []), [ready, field, layer, pass]);
  // Reopen the detail card whenever the layer or field changes.
  useEffect(() => setCardOpen(true), [layer, field?.id]);
  const zoneRaster = useMemo(() => (field && pass && !processing ? zoneMap(field, layer, pass) : null), [field, layer, pass, processing]);
  const processingIds = useMemo(() => new Set(fields.filter((f) => isProcessing(f, now)).map((f) => f.id)), [fields, processing]);

  const converted = new Set(tasks.map((t) => t.alertId).filter(Boolean));
  const alerts = field ? alertsFor(field, now).filter((a) => !dismissedAlerts.includes(a.id) && !converted.has(a.id)) : [];
  const zones = field && pass ? alertsFor(field, pass.date + 1).map((a) => a) : [];
  const fieldTasks = field ? tasks.filter((t) => t.fieldId === field.id && t.status !== "done") : [];

  const markers: MapMarker[] = useMemo(() => {
    const zoneMarkers = zones
      .filter((a) => section === "overview" || section === "health" || a.zone.layer === section)
      .map((a) => ({ id: a.zone.id, position: a.zone.position, className: `mk-zone mk-${a.level}`, label: a.zone.label, title: a.title, onClick: () => setFly({ ...a.zone.position, key: a.id + Date.now() }) }));
    const work = showWork
      ? fieldTasks.filter((t) => t.zone).map((t) => ({ id: t.id, position: t.zone!, className: `mk-task mk-${statusOf(t, now)}`, title: t.title, onClick: () => setOpenTask(t.id) }))
      : [];
    return [...zoneMarkers, ...work];
    // Rebuild when the visible zones or tasks change.
  }, [field?.id, pass?.date, section, showWork, tasks, Math.floor(now / 60_000)]);

  if (!field) {
    return (
      <div className="page">
        <Empty icon="map" title="No fields yet">
          Map your first field to start satellite monitoring.
          {can(me, "fields.manage") && <><br /><button className="btn btn-primary mt" onClick={() => navigate("/fields/new")}>Map a field</button></>}
        </Empty>
      </div>
    );
  }

  const meta = layerMeta(layer);
  const all = pass ? findings(field, pass).sort(byPriority) : [];
  const score = pass ? healthScore(field, pass) : null;
  const yieldEst = pass ? yieldEstimate(field, pass) : null;
  const next = nextPass(field, now);
  const weather = forecast(field, now);
  const days = Math.floor((now - new Date(field.sowingDate).getTime()) / DAY);
  const badge = (l: Layer) => all.find((f) => f.layer === l)?.priority;
  const fmtDate = (t: number) => new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });

  const threats = layer === "pests" && pass ? threatsFor(field, pass, indexGrid(field, "pests", pass).mean) : [];
  const badProbes = readings.filter((r) => r.bad);
  const probeSummary = badProbes.length
    ? `${badProbes.length} of ${readings.length} field probes read ${badProbes[0].status}. Lowest reading: ${[...badProbes].sort((a, b) => parseFloat(a.value.replace(/[^\d.]/g, "")) - parseFloat(b.value.replace(/[^\d.]/g, "")))[0].value}.`
    : `All ${readings.length} field probes read within the normal range.`;

  const createFromAlert = (a: Alert) =>
    setDraft({
      title: a.suggestion.title, type: a.suggestion.type, fieldId: a.fieldId,
      zone: { label: a.zone.label, ...a.zone.position }, instructions: a.suggestion.instructions,
      resources: a.suggestion.resources, due: now + a.suggestion.dueInHours * 3_600_000, source: "satellite", alertId: a.id,
    });

  const zoneList = (list: Alert[]) =>
    list.length === 0 ? <p className="muted small">No problem zones on this image.</p> : (
      <ul className="zones">
        {list.map((a) => (
          <li key={a.id} className={`zone zone-${a.level}`}>
            <div className="zone-top">
              <span className={`pill pill-${a.level === "urgent" ? "critical" : "warning"} pill-xs`}><Icon name="alert" size={11} />{a.level === "urgent" ? "Act now" : "Watch"}</span>
              <span className="muted small">{a.zone.label} · {layerMeta(a.zone.layer).label}</span>
            </div>
            <strong>{a.title}</strong>
            <p>{a.detail}</p>
            <div className="row gap-s">
              <button className="btn btn-sm btn-glass" onClick={() => setFly({ ...a.zone.position, key: a.id + Date.now() })}><Icon name="target" size={14} /> Show on map</button>
              {can(me, "tasks.manage") && !converted.has(a.id) && (
                <button className="btn btn-sm btn-ops" onClick={() => createFromAlert(a)} title="Operations add-on">
                  <Icon name="plus" size={14} /> Assign to crew
                </button>
              )}
              {converted.has(a.id) && <span className="pill pill-info pill-xs"><Icon name="check" size={11} />Task assigned</span>}
            </div>
          </li>
        ))}
      </ul>
    );

  return (
    <div className={`analysis ${!processing && section === "overview" && alerts.length > 0 ? "has-toasts" : ""} ${panelOpen ? "" : "panel-collapsed"}`}>
      {view === "field" && concern && !processing ? (
        <FieldScene
          field={field}
          layer={layer}
          passKey={pass!.date}
          grid={concern}
          hotspot={hotspot}
          readings={readings}
          threeD={threeD}
          insetLeft={(panelOpen ? 488 : 416) + (section !== "overview" && hotspot && cardOpen ? 414 : 0)}
          onHotspotClick={() => setCardOpen(true)}
        />
      ) : (
      <Map3D
        fields={fields}
        selectedId={field.id}
        processingIds={processingIds}
        zones={zoneRaster}
        threeD={threeD}
        fitKey={`${field.id}|${threeD}`}
        flyTo={fly}
        markers={processing ? [] : markers}
        onSelectField={selectField}
      />
      )}
      {scanKey && !processing && <ScanOverlay key={scanKey} runKey={scanKey} onDone={() => setScanKey(null)} />}
      {processing && <ProcessingScene field={field} />}

      {/* Left rail */}
      <nav className="rail glass" aria-label="Analysis">
        <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}>
          <Icon name="satellite" /><span>Overview</span>
        </button>
        {LAYERS.map((l) => {
          const p = badge(l.id);
          return (
            <button key={l.id} className={section === l.id ? "active" : ""} onClick={() => setSection(l.id)} disabled={processing}>
              <Icon name={LAYER_ICON[l.id]} />
              <span>{l.label}</span>
              {p && p !== "low" && <i className={`rail-dot rail-${PRIORITY[p].tone}`} />}
            </button>
          );
        })}
      </nav>

      {/* Advisory panel */}
      {!processing && pass && (
        <aside className={`advisory glass ${panelOpen ? "" : "collapsed"}`}>
          <header className="advisory-head">
            <div>
              <div className="eyebrow"><Icon name={section === "overview" ? "satellite" : LAYER_ICON[layer]} size={13} />{section === "overview" ? "Farm advisory" : `${meta.label} · ${meta.index}`}</div>
              <div className="field-line">
                <span className="tag"><Icon name="leaf" size={12} />{cropById(field.crop).name}</span>
                <span>{formatArea(field.areaHa)} ha · {formatArea(haToAcres(field.areaHa))} ac</span>
                <span className="muted">Pass {fmtDate(pass.date)}</span>
              </div>
            </div>
            <button className="icon-btn" onClick={() => setPanelOpen(!panelOpen)} aria-label={panelOpen ? "Collapse panel" : "Expand panel"}>
              <Icon name={panelOpen ? "back" : "chevron"} />
            </button>
          </header>

          {panelOpen && (
            <div className="advisory-body">
              {section === "overview" ? (
                <>
                  <section className="hero-card">
                    <div className="score-ring" style={{ ["--p" as string]: `${score}` }}>
                      <b>{score}</b><small>/100</small>
                    </div>
                    <div>
                      <div className="eyebrow">Field score</div>
                      <h3>{score! >= 75 ? "In good shape" : score! >= 55 ? "Needs a closer look" : "Under stress"}</h3>
                      <p className="muted small">{growthStage(field.crop, days)}{days >= 0 && ` · day ${days} after sowing`}</p>
                    </div>
                  </section>

                  {all.slice(0, 4).map((f) => (
                    <button key={f.layer} className={`advice advice-${PRIORITY[f.priority].tone}`} onClick={() => setSection(f.layer)}>
                      <span className="advice-icon"><Icon name={LAYER_ICON[f.layer]} size={18} /></span>
                      <span className="advice-text">
                        <small>{layerMeta(f.layer).label} <em className={`pill pill-${PRIORITY[f.priority].tone} pill-xs`}>{PRIORITY[f.priority].label}</em></small>
                        <b>{f.headline}</b>
                        <span className="muted small">{f.advice}</span>
                      </span>
                      <Icon name="chevron" size={16} />
                    </button>
                  ))}

                  {yieldEst && (
                    <section className="mini-card">
                      <div className="eyebrow">Yield estimate</div>
                      {yieldEst.early ? (
                        <p className="small muted">Too early to estimate. Forecasts start once the canopy has about {Math.ceil(cropById(field.crop).season * 0.25)} days of history.</p>
                      ) : (
                      <div className="yield">
                        <b>{yieldEst.perHa.toFixed(1)}<small> t/ha</small></b>
                        <span>{yieldEst.total.toFixed(0)} t total</span>
                        <span className={yieldEst.vsTarget >= 0 ? "text-good" : "text-critical"}>{yieldEst.vsTarget >= 0 ? "+" : ""}{Math.round(yieldEst.vsTarget * 100)}% vs typical</span>
                      </div>
                      )}
                    </section>
                  )}

                  <section className="next-pass">
                    <Icon name="satellite" size={22} />
                    <div>
                      <div className="eyebrow">Next satellite image</div>
                      <Countdown to={next.date} />
                      <small>{new Date(next.date).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} · {next.cloudForecast}% cloud forecast</small>
                    </div>
                  </section>

                  <section className="mini-card">
                    <div className="row between"><div className="eyebrow">Weather</div><button className="link" onClick={() => navigate("/weather")}>Forecast <Icon name="chevron" size={12} /></button></div>
                    <div className="wx-strip">
                      {weather.map((w) => (
                        <div key={w.date}>
                          <small>{new Date(w.date).toLocaleDateString([], { weekday: "short" })}</small>
                          <Icon name={w.rainMm ? "rain" : "sun"} size={18} />
                          <b>{w.tMax}°</b>
                          <i className={w.sprayOk ? "spray-ok" : "spray-no"} title={w.sprayOk ? "Spray window" : "No spraying"} />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mini-card ops-card">
                    <div className="row between">
                      <div className="eyebrow">Field work <em className="addon">Add-on</em></div>
                      <button className="link" onClick={() => navigate("/ops")}>Operations <Icon name="chevron" size={12} /></button>
                    </div>
                    <p className="small">
                      {fieldTasks.length} open task{fieldTasks.length === 1 ? "" : "s"} on this field
                      {fieldTasks.some((t) => statusOf(t, now) === "delayed") && <>, <span className="text-critical">{fieldTasks.filter((t) => statusOf(t, now) === "delayed").length} delayed</span></>}
                      . {alerts.length > 0 && `${alerts.length} zone${alerts.length === 1 ? "" : "s"} still need someone on the ground.`}
                    </p>
                  </section>
                </>
              ) : (
                grid && (
                  <>
                    <p className="explain">{EXPLAIN[layer]}</p>
                    <section className="mini-card">
                      <div className="row between"><div className="eyebrow">Condition</div><span className="muted small">{meta.index} mean {grid.mean.toFixed(2)}</span></div>
                      {view === "field" && concern ? (
                        <>
                          <div className="shares" role="img" aria-label="Share of field at each concern level">
                            {[0, 1, 2, 3].map((i) => concern.shares[i] > 0.002 && <i key={i} style={{ flexGrow: concern.shares[i], background: i ? CONCERN_COLORS[i - 1] : "rgba(255,255,255,0.14)" }} />)}
                          </div>
                          <ul className="band-list">
                            {CONCERN_LABELS.map((label, i) => ({ label, i })).reverse().map(({ label, i }) => (
                              <li key={label}>
                                <i className="swatch" style={{ background: i ? CONCERN_COLORS[i - 1] : "rgba(255,255,255,0.14)" }} />
                                <span>{label}</span>
                                <b>{Math.round(concern.shares[i] * 100)}%</b>
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : zoneRaster && (
                        <>
                          <div className="shares" role="img" aria-label="Share of field in each zone class">
                            {[...zoneRaster.shares].reverse().map((s, i) => s > 0.002 && <i key={i} style={{ flexGrow: s, background: BAND_COLORS[4 - i] }} />)}
                          </div>
                          <ul className="band-list">
                            {bandLabels(layer).map((label, i) => ({ label, i })).reverse().map(({ label, i }) => (
                              <li key={label}>
                                <i className={`swatch ${i === 0 ? "hatched" : ""}`} style={{ background: BAND_COLORS[i] }} />
                                <span>{label}</span>
                                <b>{Math.round(zoneRaster.shares[i] * 100)}%</b>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </section>
                    <section className="mini-card">
                      <div className="eyebrow">What to do</div>
                      <p className="small">{all.find((f) => f.layer === layer)?.advice}</p>
                    </section>
                    <section className="mini-card">
                      <div className="row between"><div className="eyebrow">Season trend</div><span className="muted small">{meta.index}</span></div>
                      <TrendLine points={seasonTrend(field, layer, passes)} color={meta.ramp[3]} format={(v) => `${meta.index} ${v.toFixed(2)}`} />
                    </section>
                    {layer !== "soil" && layer !== "yield" && (
                      <section className="mini-card">
                        <div className="eyebrow">Problem zones</div>
                        {zoneList(zones.filter((a) => layer === "health" || a.zone.layer === layer))}
                      </section>
                    )}
                  </>
                )
              )}
            </div>
          )}
        </aside>
      )}

      {/* Top toolbar */}
      {!processing && pass && (
        <div className="map-toolbar glass">
          <span className="showing"><span className="eyebrow">Showing</span><Icon name={LAYER_ICON[layer]} size={15} /><b>{meta.label}</b></span>
          <label className="pass-select">
            <Icon name="calendar" size={15} />
            <select value={pass.date} onChange={(e) => setPassDate(Number(e.target.value))} aria-label="Satellite image date">
              {[...passes].reverse().map((p) => (
                <option key={p.date} value={p.date} disabled={!p.clear}>
                  {new Date(p.date).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })} · {p.clear ? `${p.cloud}% cloud` : "too cloudy"}
                </option>
              ))}
            </select>
          </label>
          <span className="chip-glass">{meta.index}</span>
          <div className="seg glass-seg" role="group" aria-label="View">
            <button className={view === "field" ? "active" : ""} onClick={() => setView("field")}>Field</button>
            <button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Map</button>
          </div>
          <div className="seg glass-seg">
            <button className={!threeD ? "active" : ""} onClick={() => setThreeD(false)}>2D</button>
            <button className={threeD ? "active" : ""} onClick={() => setThreeD(true)}>3D</button>
          </div>
          <button className={`icon-btn ${showWork ? "on" : ""}`} onClick={() => setShowWork(!showWork)} title="Show field work on the map" aria-pressed={showWork}>
            <Icon name="flag" size={16} />
          </button>
        </div>
      )}

      {scanKey && !processing && (
        <div className="scanning glass"><span className="dot-live" /> Scanning {field.name}…</div>
      )}

      {/* Toasts */}
      {!processing && section === "overview" && alerts.length > 0 && (
        <div className="toasts">
          {alerts.slice(0, 2).map((a) => (
            <div key={a.id} className={`toast glass toast-${a.level}`}>
              <div className="row between">
                <span className="eyebrow"><span className={`sev sev-${a.level}`} />{a.level === "urgent" ? "Act now" : "Watch"} · {field.name}</span>
                <button className="icon-btn sm" onClick={() => dismissAlert(a.id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
              </div>
              <b>{a.title}</b>
              <p className="small muted">{a.detail}</p>
              <div className="row gap-s">
                <button className="btn btn-sm btn-alert" onClick={() => (setSection(a.zone.layer), setFly({ ...a.zone.position, key: a.id + Date.now() }))}>Show on map <Icon name="chevron" size={13} /></button>
                {can(me, "tasks.manage") && <button className="btn btn-sm btn-glass" onClick={() => createFromAlert(a)}>Assign</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Before / after */}
      {!processing && latest && before && (
        <div className="compare glass">
          <Icon name="satellite" size={16} />
          <span>
            <small className="eyebrow">Latest clear image · {fmtDate(latest.date)}</small>
            <b>{pass === latest ? `Compare with ${fmtDate(before.date)}` : `Viewing ${fmtDate(pass!.date)}`}</b>
          </span>
          <div className="seg glass-seg">
            <button className={pass === before ? "active" : ""} onClick={() => setPassDate(before.date)}>Before</button>
            <button className={pass === latest ? "active" : ""} onClick={() => setPassDate(null)}>After</button>
          </div>
        </div>
      )}

      {/* Hotspot detail card */}
      {!processing && view === "field" && section !== "overview" && hotspot && cardOpen && pass && (
        <section className="spot-card glass">
          <header className="spot-head">
            <span className="spot-icon"><Icon name={LAYER_ICON[layer]} size={20} /></span>
            <div>
              <div className="eyebrow"><span className="dot-live" />{hotspot.eyebrow}</div>
              <h3>{hotspot.title}</h3>
              <small className="muted"><Icon name="satellite" size={12} /> {hotspot.subtitle}</small>
            </div>
            <button className="icon-btn sm" onClick={() => setCardOpen(false)} aria-label="Close"><Icon name="x" size={15} /></button>
          </header>
          <div className="spot-metrics">
            <div><small>Area</small><b>{hotspot.areaHa.toFixed(2)} ha</b></div>
            <div><small>Of field</small><b><i className="mini-ring" style={{ ["--p" as string]: `${Math.round(hotspot.share * 100)}` }} />{Math.round(hotspot.share * 100)}%</b></div>
            <div><small>How sure</small><b><span className={`sure sure-${hotspot.confidence.toLowerCase()}`}><i /><i /><i /></span>{hotspot.confidence}</b></div>
          </div>
          {layer === "pests" ? (
            <>
              <div className="spot-sub row between"><span className="eyebrow">Risks for the whole field</span><small className="muted">chance of affecting your crop</small></div>
              <ul className="threats">
                {threats.map((t) => (
                  <li key={t.name}>
                    <i className="dot" style={{ background: t.color }} />
                    <span>{t.name}</span>
                    <span className="bar"><i style={{ width: `${t.chance * 100}%`, background: t.chance > 0.7 ? "var(--critical)" : t.chance > 0.45 ? "var(--warning)" : "#7cc8ff" }} /></span>
                    <b className={t.chance > 0.7 ? "text-critical" : t.chance > 0.45 ? "text-warning" : ""}>{Math.round(t.chance * 100)}%</b>
                  </li>
                ))}
              </ul>
              <p className="spot-note"><Icon name="alert" size={14} />A forecast, not a sighting: the satellite can't see pests or disease directly, so these are the spots where trouble usually starts.</p>
              <dl className="spot-where">
                {threats.slice(0, 2).map((t) => (
                  <div key={t.name}><dt>{t.name}</dt><dd>{t.where}</dd></div>
                ))}
              </dl>
            </>
          ) : (
            <>
              <div className="spot-sub"><span className="eyebrow">Across the field</span></div>
              <ul className="band-list">
                {CONCERN_LABELS.map((label, i) => ({ label, i })).reverse().map(({ label, i }) => (
                  <li key={label}>
                    <i className="swatch" style={{ background: i ? CONCERN_COLORS[i - 1] : "rgba(255,255,255,0.12)" }} />
                    <span>{label}</span>
                    <b>{Math.round(concern!.shares[i] * 100)}%</b>
                  </li>
                ))}
              </ul>
              {readings.length > 0 && (
                <p className="spot-note"><Icon name="target" size={14} />{probeSummary}</p>
              )}
              <p className="spot-note"><Icon name="leaf" size={14} />{all.find((x) => x.layer === layer)?.advice}</p>
            </>
          )}
          {can(me, "tasks.manage") && (
            <button className="btn btn-sm btn-ops" onClick={() => setDraft({
              title: `${hotspot.title} · ${field.name}`,
              type: layer === "water" ? "irrigation" : layer === "nutrients" ? "fertilizing" : "scouting",
              fieldId: field.id,
              zone: { label: hotspot.title, ...localFrame(field).toLatLng(hotspot.center) },
              instructions: all.find((x) => x.layer === layer)?.advice ?? "",
              resources: [],
              due: now + 36 * 3_600_000,
              source: "satellite",
            })}><Icon name="plus" size={14} /> Assign this spot to a crew</button>
          )}
        </section>
      )}

      {/* Concern legend (field view) */}
      {!processing && view === "field" && concern && (
        <div className="legend glass">
          <b>{meta.label} <span className="muted">· needs attention</span></b>
          <ul className="band-list compact">
            {CONCERN_LABELS.map((label, i) => ({ label, i })).reverse().map(({ label, i }) => (
                  <li key={label}>
                    <i className="swatch" style={{ background: i ? CONCERN_COLORS[i - 1] : "rgba(255,255,255,0.12)" }} />
                    <span>{label}</span>
                    <b>{Math.round(concern!.shares[i] * 100)}%</b>
                  </li>
                ))}
          </ul>
          <small className="muted">Each square is one 10 m satellite pixel</small>
        </div>
      )}

      {/* Legend */}
      {!processing && view === "map" && zoneRaster && (
        <div className="legend glass">
          <b>{meta.label} zones <span className="muted">({meta.index})</span></b>
          <ul className="band-list compact">
            {bandLabels(layer).map((label, i) => ({ label, i })).reverse().map(({ label, i }) => (
              <li key={label}>
                <i className={`swatch ${i === 0 ? "hatched" : ""}`} style={{ background: BAND_COLORS[i] }} />
                <span>{label}</span>
                <b>{Math.round(zoneRaster.shares[i] * 100)}%</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {draft && <TaskEditor draft={draft} onClose={() => setDraft(null)} />}
      {openTask && <TaskDetail taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  );
}
