import { useState } from "react";
import type { Task } from "../types";
import { useStore } from "../store/store";
import { DAY } from "../lib/sat";
import { formatDuration, kpiFor, tasksInPeriod, type Kpi } from "../lib/tasks";
import { PercentBars, StackedBars } from "../components/charts";
import { Icon } from "../components/Icon";
import { pct, StatTile, useNow } from "../components/ui";

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
];

const SERIES = [
  { key: "done", label: "Done", color: "var(--good)" },
  { key: "pending", label: "Open", color: "var(--series-1)" },
  { key: "delayed", label: "Delayed", color: "var(--critical)" },
];

function KpiTable({ rows, who }: { rows: Kpi[]; who: string }) {
  return (
    <div className="table-wrap">
      <table className="table compact">
        <thead>
          <tr><th>{who}</th><th className="num">Tasks</th><th className="num">Done</th><th className="num">Delayed</th><th className="num">Completion</th><th className="num">On time</th><th className="num">Median time</th></tr>
        </thead>
        <tbody>
          {rows.map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td><td className="num">{k.due}</td><td className="num">{k.done}</td><td className="num">{k.delayedOpen}</td>
              <td className="num">{pct(k.completionRate)}</td><td className="num">{pct(k.onTimeRate)}</td>
              <td className="num">{k.medianTimeMs === null ? "–" : formatDuration(k.medianTimeMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Performance() {
  const now = useNow(60_000);
  const { tasks, members, teams } = useStore();
  const [days, setDays] = useState(30);
  const [asTable, setAsTable] = useState(false);
  const period = tasksInPeriod(tasks, now - days * DAY, now);

  const overall = kpiFor("all", "Everyone", period, now);
  const staff = members.filter((m) => m.role === "staff");
  const teamTasks = (teamId: string) => {
    const ids = new Set(members.filter((m) => m.teamIds.includes(teamId)).map((m) => m.id));
    return period.filter((t) => (t.assignee?.kind === "team" && t.assignee.id === teamId) || (t.assignee?.kind === "member" && ids.has(t.assignee.id)));
  };
  // A person owns their direct tasks plus crew tasks they personally completed.
  const personTasks = (id: string) =>
    period.filter((t: Task) => (t.assignee?.kind === "member" && t.assignee.id === id) || (t.assignee?.kind === "team" && t.doneBy === id));

  const teamKpis = teams.map((t) => kpiFor(t.id, t.name, teamTasks(t.id), now)).sort((a, b) => (b.completionRate ?? -1) - (a.completionRate ?? -1));
  const personKpis = staff.map((m) => kpiFor(m.id, m.name, personTasks(m.id), now)).filter((k) => k.due > 0).sort((a, b) => b.due - a.due);
  const unassigned = period.filter((t) => !t.assignee && t.status !== "done").length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Team performance</h1>
          <p className="muted">Completion, punctuality and time spent for tasks due in the period, plus anything still open from before.</p>
        </div>
        <div className="seg" role="group" aria-label="Period">
          {PERIODS.map((p) => <button key={p.days} className={days === p.days ? "active" : ""} onClick={() => setDays(p.days)}>{p.label}</button>)}
        </div>
      </header>

      <div className="stats">
        <StatTile label="Completion rate" value={pct(overall.completionRate)} sub={`${overall.done} of ${overall.due} tasks done`} />
        <StatTile label="Done on time" value={pct(overall.onTimeRate)} sub={`${overall.onTime} finished before the deadline`} />
        <StatTile label="Delayed and still open" value={String(overall.delayedOpen)} tone={overall.delayedOpen ? "critical" : "good"} sub={overall.delayedOpen ? "Follow up with the crews below" : "Nothing overdue"} />
        <StatTile label="Median time on a task" value={overall.medianTimeMs === null ? "–" : formatDuration(overall.medianTimeMs)} sub={unassigned ? `${unassigned} open tasks unassigned` : "From start to done"} />
      </div>

      <div className="row end">
        <button className="btn btn-sm" onClick={() => setAsTable(!asTable)}>
          <Icon name={asTable ? "chart" : "table"} size={14} /> {asTable ? "Show charts" : "Show as table"}
        </button>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Completion rate by crew</h3><span className="muted small">Done ÷ tasks in period</span></div>
          {asTable ? <KpiTable rows={teamKpis} who="Crew" /> : (
            <PercentBars data={teamKpis.map((k) => ({ id: k.id, label: k.name, value: k.completionRate, detail: `${k.done} of ${k.due} done · ${k.delayedOpen} delayed · on time ${pct(k.onTimeRate)}` }))} />
          )}
        </section>
        <section className="card">
          <div className="card-head"><h3>Task status by person</h3><span className="muted small">Direct tasks, plus crew tasks they finished</span></div>
          {asTable ? <KpiTable rows={personKpis} who="Person" /> : (
            <StackedBars
              series={SERIES}
              rows={personKpis.map((k) => ({ id: k.id, label: k.name, values: { done: k.done, pending: k.pending, delayed: k.delayedOpen } }))}
            />
          )}
        </section>
      </div>
    </div>
  );
}
