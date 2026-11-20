import { useState } from "react";
import { useCurrentUser, useStore } from "../store/store";
import { can } from "../lib/permissions";
import { assigneeName, formatDue, formatDuration, isAssignedTo, statusOf, timeSpent, typeLabel } from "../lib/tasks";
import { Icon } from "./Icon";
import { Avatar, StatusPill, useNow } from "./ui";
import { TaskEditor } from "./TaskEditor";

/** Side drawer with a task's details, status actions and activity log. */
export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const now = useNow(15_000);
  const me = useCurrentUser();
  const { tasks, fields, members, teams, setTaskStatus, removeTask } = useStore();
  const [editing, setEditing] = useState(false);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const status = statusOf(task, now);
  const field = fields.find((f) => f.id === task.fieldId);
  const manage = can(me, "tasks.manage");
  const mine = !!me && isAssignedTo(task, me);
  const canWork = manage || mine;
  const spent = timeSpent(task);
  const who = (id?: string) => members.find((m) => m.id === id)?.name ?? "Someone";

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" aria-label="Task details">
        <header className="drawer-head">
          <div>
            <div className="eyebrow">{typeLabel(task.type)}{task.source === "satellite" && " · from satellite"}</div>
            <h2>{task.title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </header>
        <div className="drawer-body">
          <div className="detail-status">
            <StatusPill status={status} />
            {status === "delayed" && <span className="text-critical small">Was due {formatDue(task.due, now)}</span>}
          </div>
          <dl className="facts">
            <dt>Field</dt><dd>{field?.name ?? "No field"}{task.zone && ` · ${task.zone.label}`}</dd>
            <dt>Assigned to</dt><dd>{assigneeName(task, members, teams)}</dd>
            <dt>Due</dt><dd>{formatDue(task.due, now)}</dd>
            {task.startedAt && <><dt>Started</dt><dd>{new Date(task.startedAt).toLocaleString()}</dd></>}
            {task.doneAt && <><dt>Done</dt><dd>{new Date(task.doneAt).toLocaleString()} by {who(task.doneBy)}</dd></>}
            {spent !== null && <><dt>Time spent</dt><dd>{formatDuration(spent)}</dd></>}
          </dl>
          {task.instructions && <><h3>Instructions</h3><p className="instructions">{task.instructions}</p></>}
          {task.resources.length > 0 && (
            <><h3>Resources</h3><div className="chips">{task.resources.map((r) => <span className="chip" key={r}>{r}</span>)}</div></>
          )}
          <h3>Activity</h3>
          <ol className="activity">
            {[...task.activity].reverse().map((a, i) => (
              <li key={i}>
                <Avatar member={members.find((m) => m.id === a.by)} size={24} />
                <div><strong>{who(a.by)}</strong> {a.text.charAt(0).toLowerCase() + a.text.slice(1)}<small>{new Date(a.at).toLocaleString()}</small></div>
              </li>
            ))}
          </ol>
        </div>
        <footer className="drawer-foot">
          {canWork && task.status === "pending" && (
            <button className="btn btn-primary" onClick={() => setTaskStatus(task.id, "in_progress")}><Icon name="play" size={15} /> Start</button>
          )}
          {canWork && task.status !== "done" && (
            <button className="btn btn-good" onClick={() => setTaskStatus(task.id, "done")}><Icon name="check" size={15} /> Mark done</button>
          )}
          {canWork && task.status === "done" && <button className="btn" onClick={() => setTaskStatus(task.id, "pending")}>Reopen</button>}
          <span className="grow" />
          {manage && <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Edit</button>}
          {manage && (
            <button className="btn btn-danger-ghost" onClick={() => confirm("Delete this task?") && (removeTask(task.id), onClose())} aria-label="Delete task">
              <Icon name="trash" size={15} />
            </button>
          )}
        </footer>
      </aside>
      {editing && <TaskEditor draft={task} onClose={() => setEditing(false)} />}
    </>
  );
}
