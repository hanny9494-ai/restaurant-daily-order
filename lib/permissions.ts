import { getRecipeUsers } from "@/lib/db";
import type { RecipeUserRole } from "@/lib/types";

export type Permission =
  | "receiving:scan"
  | "receiving:lock"
  | "recipe:import"
  | "recipe:smart_edit"
  | "foh:edit_menu"
  | "foh:check";

const MATRIX: Record<Permission, RecipeUserRole[]> = {
  "receiving:scan": ["OWNER", "EDITOR", "RECEIVER"],
  "receiving:lock": ["OWNER", "EDITOR"],
  "recipe:import": ["OWNER", "EDITOR"],
  "recipe:smart_edit": ["OWNER", "EDITOR"],
  "foh:edit_menu": ["OWNER", "EDITOR", "FOH"],
  "foh:check": ["OWNER", "EDITOR", "REVIEWER", "VIEWER", "FOH"]
};

export function hasPermission(role: RecipeUserRole, permission: Permission) {
  return MATRIX[permission].includes(role);
}

export async function requirePermission(permission: Permission, actorEmail: string) {
  const email = String(actorEmail || "").trim().toLowerCase();
  if (!email) {
    return { allowed: false, error: "ACTOR_REQUIRED" };
  }
  const users = getRecipeUsers(true);
  const user = users.find((item) => item.email.toLowerCase() === email && item.is_active === 1);
  if (!user) {
    return { allowed: false, error: "USER_NOT_FOUND" };
  }
  if (!hasPermission(user.role, permission)) {
    return { allowed: false, error: "PERMISSION_DENIED" };
  }
  return { allowed: true, user };
}
