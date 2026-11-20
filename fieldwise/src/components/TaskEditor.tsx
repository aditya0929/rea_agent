import { useState } from "react";
import type { Assignee, Task, TaskType } from "../types";
import { useStore } from "../store/store";
import { TASK_TYPES } from "../lib/tasks";
import { Modal } from "./ui";
import { Icon } from "./Icon";

export type TaskDraft = Partial<Omit<Task, "id">> & { id?: string };

const toLocalInput = (ms: number) => {
  const d = new Date(ms);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const encode = (a: Assignee) => (a ? `${a.kind}:${a.id}` : "");
const decode = (s: string): Assignee => {
  if (!s) return null;
  const [kind, id] = s.split(":");
  return { kind: kind as "member" | "team", id };
};

export function TaskEditor({ draft, onClose, onSaved }: { draft: TaskDraft; onClose: () => void; onSaved?: (t: Task) => void }) {
  const { fields, members, teams, addTask, updateTask, tasks } = useStore();
  const editing = draft.id ? tasks.find((t) => t.id === draft.id) : undefined;
  const [title, setTitle] = useState(draft.title ?? "");
  const [type, setType] = useState<TaskType>(draft.type ?? "scouting");
  const [fieldId, setFieldId] = useState(draft.fieldId ?? "");
  const [assignee, setAssignee] = useState(encode(draft.assignee ?? null));
  const [due, setDue] = useState(toLocalInput(draft.due ?? Date.now() + 24 * 3_600_000));
  const [instructions, setInstructions] = useState(draft.instructions ?? "");
  const [resources, setResources] = useState<string[]>(draft.resources ?? []);
  const [resource, setResource] = useState("");
  const [touched, setTouched] = useState(false);

  const staff = members.filter((m) => m.role === "staff" || m.role === "manager");
  const valid = title.trim().length > 1 && !!due;

  const addResource = () => {
    const r = resource.trim();
    if (r && !resources.includes(r)) setResources([...resources, r]);
    setResource("");
  };

  const save = () => {
    setTouched(true);
    if (!valid) return;
    const data = {
      title: title.trim(),
      type,
      fieldId: fieldId || null,
      assignee: decode(assignee),
      due: new Date(due).getTime(),
      instructions: instructions.trim(),
      resources,
      zone: draft.zone ?? null,
      source: draft.source ?? "manual",
      alertId: draft.alertId,
    };
    if (editing) {
      const reassigned = encode(editing.assignee) !== assignee;
      updateTask(editing.id, data, reassigned ? "Reassigned the task" : "Edited the task");
      onSaved?.({ ...editing, ...data });
    } else {
      // Not `onSaved?.(addTask(data))`: optional chaining would skip the call entirely.
      const created = addTask(data);
      onSaved?.(created);
    }
    onClose();
  };

  return (
    <Modal
      title={editing ? "Edit task" : "New task"}
      eyebrow={draft.source === "satellite" ? "From satellite alert" : "Assign field work"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{editing ? "Save changes" : "Assign task"}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="span-2">
          <span>Task *</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scout the stressed patch in block 7" />
          {touched && title.trim().length < 2 && <small className="text-critical">Give the task a title.</small>}
        </label>
        <label>
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as TaskType)}>
            {TASK_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label>
          <span>Field</span>
          <select value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
            <option value="">No field (workshop, office…)</option>
            {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label>
          <span>Assign to</span>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            <optgroup label="Crews">
              {teams.map((t) => <option key={t.id} value={`team:${t.id}`}>{t.name}</option>)}
            </optgroup>
            <optgroup label="People">
              {staff.map((m) => <option key={m.id} value={`member:${m.id}`}>{m.name}</option>)}
            </optgroup>
          </select>
        </label>
        <label>
          <span>Due *</span>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        {draft.zone && (
          <div className="span-2 zone-note">
            <Icon name="target" size={16} /> Pinned to <strong>{draft.zone.label}</strong> on the map
          </div>
        )}
        <label className="span-2">
          <span>Instructions</span>
          <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="What should the crew do, and what should they report back?" />
        </label>
        <div className="span-2">
          <span className="label">Resources needed</span>
          <div className="chips">
            {resources.map((r) => (
              <span className="chip" key={r}>
                {r}
                <button aria-label={`Remove ${r}`} onClick={() => setResources(resources.filter((x) => x !== r))}><Icon name="x" size={12} /></button>
              </span>
            ))}
            <input
              className="chip-input"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addResource())}
              onBlur={addResource}
              placeholder={resources.length ? "Add another" : "e.g. Sprayer 1, then Enter"}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
