import { sqlite } from "@/lib/db";

export const db = sqlite;

export type StaffRole = "RECEIVER" | "CHEF" | "MANAGER" | "ADMIN";
export const STAFF_ROLES: StaffRole[] = ["RECEIVER", "CHEF", "MANAGER", "ADMIN"];
const ROLE_LEVEL: Record<StaffRole, number> = { RECEIVER: 1, CHEF: 2, MANAGER: 3, ADMIN: 4 };

export function roleAtLeast(role: StaffRole, min: StaffRole) {
  return (ROLE_LEVEL[role] || 0) >= ROLE_LEVEL[min];
}

export type Actor = { id: number | null; name: string; role: StaffRole };

export class OpsError extends Error {
  status: number;
  detail?: unknown;
  constructor(code: string, status = 400, detail?: unknown) {
    super(code);
    this.status = status;
    this.detail = detail;
  }
}

// ---------- settings (env first, app_settings table can override at runtime) ----------

export function getSetting(key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string) {
  db.prepare(`
    INSERT INTO app_settings(key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, value);
}

function numberEnv(name: string, fallback: number) {
  const raw = String(process.env[name] ?? "").trim();
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n : fallback;
}

export function getOpsConfig() {
  const priceOverride = Number(getSetting("price_deviation_threshold"));
  const weekdayOverride = getSetting("stocktake_weekday");
  const weekday = weekdayOverride !== null && weekdayOverride !== "" ? Number(weekdayOverride) : numberEnv("STOCKTAKE_WEEKDAY", 1);
  const timing = String(process.env.STOCKTAKE_TIMING || "END_OF_DAY").trim().toUpperCase() === "START_OF_DAY"
    ? "START_OF_DAY" as const
    : "END_OF_DAY" as const;
  return {
    storeName: String(process.env.STORE_NAME || process.env.NEXT_PUBLIC_STORE_NAME || "ensue").trim(),
    priceDeviationThreshold: Number.isFinite(priceOverride) && priceOverride > 0
      ? priceOverride
      : numberEnv("PRICE_DEVIATION_THRESHOLD", 0.15),
    consumptionAnomalyThreshold: numberEnv("CONSUMPTION_ANOMALY_THRESHOLD", 0.3),
    stocktakeWeekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 1,
    stocktakeTiming: timing,
    ocrMockEnabled: String(process.env.RECEIVING_OCR_MOCK || "").trim() === "1"
  };
}

// ---------- audit ----------

export function audit(actor: Actor | null, action: string, entity: string, entityId: string | number | null, detail?: unknown) {
  db.prepare(`
    INSERT INTO ops_audit_log(actor_staff_id, actor_name, action, entity, entity_id, detail_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    actor?.id ?? null,
    actor?.name ?? null,
    action,
    entity,
    entityId === null ? null : String(entityId),
    detail === undefined ? null : JSON.stringify(detail)
  );
}

// ---------- numbers / dates ----------

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round4(n: number) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function assertDate(value: unknown, code = "INVALID_DATE") {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new OpsError(code, 400);
  return s;
}

export function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- name normalisation / fuzzy matching ----------

export function normalizeName(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[()（）\[\]【】{}<>《》\-_/\\.,，。、:：;；'"“”‘’!！?？*#~·]+/g, "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function bigrams(s: string) {
  const out: string[] = [];
  if (s.length < 2) return s ? [s] : out;
  for (let i = 0; i < s.length - 1; i += 1) out.push(s.slice(i, i + 2));
  return out;
}

/** 0..1 similarity on normalised names (Dice coefficient on bigrams, with containment boost). */
export function nameSimilarity(a: string, b: string) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const shorter = x.length <= y.length ? x : y;
  const longer = x.length <= y.length ? y : x;
  if (shorter.length >= 2 && longer.includes(shorter)) return 0.85;
  const ax = bigrams(x);
  const by = bigrams(y);
  const pool = [...by];
  let hit = 0;
  for (const g of ax) {
    const idx = pool.indexOf(g);
    if (idx >= 0) {
      hit += 1;
      pool.splice(idx, 1);
    }
  }
  const dice = (2 * hit) / (ax.length + by.length);
  if (shorter.length === 1 && longer.includes(shorter)) return Math.max(dice, 0.5);
  return dice;
}
