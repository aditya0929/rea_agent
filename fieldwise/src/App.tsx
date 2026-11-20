import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useCurrentUser, useStore } from "./store/store";
import { can, ROLE_META, type Action } from "./lib/permissions";
import { alertsFor } from "./lib/sat";
import { cropById } from "./lib/crops";
import { centroid, formatArea } from "./lib/geo";
import { isAssignedTo, statusOf } from "./lib/tasks";
import { Icon } from "./components/Icon";
import { Avatar, Empty, useNow } from "./components/ui";
import { FxProvider, useFx } from "./fx/Fx";
import Analysis from "./pages/Analysis";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Weather from "./pages/Weather";
import Wizard from "./pages/wizard/Wizard";
import Tasks from "./pages/Tasks";
import MyTasks from "./pages/MyTasks";
import Performance from "./pages/Performance";
import TeamPage from "./pages/Team";

function Guard({ action, children }: { action: Action; children: ReactNode }) {
  const me = useCurrentUser();
  if (can(me, action)) return <>{children}</>;
  return (
    <div className="page">
      <Empty icon="users" title="Not available for your role">
        {me ? `${ROLE_META[me.role].label}s can't open this page. Switch user from the menu at the top right.` : ""}
      </Empty>
    </div>
  );
}

/** Close a dropdown on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => (document.removeEventListener("mousedown", onDown), document.removeEventListener("keydown", onKey));
  }, [open, close]);
  return ref;
}

/** Select a field with the orbital "retasking" transition aimed at it. */
export function useGoToField() {
  const { fields, selectField, selectedFieldId } = useStore();
  const { play } = useFx();
  const navigate = useNavigate();
  return (id: string, path = "/") => {
    const f = fields.find((x) => x.id === id);
    if (!f) return;
    if (id !== selectedFieldId) play({ caption: f.name, sub: `${cropById(f.crop).name} · ${formatArea(f.areaHa)} ha`, focus: centroid(f.boundary), ms: 2100 });
    selectField(id);
    navigate(path);
  };
}

function FieldSwitcher() {
  const { fields, selectedFieldId } = useStore();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const goTo = useGoToField();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const current = fields.find((f) => f.id === selectedFieldId) ?? fields[0];
  return (
    <div className="dropdown" ref={ref}>
      <button className="field-pill" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="live" />
        <span className="field-pill-text">
          <small>My fields · {fields.length}</small>
          <b>{current?.name ?? "No fields"}</b>
        </span>
        <Icon name="chevron" size={14} className="rot90" />
      </button>
      {open && (
        <div className="menu">
          {fields.map((f) => (
            <button key={f.id} className={`menu-item ${f.id === current?.id ? "active" : ""}`} onClick={() => (setOpen(false), goTo(f.id))}>
              <Icon name="leaf" size={15} />
              <span><b>{f.name}</b><small>{cropById(f.crop).name} · {formatArea(f.areaHa)} ha</small></span>
            </button>
          ))}
          {can(me, "fields.manage") && (
            <button className="menu-item accent" onClick={() => (setOpen(false), navigate("/fields/new"))}>
              <Icon name="plus" size={15} /><span><b>Map a new field</b></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AlertsBell() {
  const now = useNow(60_000);
  const { fields, tasks, dismissedAlerts } = useStore();
  const goTo = useGoToField();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const converted = new Set(tasks.map((t) => t.alertId));
  const alerts = fields.flatMap((f) => alertsFor(f, now).map((a) => ({ ...a, field: f }))).filter((a) => !dismissedAlerts.includes(a.id) && !converted.has(a.id));
  return (
    <div className="dropdown" ref={ref}>
      <button className="top-icon" onClick={() => setOpen(!open)} aria-label={`${alerts.length} alerts`}>
        <Icon name="alert" />
        {alerts.length > 0 && <em className="badge">{alerts.length}</em>}
      </button>
      {open && (
        <div className="menu menu-right wide">
          <div className="menu-head">Field alerts</div>
          {alerts.length === 0 && <p className="muted small pad">All clear on the latest images.</p>}
          {alerts.map((a) => (
            <button key={a.id} className="menu-item" onClick={() => (setOpen(false), goTo(a.fieldId))}>
              <span className={`sev sev-${a.level}`} />
              <span><b>{a.title}</b><small>{a.field.name}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const me = useCurrentUser();
  const { members, setCurrentUser, resetDemo } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="dropdown" ref={ref}>
      <button className="user-pill" onClick={() => setOpen(!open)} aria-label="Account">
        <Avatar member={me} size={32} />
        <span className="user-pill-text"><b>{me?.name.split(" ")[0]}</b><small>{me && ROLE_META[me.role].label}</small></span>
      </button>
      {open && (
        <div className="menu menu-right wide">
          <div className="menu-head">View the app as</div>
          <div className="menu-scroll">
            {members.map((m) => (
              <button key={m.id} className={`menu-item ${m.id === me?.id ? "active" : ""}`} onClick={() => (setCurrentUser(m.id), setOpen(false))}>
                <Avatar member={m} size={24} />
                <span><b>{m.name}</b><small>{ROLE_META[m.role].label}</small></span>
              </button>
            ))}
          </div>
          <button className="menu-item danger" onClick={() => confirm("Reset all demo data?") && (resetDemo(), setOpen(false))}>
            <Icon name="reset" size={15} /><span><b>Reset demo data</b></span>
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const me = useCurrentUser();
  const now = useNow();
  const { tasks } = useStore();
  const location = useLocation();
  const opsBadge = can(me, "tasks.manage")
    ? tasks.filter((t) => statusOf(t, now) === "delayed").length
    : me ? tasks.filter((t) => isAssignedTo(t, me) && t.status !== "done").length : 0;
  const tab = (to: string, label: string) => (
    <NavLink to={to} end className={({ isActive }) => `tab ${isActive ? "active" : ""}`}>{label}</NavLink>
  );
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Icon name="leaf" size={17} /></span>
        <strong>Fieldwise</strong>
      </div>
      <FieldSwitcher />
      <nav className="tabs">
        {tab("/", "Map")}
        {tab("/analytics", "Analytics")}
        {tab("/reports", "Reports")}
        {tab("/weather", "Weather")}
        <span className="tabs-sep" />
        <NavLink to="/ops" className={() => `tab tab-ops ${location.pathname.startsWith("/ops") ? "active" : ""}`}>
          Operations <em className="addon">Add-on</em>
          {opsBadge > 0 && <em className="badge inline">{opsBadge}</em>}
        </NavLink>
      </nav>
      <div className="top-right">
        <AlertsBell />
        <UserMenu />
      </div>
    </header>
  );
}

function OpsLayout({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const sub = (to: string, icon: Parameters<typeof Icon>[0]["name"], label: string) => (
    <NavLink to={to} className={({ isActive }) => `subtab ${isActive ? "active" : ""}`}><Icon name={icon} size={15} />{label}</NavLink>
  );
  return (
    <div className="ops">
      <div className="ops-bar">
        <div className="ops-title">
          <span className="addon">Add-on</span>
          <b>Operations</b>
          <small className="muted">Act on what the satellite sees: assign field work and track it to done.</small>
        </div>
        <nav className="subtabs">
          {can(me, "tasks.manage") && sub("/ops/tasks", "tasks", "Tasks")}
          {sub("/ops/my", "phone", "My tasks")}
          {can(me, "performance.view") && sub("/ops/performance", "chart", "Performance")}
          {can(me, "team.manage") && sub("/ops/team", "users", "Team & roles")}
        </nav>
      </div>
      {children}
    </div>
  );
}

function OpsIndex() {
  const me = useCurrentUser();
  return <Navigate to={can(me, "tasks.manage") ? "/ops/tasks" : "/ops/my"} replace />;
}

export default function App() {
  return (
    <FxProvider>
      <div className="shell">
        <TopBar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Analysis />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/weather" element={<Weather />} />
            <Route path="/fields/new" element={<Guard action="fields.manage"><Wizard /></Guard>} />
            <Route path="/ops" element={<OpsIndex />} />
            <Route path="/ops/tasks" element={<OpsLayout><Guard action="tasks.manage"><Tasks /></Guard></OpsLayout>} />
            <Route path="/ops/my" element={<OpsLayout><MyTasks /></OpsLayout>} />
            <Route path="/ops/performance" element={<OpsLayout><Guard action="performance.view"><Performance /></Guard></OpsLayout>} />
            <Route path="/ops/team" element={<OpsLayout><Guard action="team.manage"><TeamPage /></Guard></OpsLayout>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </FxProvider>
  );
}
