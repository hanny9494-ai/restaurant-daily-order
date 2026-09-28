import crypto from "node:crypto";
import { db, getSetting, setSetting, OpsError, roleAtLeast, STAFF_ROLES, audit } from "@/lib/ops/common";
import type { Actor, StaffRole } from "@/lib/ops/common";

export type StaffRow = {
  id: number;
  name: string;
  role: StaffRole;
  is_active: number;
  created_at: string;
  updated_at: string;
};

const TOKEN_TTL_SECONDS = 16 * 3600;

function sessionSecret() {
  const fromEnv = String(process.env.STAFF_SESSION_SECRET || "").trim();
  if (fromEnv) return fromEnv;
  let stored = getSetting("staff_session_secret");
  if (!stored) {
    stored = crypto.randomBytes(32).toString("hex");
    setSetting("staff_session_secret", stored);
  }
  return stored;
}

export function hashPin(pin: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPinHash(pin: string, stored: string) {
  const [algo, salt, hash] = String(stored || "").split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(pin, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

function validatePin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new OpsError("PIN_MUST_BE_4_TO_8_DIGITS", 400);
}

function validateRole(role: string): StaffRole {
  if (!STAFF_ROLES.includes(role as StaffRole)) throw new OpsError("INVALID_ROLE", 400);
  return role as StaffRole;
}

export function staffCount() {
  return (db.prepare("SELECT COUNT(*) AS n FROM staff").get() as { n: number }).n;
}

export function listStaff(includeInactive = false): StaffRow[] {
  const sql = `SELECT id, name, role, is_active, created_at, updated_at FROM staff ${includeInactive ? "" : "WHERE is_active = 1"} ORDER BY is_active DESC, role DESC, name ASC`;
  return db.prepare(sql).all() as StaffRow[];
}

export function getStaff(id: number): StaffRow | null {
  return (db.prepare("SELECT id, name, role, is_active, created_at, updated_at FROM staff WHERE id = ?").get(id) as StaffRow | undefined) || null;
}

export function createStaff(input: { name: string; pin: string; role: string }, actor: Actor | null) {
  const name = String(input.name || "").trim();
  if (!name) throw new OpsError("NAME_REQUIRED", 400);
  const pin = String(input.pin || "").trim();
  validatePin(pin);
  const role = validateRole(String(input.role || "RECEIVER"));
  if (actor && role === "ADMIN" && actor.role !== "ADMIN") throw new OpsError("ONLY_ADMIN_CAN_CREATE_ADMIN", 403);
  const exists = db.prepare("SELECT id FROM staff WHERE name = ?").get(name);
  if (exists) throw new OpsError("STAFF_NAME_EXISTS", 409);
  const result = db.prepare("INSERT INTO staff(name, pin_hash, role, is_active) VALUES (?, ?, ?, 1)").run(name, hashPin(pin), role);
  const staff = getStaff(Number(result.lastInsertRowid))!;
  audit(actor, "STAFF_CREATE", "staff", staff.id, { name, role });
  return staff;
}

export function updateStaff(id: number, patch: { name?: string; pin?: string; role?: string; is_active?: number }, actor: Actor) {
  const current = getStaff(id);
  if (!current) throw new OpsError("STAFF_NOT_FOUND", 404);
  if ((current.role === "ADMIN" || patch.role === "ADMIN") && actor.role !== "ADMIN") {
    throw new OpsError("ONLY_ADMIN_CAN_EDIT_ADMIN", 403);
  }
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new OpsError("NAME_REQUIRED", 400);
    db.prepare("UPDATE staff SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, id);
  }
  if (patch.pin !== undefined && patch.pin !== "") {
    const pin = String(patch.pin).trim();
    validatePin(pin);
    db.prepare("UPDATE staff SET pin_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hashPin(pin), id);
  }
  if (patch.role !== undefined) {
    db.prepare("UPDATE staff SET role = ?, updated_at = datetime('now') WHERE id = ?").run(validateRole(patch.role), id);
  }
  if (patch.is_active !== undefined) {
    db.prepare("UPDATE staff SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(patch.is_active ? 1 : 0, id);
  }
  audit(actor, "STAFF_UPDATE", "staff", id, { ...patch, pin: patch.pin ? "***" : undefined });
  return getStaff(id)!;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function issueToken(staff: StaffRow) {
  const payload = Buffer.from(JSON.stringify({ sid: staff.id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function login(staffId: number, pin: string) {
  const row = db.prepare("SELECT id, name, role, is_active, pin_hash, created_at, updated_at FROM staff WHERE id = ?").get(staffId) as
    | (StaffRow & { pin_hash: string })
    | undefined;
  if (!row || row.is_active !== 1 || !verifyPinHash(String(pin || ""), row.pin_hash)) {
    throw new OpsError("INVALID_CREDENTIALS", 401);
  }
  const { pin_hash: _ignored, ...staff } = row;
  return { token: issueToken(staff), staff, expires_in: TOKEN_TTL_SECONDS };
}

export function verifyToken(token: string): StaffRow | null {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sid: number; exp: number };
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    const staff = getStaff(Number(data.sid));
    if (!staff || staff.is_active !== 1) return null;
    return staff;
  } catch {
    return null;
  }
}

export function staffFromRequest(request: Request): StaffRow | null {
  const header = request.headers.get("x-staff-token") || "";
  const auth = request.headers.get("authorization") || "";
  const token = header || (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "");
  return token ? verifyToken(token.trim()) : null;
}

export function requireStaff(request: Request, minRole: StaffRole = "RECEIVER"): Actor {
  const staff = staffFromRequest(request);
  if (!staff) throw new OpsError("STAFF_LOGIN_REQUIRED", 401);
  if (!roleAtLeast(staff.role, minRole)) throw new OpsError("PERMISSION_DENIED", 403);
  return { id: staff.id, name: staff.name, role: staff.role };
}
