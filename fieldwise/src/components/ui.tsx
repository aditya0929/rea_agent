import { useEffect, useState, type ReactNode } from "react";
import type { Member, TaskStatus } from "../types";
import { STATUS_META } from "../lib/tasks";
import { Icon, type IconName } from "./Icon";

/** Current time, re-rendering every `ms`. Drives countdowns and Delayed status. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const STATUS_ICON: Record<TaskStatus, IconName> = { pending: "clock", in_progress: "play", delayed: "alert", done: "check" };

export function StatusPill({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`pill pill-${meta.tone}`}>
      <Icon name={STATUS_ICON[status]} size={13} />
      {meta.label}
    </span>
  );
}

export function Avatar({ member, size = 28 }: { member?: Pick<Member, "name">; size?: number }) {
  const initials = (member?.name ?? "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Modal({ title, eyebrow, onClose, children, footer, wide }: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2>{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "critical" }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-sub ${tone ? `text-${tone}` : ""}`}>{sub}</div>}
    </div>
  );
}

export const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
