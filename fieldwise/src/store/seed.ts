import type { Field, LatLng, Member, Task, TaskType, Team } from "../types";
import { areaM2, circlePoints, perimeterM } from "../lib/geo";
import { DAY } from "../lib/sat";

const H = 3_600_000;

const offset = (c: LatLng, east: number, north: number): LatLng => ({
  lat: c.lat + north / 111320,
  lng: c.lng + east / (111320 * Math.cos((c.lat * Math.PI) / 180)),
});

const shape = (c: LatLng, corners: [number, number][]) => corners.map(([e, n]) => offset(c, e, n));

function field(id: string, name: string, crop: string, sownDaysAgo: number, boundary: LatLng[], now: number): Field {
  return {
    id,
    name,
    crop,
    sowingDate: new Date(now - sownDaysAgo * DAY).toISOString().slice(0, 10),
    boundary,
    areaHa: areaM2(boundary) / 10_000,
    perimeterM: perimeterM(boundary),
    plan: "enterprise",
    createdAt: now - 90 * DAY,
    readyAt: now - 89 * DAY,
    contact: { name: "Priya Nair", phone: "+91 98450 11223", email: "priya@greenvalley.example", company: "Green Valley Estates" },
  };
}

export function seed(now = Date.now()) {
  const teams: Team[] = [
    { id: "t-north", name: "North crew" },
    { id: "t-south", name: "South crew" },
    { id: "t-spray", name: "Spray team" },
    { id: "t-irr", name: "Irrigation team" },
    { id: "t-maint", name: "Maintenance" },
  ];

  const m = (id: string, name: string, role: Member["role"], teamIds: string[], contact: Partial<Member>): Member => ({
    id, name, role, teamIds, joinedAt: now - 200 * DAY, ...contact,
  });
  const members: Member[] = [
    m("m-priya", "Priya Nair", "owner", [], { email: "priya@greenvalley.example" }),
    m("m-arjun", "Arjun Mehta", "admin", [], { email: "arjun@greenvalley.example" }),
    m("m-meera", "Meera Iyer", "manager", [], { email: "meera@greenvalley.example" }),
    m("m-ravi", "Ravi Kumar", "staff", ["t-north", "t-spray"], { phone: "+91 98860 20111" }),
    m("m-sunil", "Sunil Patil", "staff", ["t-north"], { phone: "+91 98860 20112" }),
    m("m-kavya", "Kavya Rao", "staff", ["t-south", "t-irr"], { phone: "+91 98860 20113" }),
    m("m-imran", "Imran Shaikh", "staff", ["t-south"], { phone: "+91 98860 20114" }),
    m("m-lakshmi", "Lakshmi Devi", "staff", ["t-irr"], { phone: "+91 98860 20115" }),
    m("m-joseph", "Joseph Thomas", "staff", ["t-maint"], { email: "joseph@greenvalley.example" }),
    m("m-anita", "Anita Joshi", "staff", ["t-spray"], { phone: "+91 98860 20117" }),
  ];

  const c = { lat: 20.0112, lng: 73.7095 };
  const fields: Field[] = [
    field("f-vine-north", "North vineyard", "grapes", 160,
      shape(offset(c, -420, 260), [[-190, -150], [175, -170], [200, 140], [-160, 170], [-205, 20]]), now),
    field("f-south-block", "South block", "tomato", 48,
      shape(offset(c, 230, -240), [[-150, -120], [150, -105], [140, 120], [-140, 130]]), now),
    field("f-pivot", "Pivot 3", "maize", 62, circlePoints(offset(c, 520, 330), 190), now),
  ];

  let n = 0;
  const task = (
    title: string, type: TaskType, fieldId: string | null, assignee: Task["assignee"],
    dueH: number, state: { status: Task["status"]; startedH?: number; doneH?: number; by?: string },
    extra: Partial<Task> = {},
  ): Task => {
    const createdAt = now + (Math.min(dueH, state.doneH ?? dueH) - 30) * H;
    const activity = [{ at: createdAt, by: "m-meera", text: "Created the task" }];
    if (state.startedH !== undefined) activity.push({ at: now + state.startedH * H, by: state.by ?? "m-ravi", text: "Started work" });
    if (state.doneH !== undefined) activity.push({ at: now + state.doneH * H, by: state.by ?? "m-ravi", text: "Marked as done" });
    return {
      id: `task-${++n}`,
      title, type, fieldId, assignee,
      zone: null,
      instructions: "",
      resources: [],
      due: now + dueH * H,
      status: state.status,
      createdAt,
      createdBy: "m-meera",
      startedAt: state.startedH !== undefined ? now + state.startedH * H : undefined,
      doneAt: state.doneH !== undefined ? now + state.doneH * H : undefined,
      doneBy: state.doneH !== undefined ? state.by ?? "m-ravi" : undefined,
      source: "manual",
      activity,
      ...extra,
    };
  };
  const T = (id: string) => ({ kind: "team" as const, id });
  const M = (id: string) => ({ kind: "member" as const, id });

  const tasks: Task[] = [
    // Last few weeks, mostly done.
    task("Prune canes on rows 1–20", "maintenance", "f-vine-north", T("t-north"), -20 * 24, { status: "done", startedH: -21 * 24, doneH: -20.5 * 24, by: "m-sunil" }),
    task("Install drip lines, south block", "irrigation", "f-south-block", T("t-irr"), -18 * 24, { status: "done", startedH: -19 * 24, doneH: -17.6 * 24, by: "m-kavya" }),
    task("Transplant seedlings, beds 4–9", "planting", "f-south-block", T("t-south"), -16 * 24, { status: "done", startedH: -16.4 * 24, doneH: -16.1 * 24, by: "m-imran" }),
    task("Pre-emergence herbicide, pivot 3", "spraying", "f-pivot", T("t-spray"), -14 * 24, { status: "done", startedH: -14.3 * 24, doneH: -14.15 * 24, by: "m-anita" }),
    task("Service the sprayer pump", "maintenance", null, M("m-joseph"), -12 * 24, { status: "done", startedH: -12.2 * 24, doneH: -12.1 * 24, by: "m-joseph" }),
    task("Scout downy mildew, east rows", "scouting", "f-vine-north", M("m-ravi"), -10 * 24, { status: "done", startedH: -9.6 * 24, doneH: -9.4 * 24, by: "m-ravi" }),
    task("Fungicide on the east rows", "spraying", "f-vine-north", T("t-spray"), -9 * 24, { status: "done", startedH: -8.6 * 24, doneH: -8.4 * 24, by: "m-anita" }),
    task("Flush filters at pump house", "irrigation", null, M("m-lakshmi"), -8 * 24, { status: "done", startedH: -8.2 * 24, doneH: -8.1 * 24, by: "m-lakshmi" }),
    task("Side-dress urea, pivot 3", "fertilizing", "f-pivot", T("t-north"), -7 * 24, { status: "done", startedH: -6.3 * 24, doneH: -6.1 * 24, by: "m-sunil" }),
    task("Stake tomato plants, beds 1–3", "planting", "f-south-block", T("t-south"), -6 * 24, { status: "done", startedH: -6.4 * 24, doneH: -6.2 * 24, by: "m-imran" }),
    task("Tractor 2 oil change", "maintenance", null, M("m-joseph"), -5 * 24, { status: "done", startedH: -4.2 * 24, doneH: -4.1 * 24, by: "m-joseph" }),
    task("Scout fall armyworm, pivot 3", "scouting", "f-pivot", M("m-sunil"), -4 * 24, { status: "done", startedH: -4.3 * 24, doneH: -4.2 * 24, by: "m-sunil" }),
    task("Check pivot nozzles, spans 3–5", "irrigation", "f-pivot", T("t-irr"), -3 * 24, { status: "done", startedH: -3.2 * 24, doneH: -3.05 * 24, by: "m-kavya" }),
    task("Leaf sampling for lab, vineyard", "scouting", "f-vine-north", M("m-ravi"), -2 * 24, { status: "done", startedH: -2.3 * 24, doneH: -2.2 * 24, by: "m-ravi" }),
    // Overdue and still open -> Delayed.
    task("Repair fence along the canal", "maintenance", null, T("t-maint"), -2 * 24, { status: "pending" }),
    task("Check drip lines after low water reading", "irrigation", "f-south-block", T("t-irr"), -20, { status: "in_progress", startedH: -26, by: "m-kavya" }),
    task("Weed the headlands, north vineyard", "maintenance", "f-vine-north", T("t-north"), -30, { status: "pending" }),
    // Upcoming.
    task("Apply fungicide on the east rows", "spraying", "f-vine-north", T("t-spray"), 6, { status: "in_progress", startedH: -1, by: "m-anita" },
      { instructions: "Mix 2.5 ml/L. Spray rows 30–44 only, before 10 AM while the wind is low.", resources: ["Sprayer 1", "Fungicide, 20 L", "PPE kit"] }),
    task("Scout stressed patch flagged by satellite", "scouting", "f-pivot", T("t-north"), 20, { status: "pending" }, { source: "satellite" }),
    task("Service the sprayer pump", "maintenance", null, T("t-maint"), 30, { status: "pending" }),
    task("Plant replacement seedlings, bed 9", "planting", "f-south-block", T("t-south"), 54, { status: "pending" }, { resources: ["Seedling trays, 6"] }),
    task("Harvest readiness check, block 7", "harvest", "f-vine-north", M("m-ravi"), 78, { status: "pending" }),
    task("Calibrate the fertigation pump", "irrigation", null, M("m-lakshmi"), 100, { status: "pending" }),
    task("Grease pivot wheel hubs", "maintenance", "f-pivot", M("m-joseph"), 130, { status: "pending" }),
  ];

  return { teams, members, fields, tasks };
}
