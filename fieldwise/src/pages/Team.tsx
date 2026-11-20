import { useState } from "react";
import type { Member, Role } from "../types";
import { useCurrentUser, useStore } from "../store/store";
import { assignableRoles, ROLE_META, ROLES } from "../lib/permissions";
import { isAssignedTo } from "../lib/tasks";
import { Icon } from "../components/Icon";
import { Avatar, Modal } from "../components/ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[\d\s()-]{7,}$/;

function AddMember({ onClose }: { onClose: () => void }) {
  const me = useCurrentUser();
  const { teams, members, addMember } = useStore();
  const roles = assignableRoles(me);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const submit = () => {
    const e = email.trim(), p = phone.trim();
    if (!name.trim()) return setError("Add the person's name.");
    if (!e === !p) return setError("Provide either an email or a phone number, not both.");
    if (e && !EMAIL.test(e)) return setError("That email doesn't look right.");
    if (p && !PHONE.test(p)) return setError("That phone number doesn't look right.");
    if (members.some((m) => (e && m.email === e) || (p && m.phone === p))) return setError("Someone with that contact is already on the team.");
    addMember({ name: name.trim(), email: e || undefined, phone: p || undefined, role, teamIds });
    onClose();
  };

  return (
    <Modal
      title="Add a team member"
      eyebrow="Give someone access"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Add member</button></>}
    >
      <p className="note">Provide either an email <strong>or</strong> a phone number, not both. Field staff usually sign in with their phone.</p>
      <div className="form-grid">
        <label className="span-2"><span>Name *</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label><span>Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!phone.trim()} type="email" /></label>
        <label><span>Phone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!!email.trim()} inputMode="tel" placeholder="+91 98765 43210" /></label>
        <label className="span-2"><span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {roles.map((r) => <option key={r} value={r}>{ROLE_META[r].label}: {ROLE_META[r].summary}</option>)}
          </select>
        </label>
        <div className="span-2">
          <span className="label">Crews</span>
          <div className="chips">
            {teams.map((t) => (
              <button key={t.id} className={`chip chip-btn ${teamIds.includes(t.id) ? "active" : ""}`} onClick={() => setTeamIds(teamIds.includes(t.id) ? teamIds.filter((x) => x !== t.id) : [...teamIds, t.id])}>
                {teamIds.includes(t.id) && <Icon name="check" size={12} />}{t.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="text-critical small">{error}</p>}
    </Modal>
  );
}

function CrewEditor({ member, onClose }: { member: Member; onClose: () => void }) {
  const { teams, updateMember } = useStore();
  const [ids, setIds] = useState(member.teamIds);
  return (
    <Modal
      title={`${member.name}'s crews`}
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => (updateMember(member.id, { teamIds: ids }), onClose())}>Save</button></>}
    >
      <div className="check-list">
        {teams.map((t) => (
          <label key={t.id}>
            <input type="checkbox" checked={ids.includes(t.id)} onChange={() => setIds(ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id])} />
            {t.name}
          </label>
        ))}
      </div>
    </Modal>
  );
}

export default function TeamPage() {
  const me = useCurrentUser();
  const { members, teams, tasks, updateMember, removeMember, addTeam, renameTeam, removeTeam } = useStore();
  const [adding, setAdding] = useState(false);
  const [crewFor, setCrewFor] = useState<Member | null>(null);
  const [newTeam, setNewTeam] = useState("");
  const [editingTeam, setEditingTeam] = useState<{ id: string; name: string } | null>(null);
  const grantable = assignableRoles(me);
  const isOwner = me?.role === "owner";

  // You can't edit yourself, and only an owner can touch owners and admins.
  const editable = (m: Member) => m.id !== me?.id && (isOwner || (m.role !== "owner" && m.role !== "admin"));
  const openCount = (m: Member) => tasks.filter((t) => t.status !== "done" && t.assignee?.kind === "member" && isAssignedTo(t, m)).length;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Team & roles</h1>
          <p className="muted">{members.length} people with access to this account. Field staff only see the tasks for them and their crews.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add member</button>
      </header>

      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Member</th><th>Contact</th><th>Role</th><th>Crews</th><th className="num">Open tasks</th><th /></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="static">
                <td><span className="who"><Avatar member={m} /><strong>{m.name}</strong>{m.id === me?.id && <span className="pill pill-neutral pill-xs">You</span>}</span></td>
                <td className="muted">{m.email ?? m.phone}</td>
                <td>
                  {editable(m) ? (
                    <select value={m.role} onChange={(e) => updateMember(m.id, { role: e.target.value as Role })} aria-label={`Role for ${m.name}`}>
                      {ROLES.filter((r) => grantable.includes(r) || r === m.role).map((r) => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
                    </select>
                  ) : ROLE_META[m.role].label}
                </td>
                <td>
                  <div className="chips">
                    {m.teamIds.map((id) => <span key={id} className="chip">{teams.find((t) => t.id === id)?.name}</span>)}
                    {editable(m) && <button className="chip chip-btn" onClick={() => setCrewFor(m)}><Icon name="edit" size={12} />{m.teamIds.length ? "" : "Add to crew"}</button>}
                  </div>
                </td>
                <td className="num">{openCount(m)}</td>
                <td className="num">
                  {editable(m) && (
                    <button
                      className="icon-btn sm"
                      aria-label={`Remove ${m.name}`}
                      onClick={() => confirm(`Remove ${m.name}? Their open tasks go back to unassigned.`) && removeMember(m.id)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h3>Crews</h3><span className="muted small">Assign tasks to a whole crew</span></div>
          <ul className="crews">
            {teams.map((t) => {
              const roster = members.filter((m) => m.teamIds.includes(t.id));
              return (
                <li key={t.id}>
                  {editingTeam?.id === t.id ? (
                    <form className="row gap-s grow" onSubmit={(e) => (e.preventDefault(), editingTeam.name.trim() && renameTeam(t.id, editingTeam.name.trim()), setEditingTeam(null))}>
                      <input autoFocus value={editingTeam.name} onChange={(e) => setEditingTeam({ id: t.id, name: e.target.value })} />
                      <button className="btn btn-sm">Save</button>
                    </form>
                  ) : (
                    <div className="grow">
                      <strong>{t.name}</strong>
                      <small className="muted">{roster.length ? roster.map((m) => m.name.split(" ")[0]).join(", ") : "No members yet"}</small>
                    </div>
                  )}
                  <button className="icon-btn sm" aria-label={`Rename ${t.name}`} onClick={() => setEditingTeam({ id: t.id, name: t.name })}><Icon name="edit" size={14} /></button>
                  <button className="icon-btn sm" aria-label={`Delete ${t.name}`} onClick={() => confirm(`Delete ${t.name}? Its open tasks become unassigned.`) && removeTeam(t.id)}><Icon name="trash" size={14} /></button>
                </li>
              );
            })}
          </ul>
          <form className="row gap-s" onSubmit={(e) => (e.preventDefault(), newTeam.trim() && (addTeam(newTeam.trim()), setNewTeam("")))}>
            <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="New crew name" />
            <button className="btn btn-sm" disabled={!newTeam.trim()}><Icon name="plus" size={14} /> Add crew</button>
          </form>
        </section>

        <section className="card">
          <div className="card-head"><h3>What each role can do</h3></div>
          <ul className="roles">
            {ROLES.map((r) => (
              <li key={r}><strong>{ROLE_META[r].label}</strong><span className="muted">{ROLE_META[r].summary}</span></li>
            ))}
          </ul>
          {!isOwner && <p className="note">Only the owner can make someone an owner or admin.</p>}
        </section>
      </div>

      {adding && <AddMember onClose={() => setAdding(false)} />}
      {crewFor && <CrewEditor member={crewFor} onClose={() => setCrewFor(null)} />}
    </div>
  );
}
