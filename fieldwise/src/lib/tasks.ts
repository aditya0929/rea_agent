import type { Member, Task, TaskStatus, TaskType, Team } from "../types";
import { DAY } from "./sat";

export const TASK_TYPES: { id: TaskType; label: string }[] = [
  { id: "scouting", label: "Scouting" },
  { id: "spraying", label: "Spraying" },
  { id: "irrigation", label: "Irrigation" },
  { id: "fertilizing", label: "Fertilizing" },
  { id: "planting", label: "Planting" },
  { id: "maintenance", label: "Equipment upkeep" },
  { id: "harvest", label: "Harvest" },
];
export const typeLabel = (t: TaskType) => TASK_TYPES.find((x) => x.id === t)?.label ?? t;

export const STATUS_META: Record<TaskStatus, { label: string; tone: "good" | "info" | "critical" | "neutral" }> = {
  pending: { label: "Pending", tone: "neutral" },
  in_progress: { label: "In progress", tone: "info" },
  delayed: { label: "Delayed", tone: "critical" },
  done: { label: "Done", tone: "good" },
};

/** A task that isn't done by its deadline is delayed, whether or not it was started. */
export function statusOf(task: Task, now: number): TaskStatus {
  if (task.status === "done") return "done";
  return task.due < now ? "delayed" : task.status;
}

export function isAssignedTo(task: Task, member: Member) {
  if (!task.assignee) return false;
  return task.assignee.kind === "member" ? task.assignee.id === member.id : member.teamIds.includes(task.assignee.id);
}

export function assigneeName(task: Task, members: Member[], teams: Team[]) {
  if (!task.assignee) return "Unassigned";
  const list = task.assignee.kind === "member" ? members : teams;
  return list.find((x) => x.id === task.assignee!.id)?.name ?? "Removed";
}

export const timeSpent = (t: Task) => (t.doneAt && t.startedAt ? t.doneAt - t.startedAt : null);

export function formatDuration(ms: number) {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

export function formatDue(due: number, now: number) {
  const d = new Date(due);
  const days = Math.floor(due / DAY) - Math.floor(now / DAY);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { weekday: days > -7 && days < 7 ? "short" : undefined, day: "numeric", month: "short" });
}

export interface Kpi {
  id: string;
  name: string;
  /** Tasks due inside the period. */
  due: number;
  done: number;
  onTime: number;
  delayedOpen: number;
  pending: number;
  medianTimeMs: number | null;
  completionRate: number | null;
  onTimeRate: number | null;
}

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function kpiFor(id: string, name: string, tasks: Task[], now: number): Kpi {
  const done = tasks.filter((t) => t.status === "done");
  const onTime = done.filter((t) => (t.doneAt ?? 0) <= t.due);
  const delayedOpen = tasks.filter((t) => statusOf(t, now) === "delayed").length;
  const times = done.map(timeSpent).filter((x): x is number => x !== null);
  return {
    id,
    name,
    due: tasks.length,
    done: done.length,
    onTime: onTime.length,
    delayedOpen,
    pending: tasks.length - done.length - delayedOpen,
    medianTimeMs: median(times),
    completionRate: tasks.length ? done.length / tasks.length : null,
    onTimeRate: done.length ? onTime.length / done.length : null,
  };
}

/** Tasks whose due date falls in [from, to], plus anything still open from before. */
export function tasksInPeriod(tasks: Task[], from: number, to: number) {
  return tasks.filter((t) => (t.due >= from && t.due <= to) || (t.due < from && t.status !== "done"));
}
