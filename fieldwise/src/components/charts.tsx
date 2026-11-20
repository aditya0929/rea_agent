import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";

/** Pointer position relative to the chart container. */
const rel = (ref: RefObject<HTMLElement | null>, e: MouseEvent) => {
  const r = ref.current!.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.content}
    </div>
  );
}

/** Bar with a 4px rounded data-end and a square baseline end (horizontal). */
const hbarPath = (x: number, y: number, w: number, h: number, r = 4) => {
  const rr = Math.min(r, w, h / 2);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
};

export interface BarDatum {
  id: string;
  label: string;
  value: number | null;
  detail: string;
}

/** Single-series horizontal bars on a 0–100% scale. The title names the series, so no legend. */
export function PercentBars({ data, color = "var(--series-1)" }: { data: BarDatum[]; color?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const labelW = 120, valueW = 44, row = 34, bar = 18;
  const plotW = Math.max(40, width - labelW - valueW);
  const h = data.length * row + 22;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="viz" ref={ref}>
      {width > 0 && (
        <svg width={width} height={h} role="img" aria-label="Completion rate by group">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={labelW + t * plotW} x2={labelW + t * plotW} y1={0} y2={h - 20} className="viz-grid" />
              <text x={labelW + t * plotW} y={h - 6} className="viz-tick" textAnchor="middle">{t * 100}%</text>
            </g>
          ))}
          {data.map((d, i) => {
            const y = i * row + (row - bar) / 2;
            const w = (d.value ?? 0) * plotW;
            return (
              <g
                key={d.id}
                onMouseMove={(e) => setTip({ x: rel(ref, e).x + 12, y: rel(ref, e).y - 10, content: <><strong>{d.label}</strong><span>{d.detail}</span></> })}
                onMouseLeave={() => setTip(null)}
              >
                <rect x={0} y={i * row} width={width} height={row} fill="transparent" />
                <text x={labelW - 10} y={y + bar / 2} className="viz-label" textAnchor="end" dominantBaseline="central">{d.label}</text>
                {d.value !== null && w > 0 && <path d={hbarPath(labelW, y, w, bar)} fill={color} />}
                <text x={labelW + w + 6} y={y + bar / 2} className="viz-value" dominantBaseline="central">
                  {d.value === null ? "No tasks" : `${Math.round(d.value * 100)}%`}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

export interface StackSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackRow {
  id: string;
  label: string;
  values: Record<string, number>;
}

/** Stacked horizontal counts, with a 2px surface gap between segments and a legend. */
export function StackedBars({ rows, series }: { rows: StackRow[]; series: StackSeries[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const labelW = 120, totalW = 36, row = 32, bar = 16, gap = 2;
  const max = Math.max(1, ...rows.map((r) => series.reduce((s, x) => s + (r.values[x.key] ?? 0), 0)));
  const plotW = Math.max(40, width - labelW - totalW);
  const unit = plotW / max;
  return (
    <div className="viz" ref={ref}>
      <div className="viz-legend">
        {series.map((s) => (
          <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      {width > 0 && (
        <svg width={width} height={rows.length * row} role="img" aria-label="Task status by person">
          {rows.map((r, i) => {
            const y = i * row + (row - bar) / 2;
            let x = labelW;
            const total = series.reduce((s, x) => s + (r.values[x.key] ?? 0), 0);
            const visible = series.filter((s) => (r.values[s.key] ?? 0) > 0);
            return (
              <g key={r.id}>
                <text x={labelW - 10} y={y + bar / 2} className="viz-label" textAnchor="end" dominantBaseline="central">{r.label}</text>
                {visible.map((s, j) => {
                  const w = Math.max(1, (r.values[s.key] ?? 0) * unit - (j < visible.length - 1 ? gap : 0));
                  const last = j === visible.length - 1;
                  const seg = (
                    <path
                      key={s.key}
                      d={last ? hbarPath(x, y, w, bar) : `M${x},${y}h${w}v${bar}h${-w}Z`}
                      fill={s.color}
                      onMouseMove={(e) => setTip({
                        x: rel(ref, e).x + 12, y: rel(ref, e).y + 18,
                        content: <><strong>{r.label}</strong><span>{s.label}: {r.values[s.key]}</span></>,
                      })}
                      onMouseLeave={() => setTip(null)}
                    />
                  );
                  x += w + gap;
                  return seg;
                })}
                <text x={labelW + total * unit + 6} y={y + bar / 2} className="viz-value" dominantBaseline="central">{total}</text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Line with a 10% area wash, end dot with surface ring, and a crosshair tooltip. */
export function TrendLine({ points, color, format, height = 120 }: {
  points: { date: number; value: number }[];
  color: string;
  format: (v: number) => string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 30, padR = 10, padT = 10, padB = 20;
  if (points.length < 2) return <div className="viz muted small">Needs two clear images to draw a trend.</div>;
  const w = Math.max(60, width - padL - padR), h = height - padT - padB;
  const t0 = points[0].date, t1 = points[points.length - 1].date;
  const X = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * w;
  const Y = (v: number) => padT + (1 - v) * h;
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(p.date)},${Y(p.value)}`).join("");
  const last = points[points.length - 1];
  const hp = hover === null ? null : points[hover];
  const fmtDate = (t: number) => new Date(t).toLocaleDateString([], { day: "numeric", month: "short" });
  return (
    <div className="viz" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Season trend"
          onMouseMove={(e) => {
            const x = rel(ref, e).x;
            let best = 0;
            points.forEach((p, i) => Math.abs(X(p.date) - x) < Math.abs(X(points[best].date) - x) && (best = i));
            setHover(best);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.5, 1].map((v) => (
            <g key={v}>
              <line x1={padL} x2={padL + w} y1={Y(v)} y2={Y(v)} className="viz-grid" />
              <text x={padL - 6} y={Y(v)} className="viz-tick" textAnchor="end" dominantBaseline="central">{v.toFixed(1)}</text>
            </g>
          ))}
          <text x={padL} y={height - 4} className="viz-tick">{fmtDate(t0)}</text>
          <text x={padL + w} y={height - 4} className="viz-tick" textAnchor="end">{fmtDate(t1)}</text>
          <path d={`${d}L${X(t1)},${Y(0)}L${X(t0)},${Y(0)}Z`} fill={color} opacity={0.1} />
          <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hp && <line x1={X(hp.date)} x2={X(hp.date)} y1={padT} y2={padT + h} className="viz-cross" />}
          {(hp ? [hp] : [last]).map((p) => (
            <circle key={p.date} cx={X(p.date)} cy={Y(p.value)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
          ))}
        </svg>
      )}
      {hp && (
        <div className="viz-tip" style={{ left: Math.min(X(hp.date) + 10, Math.max(0, width - 130)), top: 0 }} role="status">
          <strong>{fmtDate(hp.date)}</strong>
          <span>{format(hp.value)}</span>
        </div>
      )}
    </div>
  );
}

/** Single-series columns with 4px rounded caps; only the maximum is labelled, the rest via tooltip. */
export function Columns({ data, color, unit, height = 150 }: {
  data: { id: string; label: string; value: number }[];
  color: string;
  unit: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const padB = 22, padT = 18;
  const max = Math.max(1, ...data.map((d) => d.value));
  const band = width / Math.max(1, data.length);
  const bw = Math.min(24, band * 0.5);
  const h = height - padB - padT;
  const top = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  return (
    <div className="viz" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Daily ${unit}`}>
          <line x1={0} x2={width} y1={padT + h} y2={padT + h} className="viz-grid" />
          {data.map((d, i) => {
            const x = i * band + (band - bw) / 2;
            const ch = (d.value / max) * h;
            const y = padT + h - ch;
            const r = Math.min(4, ch, bw / 2);
            return (
              <g
                key={d.id}
                onMouseMove={(e) => setTip({ x: rel(ref, e).x + 12, y: rel(ref, e).y - 10, content: <><strong>{d.label}</strong><span>{d.value.toFixed(1)} {unit}</span></> })}
                onMouseLeave={() => setTip(null)}
              >
                <rect x={i * band} y={0} width={band} height={height} fill="transparent" />
                {ch > 0 && <path d={`M${x},${padT + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${padT + h}Z`} fill={color} />}
                {i === top && d.value > 0 && <text x={x + bw / 2} y={y - 5} textAnchor="middle" className="viz-value">{d.value.toFixed(1)}</text>}
                <text x={x + bw / 2} y={height - 6} textAnchor="middle" className="viz-tick">{d.label}</text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}
