import { useState } from "react";
import type { Task } from "../types";
import { useCurrentUser, useStore } from "../store/store";
import { DAY } from "../lib/sat";
import { formatDue, formatDuration, isAssignedTo, statusOf, timeSpent, typeLabel } from "../lib/tasks";
import { Icon } from "../components/Icon";
import { Empty, StatusPill, useNow } from "../components/ui";

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  return <span className="elapsed">{formatDuration(Math.max(60_000, now - since))} so far</span>;
}

function TaskItem({ task, now }: { task: Task; now: number }) {
  const { fields, teams, setTaskStatus, updateTask } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const status = statusOf(task, now);
  const field = fields.find((f) => f.id === task.fieldId);
  const crew = task.assignee?.kind === "team" ? teams.find((t) => t.id === task.assignee!.id)?.name : null;
  const spent = timeSpent(task);
  const sendNote = () => {
    if (!note.trim()) return;
    updateTask(task.id, {}, `Reported: ${note.trim()}`);
    setNote("");
  };

  return (
    <li className={`m-task status-${status}`}>
      <button className="m-task-head" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <div>
          <div className="eyebrow">{typeLabel(task.type)}{crew && ` · ${crew}`}</div>
          <strong>{task.title}</strong>
          <small>{field?.name ?? "No field"}{task.zone && ` · ${task.zone.label}`} · {status === "done" && task.doneAt ? `done ${formatDue(task.doneAt, now)}` : `due ${formatDue(task.due, now)}`}</small>
        </div>
        <StatusPill status={status} />
      </button>
      {task.status === "in_progress" && task.startedAt && <Elapsed since={task.startedAt} />}
      {expanded && (
        <div className="m-task-body">
          {task.instructions ? <p>{task.instructions}</p> : <p className="muted">No extra instructions.</p>}
          {task.resources.length > 0 && <div className="chips">{task.resources.map((r) => <span className="chip" key={r}>{r}</span>)}</div>}
          {spent !== null && <p className="muted small">Time spent: {formatDuration(spent)}</p>}
          {task.status !== "done" && (
            <div className="report">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Report back, e.g. 3 blocked emitters fixed" onKeyDown={(e) => e.key === "Enter" && sendNote()} />
              <button className="btn btn-sm" onClick={sendNote} disabled={!note.trim()}>Send</button>
            </div>
          )}
          {task.activity.filter((a) => a.text.startsWith("Reported:")).map((a, i) => (
            <p key={i} className="report-line"><Icon name="flag" size={13} />{a.text.slice(10)}<small>{new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></p>
          ))}
        </div>
      )}
      <div className="m-task-actions">
        {task.status === "pending" && <button className="btn btn-primary" onClick={() => setTaskStatus(task.id, "in_progress")}><Icon name="play" size={15} /> Start</button>}
        {task.status !== "done" && <button className="btn btn-good" onClick={() => setTaskStatus(task.id, "done")}><Icon name="check" size={15} /> Mark done</button>}
        {task.status === "done" && <button className="btn btn-sm" onClick={() => setTaskStatus(task.id, "pending")}>Undo</button>}
      </div>
    </li>
  );
}

export default function MyTasks() {
  const now = useNow(15_000);
  const me = useCurrentUser();
  const { tasks } = useStore();
  if (!me) return null;
  const mine = tasks.filter((t) => isAssignedTo(t, me));
  const endOfDay = new Date(now).setHours(23, 59, 59, 999);
  const sections: { title: string; items: Task[] }[] = [
    { title: "Overdue", items: mine.filter((t) => statusOf(t, now) === "delayed") },
    { title: "Today", items: mine.filter((t) => t.status !== "done" && t.due >= now && t.due <= endOfDay) },
    { title: "Coming up", items: mine.filter((t) => t.status !== "done" && t.due > endOfDay) },
    { title: "Done this week", items: mine.filter((t) => t.status === "done" && (t.doneAt ?? 0) > now - 7 * DAY).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)) },
  ];
  const open = mine.filter((t) => t.status !== "done").length;

  return (
    <div className="page phone-page">
      <div className="phone">
        <header className="phone-head">
          <small>Hi {me.name.split(" ")[0]}</small>
          <h1>{open ? `${open} task${open === 1 ? "" : "s"} to do` : "All caught up"}</h1>
          <p className="muted small">Tasks assigned to you and your crews. Tap a task for instructions.</p>
        </header>
        {mine.length === 0 && (
          <Empty icon="phone" title="Nothing assigned to you">
            Switch "Viewing as" to a field staff member, such as Ravi Kumar, to see the crew view.
          </Empty>
        )}
        {sections.map((s) =>
          s.items.length ? (
            <section key={s.title} className="m-section">
              <h2>{s.title} <span className="muted">{s.items.length}</span></h2>
              <ul>{[...s.items].sort((a, b) => (s.title.startsWith("Done") ? 0 : a.due - b.due)).map((t) => <TaskItem key={t.id} task={t} now={now} />)}</ul>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
