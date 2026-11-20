import { useState } from "react";
import type { Task, TaskStatus } from "../types";
import { useStore } from "../store/store";
import { alertsFor, DAY } from "../lib/sat";
import { assigneeName, formatDue, formatDuration, STATUS_META, statusOf, TASK_TYPES, timeSpent, typeLabel } from "../lib/tasks";
import { Icon } from "../components/Icon";
import { Empty, StatTile, StatusPill, useNow } from "../components/ui";
import { TaskEditor, type TaskDraft } from "../components/TaskEditor";
import { TaskDetail } from "../components/TaskDetail";

const COLUMNS: TaskStatus[] = ["pending", "in_progress", "delayed", "done"];
type StatusFilter = TaskStatus | "all" | "open";

export default function Tasks() {
  const now = useNow(15_000);
  const { tasks, fields, members, teams, dismissedAlerts, setTaskStatus } = useStore();
  const [view, setView] = useState<"board" | "table">("board");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [assignee, setAssignee] = useState("");
  const [fieldId, setFieldId] = useState("");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const startOfDay = new Date(now).setHours(0, 0, 0, 0);
  const st = (t: Task) => statusOf(t, now);
  const openTasks = tasks.filter((t) => t.status !== "done");
  const dueToday = openTasks.filter((t) => t.due >= startOfDay && t.due < startOfDay + DAY).length;
  const delayed = tasks.filter((t) => st(t) === "delayed").length;
  const weekDone = tasks.filter((t) => t.doneAt && t.doneAt > now - 7 * DAY).length;
  const weekDue = tasks.filter((t) => t.due > now - 7 * DAY && t.due <= now).length;

  const converted = new Set(tasks.map((t) => t.alertId).filter(Boolean));
  const suggestions = fields.flatMap((f) => alertsFor(f, now)).filter((a) => !dismissedAlerts.includes(a.id) && !converted.has(a.id));

  const filtered = tasks.filter((t) => {
    const s = st(t);
    if (status === "open" ? s === "done" : status !== "all" && s !== status) return false;
    if (assignee && `${t.assignee?.kind}:${t.assignee?.id}` !== assignee && !(assignee === "none" && !t.assignee)) return false;
    if (fieldId && (fieldId === "none" ? t.fieldId : t.fieldId !== fieldId)) return false;
    if (type && t.type !== type) return false;
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const byDue = (a: Task, b: Task) => a.due - b.due;
  const fieldName = (t: Task) => fields.find((f) => f.id === t.fieldId)?.name ?? "No field";

  const card = (t: Task) => {
    const s = st(t);
    return (
      <li key={t.id} className={`task-card status-${s}`}>
        <button className="task-card-main" onClick={() => setOpen(t.id)}>
          <div className="eyebrow">{typeLabel(t.type)}{t.source === "satellite" && <> · <Icon name="satellite" size={11} /></>}</div>
          <strong>{t.title}</strong>
          <small>{fieldName(t)}{t.zone && ` · ${t.zone.label}`}</small>
          <div className="task-card-meta">
            <span><Icon name="users" size={13} />{assigneeName(t, members, teams)}</span>
            <span className={s === "delayed" ? "text-critical" : ""}><Icon name="calendar" size={13} />{s === "done" && t.doneAt ? `Done ${formatDue(t.doneAt, now)}` : formatDue(t.due, now)}</span>
          </div>
        </button>
        {s !== "done" && (
          <button className="icon-btn sm check-btn" title="Mark done" aria-label={`Mark ${t.title} done`} onClick={() => setTaskStatus(t.id, "done")}>
            <Icon name="check" size={15} />
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Tasks</h1>
          <p className="muted">Assign field work, follow it from pending to done, and see what's slipping.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setDraft({})}><Icon name="plus" /> New task</button>
      </header>

      <div className="stats">
        <StatTile label="Open tasks" value={String(openTasks.length)} sub={`${openTasks.filter((t) => !t.assignee).length} unassigned`} />
        <StatTile label="Due today" value={String(dueToday)} />
        <StatTile label="Delayed" value={String(delayed)} sub={delayed ? "Past their deadline" : "Nothing overdue"} tone={delayed ? "critical" : "good"} />
        <StatTile label="Done in the last 7 days" value={String(weekDone)} sub={weekDue ? `${weekDue} were due in that time` : undefined} />
      </div>

      {suggestions.length > 0 && (
        <section className="card suggestions">
          <div className="card-head">
            <h3><Icon name="satellite" size={16} /> Suggested from the latest images</h3>
            <span className="muted small">{suggestions.length} zone{suggestions.length === 1 ? "" : "s"} need someone on the ground</span>
          </div>
          <ul>
            {suggestions.map((a) => (
              <li key={a.id}>
                <span className={`pill ${a.level === "urgent" ? "pill-critical" : "pill-warning"} pill-xs`}><Icon name="alert" size={11} />{a.level === "urgent" ? "Act now" : "Watch"}</span>
                <div><strong>{a.suggestion.title}</strong><small>{fields.find((f) => f.id === a.fieldId)?.name} · {a.title}</small></div>
                <button
                  className="btn btn-sm"
                  onClick={() => setDraft({
                    title: a.suggestion.title, type: a.suggestion.type, fieldId: a.fieldId,
                    zone: { label: a.zone.label, ...a.zone.position }, instructions: a.suggestion.instructions,
                    resources: a.suggestion.resources, due: now + a.suggestion.dueInHours * 3_600_000, source: "satellite", alertId: a.id,
                  })}
                >
                  <Icon name="plus" size={14} /> Create task
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="filters">
        <div className="seg" role="group" aria-label="Status">
          {(["all", "open", ...COLUMNS] as StatusFilter[]).map((s) => (
            <button key={s} className={status === s ? "active" : ""} onClick={() => setStatus(s)}>
              {s === "all" ? "All" : s === "open" ? "Open" : STATUS_META[s].label}
            </button>
          ))}
        </div>
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee">
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          <optgroup label="Crews">{teams.map((t) => <option key={t.id} value={`team:${t.id}`}>{t.name}</option>)}</optgroup>
          <optgroup label="People">{members.map((m) => <option key={m.id} value={`member:${m.id}`}>{m.name}</option>)}</optgroup>
        </select>
        <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} aria-label="Field">
          <option value="">All fields</option>
          <option value="none">No field</option>
          {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className="search sm"><Icon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" /></label>
        <span className="grow" />
        <div className="seg" role="group" aria-label="View">
          <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}><Icon name="board" size={15} /> Board</button>
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}><Icon name="table" size={15} /> Table</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty icon="tasks" title="No tasks match these filters" />
      ) : view === "board" ? (
        <div className="board">
          {COLUMNS.filter((c) => status === "all" || status === c || (status === "open" && c !== "done")).map((c) => {
            const items = filtered.filter((t) => st(t) === c).sort(c === "done" ? (a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0) : byDue);
            return (
              <section key={c} className={`column column-${c}`}>
                <header><StatusPill status={c} /><span className="muted">{items.length}</span></header>
                <ul>{items.map(card)}</ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Task</th><th>Field</th><th>Assigned to</th><th>Due</th><th>Status</th><th className="num">Time spent</th></tr>
            </thead>
            <tbody>
              {[...filtered].sort(byDue).map((t) => {
                const spent = timeSpent(t);
                return (
                  <tr key={t.id} onClick={() => setOpen(t.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(t.id)}>
                    <td><strong>{t.title}</strong><small>{typeLabel(t.type)}</small></td>
                    <td>{fieldName(t)}{t.zone && <small>{t.zone.label}</small>}</td>
                    <td>{assigneeName(t, members, teams)}</td>
                    <td>{formatDue(t.due, now)}</td>
                    <td><StatusPill status={st(t)} /></td>
                    <td className="num">{spent === null ? "–" : formatDuration(spent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft && <TaskEditor draft={draft} onClose={() => setDraft(null)} />}
      {open && <TaskDetail taskId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
