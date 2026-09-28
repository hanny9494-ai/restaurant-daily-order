import { db, OpsError, audit, assertDate, addDays, getOpsConfig, localToday, num, round2, round4 } from "@/lib/ops/common";
import type { Actor } from "@/lib/ops/common";
import { convertQuantity, getItem, getLatestBasePrice, listItems } from "@/lib/ops/items";

export type StocktakeStatus = "DRAFT" | "COUNTING" | "SUBMITTED" | "APPROVED";

export type StocktakeLine = {
  id: number;
  stocktake_id: number;
  item_id: number;
  item_name: string;
  category: string;
  storage_location: string;
  base_unit: string;
  quantity: number | null;
  input_quantity: number | null;
  input_unit: string | null;
  prev_quantity: number | null;
  unit_price_snapshot: number | null;
  value: number | null;
  counted_by: string | null;
  counted_at: string | null;
};

function getHeader(id: number) {
  return db.prepare("SELECT * FROM stocktakes WHERE id = ?").get(id) as any;
}

/** Date whose purchases are included in the price snapshot for a count on `date`. */
function priceAsOf(date: string) {
  return getOpsConfig().stocktakeTiming === "START_OF_DAY" ? addDays(date, -1) : date;
}

function previousApproved(date: string, excludeId?: number) {
  return db.prepare(`
    SELECT id, stocktake_date FROM stocktakes WHERE status = 'APPROVED' AND stocktake_date < ? AND id <> ?
    ORDER BY stocktake_date DESC, id DESC LIMIT 1
  `).get(date, excludeId ?? -1) as { id: number; stocktake_date: string } | undefined;
}

/** Add lines for active items that were created after the stocktake started (not for approved ones). */
function syncLines(stocktakeId: number) {
  const header = getHeader(stocktakeId);
  if (!header || header.status === "APPROVED") return;
  const prev = previousApproved(header.stocktake_date, stocktakeId);
  const prevQty = new Map<number, number | null>();
  if (prev) {
    for (const r of db.prepare("SELECT item_id, quantity FROM stocktake_lines WHERE stocktake_id = ?").all(prev.id) as Array<{ item_id: number; quantity: number | null }>) {
      prevQty.set(r.item_id, r.quantity);
    }
  }
  const ins = db.prepare(`
    INSERT OR IGNORE INTO stocktake_lines(stocktake_id, item_id, item_name, category, storage_location, base_unit, prev_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const item of listItems()) {
      ins.run(stocktakeId, item.id, item.name, item.category, item.storage_location, item.base_unit, prevQty.get(item.id) ?? null);
    }
  })();
}

export function nextStocktakeDate(from = localToday()) {
  const weekday = getOpsConfig().stocktakeWeekday;
  const d = new Date(`${from}T00:00:00Z`);
  const diff = (weekday - d.getUTCDay() + 7) % 7;
  return addDays(from, diff);
}

export function listStocktakes() {
  const rows = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM stocktake_lines l WHERE l.stocktake_id = s.id) AS line_count,
      (SELECT COUNT(*) FROM stocktake_lines l WHERE l.stocktake_id = s.id AND l.quantity IS NOT NULL) AS counted_count
    FROM stocktakes s ORDER BY s.stocktake_date DESC, s.id DESC LIMIT 200
  `).all() as any[];
  const config = getOpsConfig();
  return {
    stocktakes: rows,
    config: { stocktake_weekday: config.stocktakeWeekday, stocktake_timing: config.stocktakeTiming },
    next_due_date: nextStocktakeDate(),
    is_due_today: nextStocktakeDate() === localToday()
  };
}

export function createStocktake(input: { stocktake_date?: string; kind?: string; note?: string }, actor: Actor) {
  const date = input.stocktake_date ? assertDate(input.stocktake_date) : localToday();
  const kind = input.kind === "ADHOC" ? "ADHOC" : "WEEKLY";
  const open = db.prepare("SELECT id FROM stocktakes WHERE stocktake_date = ? AND status <> 'APPROVED'").get(date) as { id: number } | undefined;
  if (open) throw new OpsError("STOCKTAKE_ALREADY_OPEN_FOR_DATE", 409, { stocktake_id: open.id });
  const approvedSameDay = db.prepare("SELECT id FROM stocktakes WHERE stocktake_date = ? AND status = 'APPROVED'").get(date) as { id: number } | undefined;
  if (approvedSameDay) throw new OpsError("STOCKTAKE_ALREADY_APPROVED_FOR_DATE", 409, { stocktake_id: approvedSameDay.id });
  if (listItems().length === 0) throw new OpsError("NO_ACTIVE_ITEMS", 400);
  const result = db.prepare("INSERT INTO stocktakes(stocktake_date, kind, status, note, created_by) VALUES (?, ?, 'DRAFT', ?, ?)")
    .run(date, kind, String(input.note || "").trim() || null, actor.name);
  const id = Number(result.lastInsertRowid);
  syncLines(id);
  audit(actor, "STOCKTAKE_CREATE", "stocktakes", id, { date, kind });
  return getStocktake(id);
}

export function getStocktake(id: number) {
  syncLines(id);
  const header = getHeader(id);
  if (!header) throw new OpsError("STOCKTAKE_NOT_FOUND", 404);
  const lines = db.prepare("SELECT * FROM stocktake_lines WHERE stocktake_id = ? ORDER BY storage_location, category, item_name").all(id) as StocktakeLine[];
  const isApproved = header.status === "APPROVED";
  const asOf = priceAsOf(header.stocktake_date);
  const enriched = lines.map((l) => {
    if (isApproved) return { ...l, estimated_unit_price: l.unit_price_snapshot, estimated_value: l.value };
    const price = getLatestBasePrice(l.item_id, asOf);
    const estPrice = price ? price.base_unit_price : null;
    return {
      ...l,
      estimated_unit_price: estPrice,
      estimated_value: l.quantity !== null && estPrice !== null ? round2(l.quantity * estPrice) : null
    };
  });
  const units = new Map<number, string[]>();
  for (const item of listItems({ includeInactive: true })) units.set(item.id, [item.base_unit, ...item.units.map((u) => u.unit)]);
  return {
    ...header,
    lines: enriched.map((l) => ({ ...l, unit_options: units.get(l.item_id) || [l.base_unit] })),
    uncounted: enriched.filter((l) => l.quantity === null).map((l) => ({ item_id: l.item_id, item_name: l.item_name, storage_location: l.storage_location })),
    locations: Array.from(new Set(enriched.map((l) => l.storage_location))),
    estimated_total: round2(enriched.reduce((s, l) => s + (l.estimated_value || 0), 0))
  };
}

export function saveCounts(id: number, counts: Array<{ item_id: number; quantity?: number | null; input_quantity?: number | null; input_unit?: string | null }>, actor: Actor) {
  const header = getHeader(id);
  if (!header) throw new OpsError("STOCKTAKE_NOT_FOUND", 404);
  if (header.status !== "DRAFT" && header.status !== "COUNTING") throw new OpsError("STOCKTAKE_NOT_EDITABLE", 409);
  if (!Array.isArray(counts)) throw new OpsError("COUNTS_REQUIRED", 400);
  syncLines(id);
  const upd = db.prepare(`
    UPDATE stocktake_lines SET quantity = ?, input_quantity = ?, input_unit = ?, counted_by = ?, counted_at = datetime('now')
    WHERE stocktake_id = ? AND item_id = ?
  `);
  let saved = 0;
  db.transaction(() => {
    for (const c of counts) {
      const itemId = Number(c.item_id);
      const item = getItem(itemId);
      if (!item) throw new OpsError("ITEM_NOT_FOUND", 400, { item_id: c.item_id });
      const inputQty = num(c.input_quantity ?? c.quantity);
      if (inputQty === null) {
        // explicit "not counted" (blank) — different from 0
        upd.run(null, null, null, null, id, itemId);
        saved += 1;
        continue;
      }
      if (inputQty < 0) throw new OpsError("INVALID_QUANTITY", 400, { item: item.name });
      const inputUnit = String(c.input_unit || item.base_unit).trim() || item.base_unit;
      const baseQty = convertQuantity(item, inputQty, inputUnit, item.base_unit);
      if (baseQty === null) throw new OpsError("UNIT_NOT_CONVERTIBLE", 400, { item: item.name, unit: inputUnit, base_unit: item.base_unit });
      upd.run(round4(baseQty), inputQty, inputUnit, actor.name, id, itemId);
      saved += 1;
    }
    if (header.status === "DRAFT") db.prepare("UPDATE stocktakes SET status = 'COUNTING' WHERE id = ?").run(id);
  })();
  return { saved, stocktake: getStocktake(id) };
}

export function submitStocktake(id: number, input: { allow_uncounted?: boolean }, actor: Actor) {
  const st = getStocktake(id);
  if (st.status !== "DRAFT" && st.status !== "COUNTING") throw new OpsError("STOCKTAKE_NOT_EDITABLE", 409);
  if (st.uncounted.length > 0 && !input.allow_uncounted) {
    throw new OpsError("UNCOUNTED_ITEMS", 409, { uncounted: st.uncounted });
  }
  db.prepare("UPDATE stocktakes SET status = 'SUBMITTED', submitted_by = ?, submitted_at = datetime('now') WHERE id = ?").run(actor.name, id);
  audit(actor, "STOCKTAKE_SUBMIT", "stocktakes", id, { uncounted: st.uncounted.length });
  return getStocktake(id);
}

export function reopenStocktake(id: number, actor: Actor) {
  const header = getHeader(id);
  if (!header) throw new OpsError("STOCKTAKE_NOT_FOUND", 404);
  if (header.status !== "SUBMITTED") throw new OpsError("STOCKTAKE_NOT_SUBMITTED", 409);
  db.prepare("UPDATE stocktakes SET status = 'COUNTING' WHERE id = ?").run(id);
  audit(actor, "STOCKTAKE_REOPEN", "stocktakes", id);
  return getStocktake(id);
}

/** Approve and freeze: snapshot the latest purchase price per base unit so history never drifts. */
export function approveStocktake(id: number, actor: Actor) {
  const header = getHeader(id);
  if (!header) throw new OpsError("STOCKTAKE_NOT_FOUND", 404);
  if (header.status !== "SUBMITTED") throw new OpsError("STOCKTAKE_NOT_SUBMITTED", 409);
  const asOf = priceAsOf(header.stocktake_date);
  const lines = db.prepare("SELECT id, item_id, quantity FROM stocktake_lines WHERE stocktake_id = ?").all(id) as Array<{ id: number; item_id: number; quantity: number | null }>;
  const missingPrice: number[] = [];
  let total = 0;
  db.transaction(() => {
    const upd = db.prepare("UPDATE stocktake_lines SET unit_price_snapshot = ?, value = ? WHERE id = ?");
    for (const l of lines) {
      const price = getLatestBasePrice(l.item_id, asOf);
      const unitPrice = price ? price.base_unit_price : null;
      if (unitPrice === null && l.quantity) missingPrice.push(l.item_id);
      const value = l.quantity !== null && unitPrice !== null ? round2(l.quantity * unitPrice) : l.quantity === null ? null : 0;
      total += value || 0;
      upd.run(unitPrice, value, l.id);
    }
    db.prepare("UPDATE stocktakes SET status = 'APPROVED', approved_by = ?, approved_at = datetime('now'), total_value = ? WHERE id = ?")
      .run(actor.name, round2(total), id);
  })();
  audit(actor, "STOCKTAKE_APPROVE", "stocktakes", id, { total_value: round2(total), missing_price_items: missingPrice });
  return { ...getStocktake(id), missing_price_item_ids: missingPrice };
}

export function deleteStocktake(id: number, actor: Actor) {
  const header = getHeader(id);
  if (!header) throw new OpsError("STOCKTAKE_NOT_FOUND", 404);
  if (header.status === "APPROVED") throw new OpsError("STOCKTAKE_APPROVED_CANNOT_DELETE", 409);
  db.transaction(() => {
    db.prepare("DELETE FROM stocktake_lines WHERE stocktake_id = ?").run(id);
    db.prepare("DELETE FROM stocktakes WHERE id = ?").run(id);
  })();
  audit(actor, "STOCKTAKE_DELETE", "stocktakes", id);
  return { ok: true };
}
