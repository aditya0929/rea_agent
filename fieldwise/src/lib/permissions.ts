import type { Member, Role } from "../types";

export type Action =
  | "tasks.manage"
  | "fields.manage"
  | "performance.view"
  | "team.manage"
  | "team.assignAdmin";

const GRANTS: Record<Role, Action[]> = {
  owner: ["tasks.manage", "fields.manage", "performance.view", "team.manage", "team.assignAdmin"],
  admin: ["tasks.manage", "fields.manage", "performance.view", "team.manage"],
  manager: ["tasks.manage", "fields.manage", "performance.view"],
  staff: [],
};

export const can = (m: Member | undefined, a: Action) => !!m && GRANTS[m.role].includes(a);

export const ROLE_META: Record<Role, { label: string; summary: string }> = {
  owner: { label: "Owner", summary: "Everything, including billing and who can be an admin" },
  admin: { label: "Admin", summary: "Manage fields, tasks, team members and crews" },
  manager: { label: "Manager", summary: "Add fields, assign tasks and review team performance" },
  staff: { label: "Field staff", summary: "See and update the tasks assigned to them or their crew" },
};

export const ROLES: Role[] = ["owner", "admin", "manager", "staff"];

/** Which roles `actor` may grant. Only an owner can make someone an owner or admin. */
export function assignableRoles(actor: Member | undefined): Role[] {
  if (can(actor, "team.assignAdmin")) return ROLES;
  if (can(actor, "team.manage")) return ["manager", "staff"];
  return [];
}
