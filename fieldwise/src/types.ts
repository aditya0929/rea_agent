export type LatLng = { lat: number; lng: number };

export type Role = "owner" | "admin" | "manager" | "staff";

export interface Member {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: Role;
  teamIds: string[];
  joinedAt: number;
}

export interface Team {
  id: string;
  name: string;
}

export type PlanId = "basic" | "pro" | "enterprise";

export interface Field {
  id: string;
  name: string;
  crop: string;
  /** ISO date (yyyy-mm-dd). */
  sowingDate: string;
  boundary: LatLng[];
  areaHa: number;
  perimeterM: number;
  plan: PlanId;
  createdAt: number;
  /** First satellite results become available at this time. */
  readyAt: number;
  contact: { name: string; phone: string; email: string; company?: string };
}

export type TaskType = "scouting" | "spraying" | "irrigation" | "fertilizing" | "planting" | "maintenance" | "harvest";

/** Stored status. "delayed" is derived from the due date, never stored. */
export type StoredStatus = "pending" | "in_progress" | "done";
export type TaskStatus = StoredStatus | "delayed";

export type Assignee = { kind: "member" | "team"; id: string } | null;

export interface TaskActivity {
  at: number;
  by: string;
  text: string;
}

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  fieldId: string | null;
  zone: { label: string; lat: number; lng: number } | null;
  assignee: Assignee;
  instructions: string;
  resources: string[];
  due: number;
  status: StoredStatus;
  createdAt: number;
  createdBy: string;
  startedAt?: number;
  doneAt?: number;
  doneBy?: string;
  source: "manual" | "satellite";
  /** Alert this task was created from, so the alert stops being suggested. */
  alertId?: string;
  activity: TaskActivity[];
}
