import { db, OpsError, audit, assertDate, localToday, num, round2, round4, roleAtLeast } from "@/lib/ops/common";
import type { Actor } from "@/lib/ops/common";
import { effectiveAccepted, getReceivingItemContext } from "@/lib/ops/receiving";

export const DISCREPANCY_TYPES = ["SHORT", "REJECT_ON_SITE", "RETURN_LATER", "EXCHANGE", "OVER_DELIVERY", "PRICE_MISMATCH"] as const;
export const RESOLUTIONS = ["RESOLVED_RESENT", "RESOLVED_RETURNED", "RESOLVED_DEDUCTED"] as const;
export type DiscrepancyType = typeof DISCREPANCY_TYPES[number];

export function listDiscrepancies(filter: {
  status?: string;
  supplier_id?: number | null;
  date_from?: string;
  date_to?: string;
  unsettled_only?: boolean;
}) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.status) {
    where.push("d.status = ?");
    args.push(filter.status);
  }
  if (filter.unsettled_only) where.push("d.status <> 'SETTLED'");
  if (filter.supplier_id) {
    where.push("d.supplier_id = ?");
    args.push(filter.supplier_id);
  }
  if (filter.date_from) {
    where.push("(d.date >= ? OR d.effective_date >= ?)");
    args.push(filter.date_from, filter.date_from);
  }
  if (filter.date_to) {
    where.push("(d.date <= ? OR d.effective_date <= ?)");
    args.push(filter.date_to, filter.date_to);
  }
  return db.prepare(`
    SELECT d.*, sp.name AS supplier_name, sf.file_url AS photo_url
    FROM discrepancies d
    JOIN suppliers sp ON sp.id = d.supplier_id
    LEFT JOIN receiving_scan_files sf ON sf.id = d.photo_file_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY d.date DESC, d.id DESC
    LIMIT 1000
  `).all(...args) as any[];
}

export function getDiscrepancy(id: number) {
  return db.prepare("SELECT d.*, sp.name AS supplier_name FROM discrepancies d JOIN suppliers sp ON sp.id = d.supplier_id WHERE d.id = ?").get(id) as any;
}

/**
 * Manual discrepancy. RETURN_LATER / EXCHANGE are allowed after the day is locked and book a negative
 * (red-letter) adjustment = -qty × unit price on the effective date.
 */
export function createDiscrepancy(input: {
  type: string;
  receiving_item_id: number;
  quantity: number;
  reason?: string;
  photo_file_id?: number | null;
  effective_date?: string;
  expected_unit_price?: number | null;
}, actor: Actor) {
  const type = String(input.type || "") as DiscrepancyType;
  if (!DISCREPANCY_TYPES.includes(type)) throw new OpsError("INVALID_DISCREPANCY_TYPE", 400);
  const ctx = getReceivingItemContext(Number(input.receiving_item_id));
  if (!ctx) throw new OpsError("RECEIVING_ITEM_NOT_FOUND", 404);
  const qty = num(input.quantity);
  if (qty === null || qty <= 0) throw new OpsError("INVALID_QUANTITY", 400);
  const effectiveDate = input.effective_date ? assertDate(input.effective_date) : localToday();
  const unitPrice: number | null = ctx.unit_price;
  let amount = 0;
  let adjustment = 0;
  let expected: number | null = null;

  if (type === "RETURN_LATER" || type === "EXCHANGE") {
    const accepted = effectiveAccepted(ctx);
    const alreadyReturned = (db.prepare(`
      SELECT COALESCE(SUM(quantity), 0) AS q FROM discrepancies WHERE receiving_item_id = ? AND type IN ('RETURN_LATER', 'EXCHANGE')
    `).get(ctx.id) as { q: number }).q;
    if (qty > accepted - alreadyReturned + 1e-9) {
      throw new OpsError("RETURN_EXCEEDS_ACCEPTED", 400, { accepted, already_returned: alreadyReturned });
    }
    if (unitPrice === null) throw new OpsError("RECEIVING_ITEM_HAS_NO_PRICE", 400);
    amount = round2(-qty * unitPrice);
    adjustment = amount;
    if (!String(input.reason || "").trim()) throw new OpsError("REASON_REQUIRED", 400);
  } else {
    const list = db.prepare("SELECT receiving_locked_at FROM daily_lists WHERE date = ?").get(ctx.date) as { receiving_locked_at: string | null } | undefined;
    if (list?.receiving_locked_at && !roleAtLeast(actor.role, "CHEF")) throw new OpsError("DAILY_LIST_LOCKED", 409);
    if (type === "PRICE_MISMATCH") {
      expected = num(input.expected_unit_price);
      if (expected === null || unitPrice === null) throw new OpsError("EXPECTED_PRICE_REQUIRED", 400);
      amount = round2((unitPrice - expected) * qty);
    } else {
      amount = round2(qty * (unitPrice ?? 0));
    }
  }

  const result = db.prepare(`
    INSERT INTO discrepancies(date, effective_date, supplier_id, receiving_item_id, daily_list_item_id, item_id, item_name, unit, type, status,
      quantity, unit_price, expected_unit_price, amount, adjustment_amount, reason, photo_file_id, source, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?)
  `).run(
    ctx.date, effectiveDate, ctx.supplier_id, ctx.id, ctx.daily_list_item_id, ctx.item_id ?? ctx.dli_item_id ?? null, ctx.item_name, ctx.unit, type,
    round4(qty), unitPrice, expected, amount, adjustment, String(input.reason || "").trim() || null, num(input.photo_file_id), actor.name
  );
  const id = Number(result.lastInsertRowid);
  db.prepare("UPDATE supplier_orders SET has_discrepancy = 1, updated_at = datetime('now') WHERE date = ? AND supplier_id = ?").run(ctx.date, ctx.supplier_id);
  audit(actor, "DISCREPANCY_CREATE", "discrepancies", id, { type, qty, receiving_item_id: ctx.id });
  return getDiscrepancy(id);
}

/** OPEN -> RESOLVED_*; PRICE_MISMATCH deducted / OVER_DELIVERY returned get a default payable adjustment. */
export function resolveDiscrepancy(id: number, input: { resolution: string; note?: string; adjustment_amount?: number | null }, actor: Actor) {
  const d = getDiscrepancy(id);
  if (!d) throw new OpsError("DISCREPANCY_NOT_FOUND", 404);
  if (d.status !== "OPEN") throw new OpsError("DISCREPANCY_NOT_OPEN", 409);
  const resolution = String(input.resolution || "");
  if (!(RESOLUTIONS as readonly string[]).includes(resolution)) throw new OpsError("INVALID_RESOLUTION", 400);
  let adjustment: number = d.adjustment_amount || 0;
  const explicit = num(input.adjustment_amount);
  if (explicit !== null) {
    adjustment = round2(explicit);
  } else if (d.type === "PRICE_MISMATCH" && resolution === "RESOLVED_DEDUCTED") {
    adjustment = round2(-d.amount);
  } else if (d.type === "OVER_DELIVERY" && resolution === "RESOLVED_RETURNED") {
    adjustment = round2(-(d.quantity * (d.unit_price || 0)));
  }
  db.prepare(`
    UPDATE discrepancies SET status = ?, adjustment_amount = ?, resolution_note = ?, resolved_by = ?, resolved_at = datetime('now')
    WHERE id = ?
  `).run(resolution, adjustment, String(input.note || "").trim() || null, actor.name, id);
  audit(actor, "DISCREPANCY_RESOLVE", "discrepancies", id, { resolution, adjustment });
  return getDiscrepancy(id);
}

export function settleDiscrepancies(ids: number[], actor: Actor) {
  const settled: number[] = [];
  const skipped: Array<{ id: number; reason: string }> = [];
  db.transaction(() => {
    for (const id of ids) {
      const d = getDiscrepancy(id);
      if (!d) {
        skipped.push({ id, reason: "NOT_FOUND" });
        continue;
      }
      if (d.status === "OPEN") {
        skipped.push({ id, reason: "STILL_OPEN" });
        continue;
      }
      if (d.status === "SETTLED") continue;
      db.prepare("UPDATE discrepancies SET status = 'SETTLED', settled_by = ?, settled_at = datetime('now') WHERE id = ?").run(actor.name, id);
      settled.push(id);
    }
  })();
  audit(actor, "DISCREPANCY_SETTLE", "discrepancies", null, { settled, skipped });
  return { settled, skipped };
}
