// App state, persisted to localStorage. This plays the role of the backend for now.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Field, Member, StoredStatus, Task, Team } from "../types";
import { seed } from "./seed";

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Simulated processing time before a new field's first maps arrive. */
export const PROCESSING_MS = 25_000;

interface State {
  orgName: string;
  currentUserId: string;
  members: Member[];
  teams: Team[];
  fields: Field[];
  tasks: Task[];
  dismissedAlerts: string[];
  selectedFieldId: string | null;

  setCurrentUser: (id: string) => void;
  selectField: (id: string | null) => void;
  resetDemo: () => void;

  addField: (f: Omit<Field, "id" | "createdAt" | "readyAt">) => Field;
  removeField: (id: string) => void;

  addTask: (t: Omit<Task, "id" | "createdAt" | "createdBy" | "activity" | "status"> & { status?: StoredStatus }) => Task;
  updateTask: (id: string, patch: Partial<Task>, note?: string) => void;
  setTaskStatus: (id: string, status: StoredStatus) => void;
  removeTask: (id: string) => void;
  dismissAlert: (id: string) => void;

  addMember: (m: Omit<Member, "id" | "joinedAt">) => void;
  updateMember: (id: string, patch: Partial<Member>) => void;
  removeMember: (id: string) => void;

  addTeam: (name: string) => void;
  renameTeam: (id: string, name: string) => void;
  removeTeam: (id: string) => void;
}

const fresh = () => {
  const s = seed();
  return { ...s, orgName: "Green Valley Estates", currentUserId: "m-meera", dismissedAlerts: [], selectedFieldId: s.fields[0].id };
};

export const useStore = create<State>()(
  persist(
    (set, get) => {
      const log = (t: Task, text: string): Task => ({
        ...t,
        activity: [...t.activity, { at: Date.now(), by: get().currentUserId, text }],
      });
      return {
        ...fresh(),

        setCurrentUser: (id) => set({ currentUserId: id }),
        selectField: (id) => set({ selectedFieldId: id }),
        resetDemo: () => set(fresh()),

        addField: (f) => {
          const now = Date.now();
          const field: Field = { ...f, id: uid("f"), createdAt: now, readyAt: now + PROCESSING_MS };
          set((s) => ({ fields: [...s.fields, field], selectedFieldId: field.id }));
          return field;
        },
        removeField: (id) =>
          set((s) => ({
            fields: s.fields.filter((f) => f.id !== id),
            tasks: s.tasks.map((t) => (t.fieldId === id ? { ...t, fieldId: null } : t)),
            selectedFieldId: s.selectedFieldId === id ? s.fields.find((f) => f.id !== id)?.id ?? null : s.selectedFieldId,
          })),

        addTask: (t) => {
          const now = Date.now();
          const task: Task = {
            ...t,
            status: t.status ?? "pending",
            id: uid("task"),
            createdAt: now,
            createdBy: get().currentUserId,
            activity: [{ at: now, by: get().currentUserId, text: t.source === "satellite" ? "Created from a satellite alert" : "Created the task" }],
          };
          set((s) => ({ tasks: [task, ...s.tasks] }));
          return task;
        },
        updateTask: (id, patch, note) =>
          set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? log({ ...t, ...patch }, note ?? "Edited the task") : t)) })),
        setTaskStatus: (id, status) =>
          set((s) => ({
            tasks: s.tasks.map((t) => {
              if (t.id !== id || t.status === status) return t;
              const now = Date.now();
              if (status === "in_progress") return log({ ...t, status, startedAt: now, doneAt: undefined, doneBy: undefined }, "Started work");
              if (status === "done")
                return log({ ...t, status, startedAt: t.startedAt ?? now, doneAt: now, doneBy: get().currentUserId }, "Marked as done");
              return log({ ...t, status, startedAt: undefined, doneAt: undefined, doneBy: undefined }, "Reopened the task");
            }),
          })),
        removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
        dismissAlert: (id) => set((s) => ({ dismissedAlerts: [...s.dismissedAlerts, id] })),

        addMember: (m) => set((s) => ({ members: [...s.members, { ...m, id: uid("m"), joinedAt: Date.now() }] })),
        updateMember: (id, patch) => set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
        removeMember: (id) =>
          set((s) => ({
            members: s.members.filter((m) => m.id !== id),
            // Open work goes back to the unassigned queue; history stays attributed.
            tasks: s.tasks.map((t) =>
              t.assignee?.kind === "member" && t.assignee.id === id && t.status !== "done" ? { ...t, assignee: null } : t,
            ),
          })),

        addTeam: (name) => set((s) => ({ teams: [...s.teams, { id: uid("t"), name }] })),
        renameTeam: (id, name) => set((s) => ({ teams: s.teams.map((t) => (t.id === id ? { ...t, name } : t)) })),
        removeTeam: (id) =>
          set((s) => ({
            teams: s.teams.filter((t) => t.id !== id),
            members: s.members.map((m) => ({ ...m, teamIds: m.teamIds.filter((x) => x !== id) })),
            tasks: s.tasks.map((t) =>
              t.assignee?.kind === "team" && t.assignee.id === id && t.status !== "done" ? { ...t, assignee: null } : t,
            ),
          })),
      };
    },
    { name: "fieldwise-state", version: 1 },
  ),
);

export const useCurrentUser = () => useStore((s) => s.members.find((m) => m.id === s.currentUserId));

// Persist the seed on first run so demo timestamps stay stable across reloads.
if (!localStorage.getItem("fieldwise-state")) useStore.setState({});

// Dev-only handle for scripted UI checks.
if (import.meta.env.DEV) (window as unknown as { __store: typeof useStore }).__store = useStore;
