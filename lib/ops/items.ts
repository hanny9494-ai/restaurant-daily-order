import { db, OpsError, audit, normalizeName, num, round4 } from "@/lib/ops/common";
import type { Actor } from "@/lib/ops/common";
import { factorToBase } from "@/lib/ops/unit-math";

export const ITEM_CATEGORIES = ["肉", "海鲜", "蔬菜", "水果", "干货", "调料", "乳制品", "蛋", "酒水", "饮料", "包材", "其他"];
export const STORAGE_LOCATIONS = ["冷藏", "冷冻", "干仓", "酒水", "吧台", "其他"];

export type ItemUnit = { unit: string; factor_to_base: number };

export type Item = {
  id: number;
  name: string;
  aliases: string[];
  category: string;
  base_unit: string;
  default_supplier_id: number | null;
  default_supplier_name?: string | null;
  storage_location: string;
  par_level: number | null;
  is_active: number;
  units: ItemUnit[];
};

type ItemRowDb = Omit<Item, "aliases" | "units"> & { aliases_json: string };

function parseAliases(raw: string) {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.map((s) => String(s)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function hydrate(row: ItemRowDb, unitsByItem: Map<number, ItemUnit[]>): Item {
  const { aliases_json, ...rest } = row;
  return { ...rest, aliases: parseAliases(aliases_json), units: unitsByItem.get(row.id) || [] };
}

function loadUnits(itemIds?: number[]) {
  const rows = (itemIds && itemIds.length === 1
    ? db.prepare("SELECT item_id, unit, factor_to_base FROM item_units WHERE item_id = ? ORDER BY id").all(itemIds[0])
    : db.prepare("SELECT item_id, unit, factor_to_base FROM item_units ORDER BY id").all()) as Array<ItemUnit & { item_id: number }>;
  const map = new Map<number, ItemUnit[]>();
  for (const r of rows) {
    const list = map.get(r.item_id) || [];
    list.push({ unit: r.unit, factor_to_base: r.factor_to_base });
    map.set(r.item_id, list);
  }
  return map;
}

const ITEM_SELECT = `
  SELECT i.id, i.name, i.aliases_json, i.category, i.base_unit, i.default_supplier_id, sp.name AS default_supplier_name,
         i.storage_location, i.par_level, i.is_active
  FROM items i LEFT JOIN suppliers sp ON sp.id = i.default_supplier_id
`;

export function listItems(opts: { includeInactive?: boolean } = {}): Item[] {
  const rows = db.prepare(`${ITEM_SELECT} ${opts.includeInactive ? "" : "WHERE i.is_active = 1"} ORDER BY i.category, i.name`).all() as ItemRowDb[];
  const units = loadUnits();
  return rows.map((r) => hydrate(r, units));
}

export function getItem(id: number): Item | null {
  const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id) as ItemRowDb | undefined;
  if (!row) return null;
  return hydrate(row, loadUnits([id]));
}

function cleanUnits(input: unknown, baseUnit: string): ItemUnit[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ItemUnit[] = [];
  for (const raw of input) {
    const unit = String((raw as any)?.unit || "").trim();
    const factor = num((raw as any)?.factor_to_base);
    if (!unit || unit === baseUnit || seen.has(unit)) continue;
    if (factor === null || factor <= 0) throw new OpsError("INVALID_UNIT_FACTOR", 400, { unit });
    seen.add(unit);
    out.push({ unit, factor_to_base: factor });
  }
  return out;
}

function cleanAliases(input: unknown, name: string) {
  const list = Array.isArray(input) ? input : String(input || "").split(/[,，、\n]/);
  const seen = new Set<string>([normalizeName(name)]);
  const out: string[] = [];
  for (const raw of list) {
    const alias = String(raw || "").trim();
    const key = normalizeName(alias);
    if (!alias || seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}

function assertNameFree(name: string, aliases: string[], selfId: number | null) {
  const keys = new Set([name, ...aliases].map(normalizeName));
  for (const item of listItems({ includeInactive: true })) {
    if (item.id === selfId) continue;
    for (const n of [item.name, ...item.aliases]) {
      if (keys.has(normalizeName(n))) {
        throw new OpsError("ITEM_NAME_OR_ALIAS_CONFLICT", 409, { conflict_item_id: item.id, conflict_item_name: item.name, name: n });
      }
    }
  }
}

function writeUnits(itemId: number, units: ItemUnit[]) {
  db.prepare("DELETE FROM item_units WHERE item_id = ?").run(itemId);
  const ins = db.prepare("INSERT INTO item_units(item_id, unit, factor_to_base) VALUES (?, ?, ?)");
  for (const u of units) ins.run(itemId, u.unit, u.factor_to_base);
}

export function createItem(input: any, actor: Actor) {
  const name = String(input?.name || "").trim();
  const baseUnit = String(input?.base_unit || "").trim();
  if (!name) throw new OpsError("NAME_REQUIRED", 400);
  if (!baseUnit) throw new OpsError("BASE_UNIT_REQUIRED", 400);
  const aliases = cleanAliases(input?.aliases, name);
  const units = cleanUnits(input?.units, baseUnit);
  const run = db.transaction(() => {
    assertNameFree(name, aliases, null);
    const result = db.prepare(`
      INSERT INTO items(name, aliases_json, category, base_unit, default_supplier_id, storage_location, par_level, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      name,
      JSON.stringify(aliases),
      String(input?.category || "其他").trim() || "其他",
      baseUnit,
      num(input?.default_supplier_id),
      String(input?.storage_location || "干仓").trim() || "干仓",
      num(input?.par_level)
    );
    const id = Number(result.lastInsertRowid);
    writeUnits(id, units);
    return id;
  });
  const id = run();
  backfillItemIds();
  audit(actor, "ITEM_CREATE", "items", id, { name });
  return getItem(id)!;
}

export function updateItem(id: number, input: any, actor: Actor) {
  const current = getItem(id);
  if (!current) throw new OpsError("ITEM_NOT_FOUND", 404);
  const name = input?.name !== undefined ? String(input.name).trim() : current.name;
  if (!name) throw new OpsError("NAME_REQUIRED", 400);
  const baseUnit = input?.base_unit !== undefined ? String(input.base_unit).trim() : current.base_unit;
  if (!baseUnit) throw new OpsError("BASE_UNIT_REQUIRED", 400);
  const aliases = input?.aliases !== undefined ? cleanAliases(input.aliases, name) : cleanAliases(current.aliases, name);
  const units = input?.units !== undefined ? cleanUnits(input.units, baseUnit) : current.units.filter((u) => u.unit !== baseUnit);
  db.transaction(() => {
    assertNameFree(name, aliases, id);
    db.prepare(`
      UPDATE items SET name = ?, aliases_json = ?, category = ?, base_unit = ?, default_supplier_id = ?,
        storage_location = ?, par_level = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name,
      JSON.stringify(aliases),
      input?.category !== undefined ? String(input.category).trim() || "其他" : current.category,
      baseUnit,
      input?.default_supplier_id !== undefined ? num(input.default_supplier_id) : current.default_supplier_id,
      input?.storage_location !== undefined ? String(input.storage_location).trim() || "干仓" : current.storage_location,
      input?.par_level !== undefined ? num(input.par_level) : current.par_level,
      input?.is_active !== undefined ? (input.is_active ? 1 : 0) : current.is_active,
      id
    );
    writeUnits(id, units);
  })();
  backfillItemIds();
  audit(actor, "ITEM_UPDATE", "items", id, input);
  return getItem(id)!;
}

// ---------- name resolution ----------

export function buildNameIndex(items = listItems({ includeInactive: false })) {
  const index = new Map<string, number>();
  for (const item of items) {
    index.set(normalizeName(item.name), item.id);
    for (const alias of item.aliases) {
      const key = normalizeName(alias);
      if (!index.has(key)) index.set(key, item.id);
    }
  }
  return index;
}

export function resolveItemIdByName(name: string, index = buildNameIndex()): number | null {
  return index.get(normalizeName(name)) ?? null;
}

/** Fill item_id on free-text rows whose name now matches an item name/alias. */
export function backfillItemIds() {
  const index = buildNameIndex();
  const run = db.transaction(() => {
    for (const table of ["order_items", "daily_list_items"]) {
      const rows = db.prepare(`SELECT DISTINCT item_name FROM ${table} WHERE item_id IS NULL`).all() as Array<{ item_name: string }>;
      const upd = db.prepare(`UPDATE ${table} SET item_id = ? WHERE item_id IS NULL AND item_name = ?`);
      for (const r of rows) {
        const id = index.get(normalizeName(r.item_name));
        if (id) upd.run(id, r.item_name);
      }
    }
    db.exec(`
      UPDATE receiving_items SET item_id = (
        SELECT dli.item_id FROM daily_list_items dli WHERE dli.id = receiving_items.daily_list_item_id
      ) WHERE item_id IS NULL
    `);
  });
  run();
}

/** Distinct historical free-text names not yet linked to the item master. */
export function listItemCandidates() {
  const index = buildNameIndex(listItems({ includeInactive: true }));
  const rows = db.prepare(`
    SELECT item_name, unit, supplier_id, sp.name AS supplier_name, COUNT(*) AS uses, MAX(date) AS last_date
    FROM (
      SELECT oi.item_name, oi.unit, oi.supplier_id, oi.date FROM order_items oi WHERE oi.item_id IS NULL
      UNION ALL
      SELECT dli.item_name, dli.unit, dli.supplier_id, dl.date
      FROM daily_list_items dli JOIN daily_lists dl ON dl.id = dli.daily_list_id
      WHERE dli.item_id IS NULL
    ) x LEFT JOIN suppliers sp ON sp.id = x.supplier_id
    GROUP BY item_name, unit, supplier_id
    ORDER BY uses DESC
  `).all() as Array<{ item_name: string; unit: string; supplier_id: number; supplier_name: string | null; uses: number; last_date: string }>;

  const byName = new Map<string, {
    name: string;
    normalized: string;
    uses: number;
    last_date: string;
    units: string[];
    supplier_id: number | null;
    supplier_name: string | null;
    matched_item_id: number | null;
  }>();
  for (const r of rows) {
    const key = normalizeName(r.item_name);
    const existing = byName.get(key);
    if (existing) {
      existing.uses += r.uses;
      if (!existing.units.includes(r.unit)) existing.units.push(r.unit);
      if (r.last_date > existing.last_date) existing.last_date = r.last_date;
    } else {
      byName.set(key, {
        name: r.item_name.trim(),
        normalized: key,
        uses: r.uses,
        last_date: r.last_date,
        units: [r.unit],
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name,
        matched_item_id: index.get(key) ?? null
      });
    }
  }
  return Array.from(byName.values()).sort((a, b) => b.uses - a.uses);
}

/** Free-text order lines (typed ad-hoc on /order) waiting to be merged into the item master. */
export function listPendingMerge() {
  return listItemCandidates().filter((c) => !c.matched_item_id);
}

export function importCandidates(rows: any[], actor: Actor) {
  if (!Array.isArray(rows) || rows.length === 0) throw new OpsError("ROWS_REQUIRED", 400);
  const created: Item[] = [];
  for (const row of rows) {
    const name = String(row?.name || "").trim();
    if (!name) continue;
    const baseUnit = String(row?.base_unit || "").trim() || "个";
    created.push(createItem({ ...row, name, base_unit: baseUnit }, actor));
  }
  return created;
}

/** Attach free-text names as aliases of an item and backfill history. */
export function mergeNamesIntoItem(itemId: number, names: string[], actor: Actor) {
  const item = getItem(itemId);
  if (!item) throw new OpsError("ITEM_NOT_FOUND", 404);
  const aliases = [...item.aliases, ...names.map((n) => String(n || "").trim()).filter(Boolean)];
  const updated = updateItem(itemId, { aliases }, actor);
  const run = db.transaction(() => {
    const upOrder = db.prepare("UPDATE order_items SET item_id = ? WHERE item_name = ?");
    const upDaily = db.prepare("UPDATE daily_list_items SET item_id = ? WHERE item_name = ?");
    for (const n of names) {
      upOrder.run(itemId, n);
      upDaily.run(itemId, n);
    }
  });
  run();
  backfillItemIds();
  audit(actor, "ITEM_MERGE_NAMES", "items", itemId, { names });
  return updated;
}

/** Merge a duplicate item into target: aliases + history move to target, source is deactivated. */
export function mergeItems(sourceId: number, targetId: number, actor: Actor) {
  if (sourceId === targetId) throw new OpsError("SAME_ITEM", 400);
  const source = getItem(sourceId);
  const target = getItem(targetId);
  if (!source || !target) throw new OpsError("ITEM_NOT_FOUND", 404);
  const usedInStocktake = db.prepare(`
    SELECT COUNT(*) AS n FROM stocktake_lines a JOIN stocktake_lines b ON a.stocktake_id = b.stocktake_id
    WHERE a.item_id = ? AND b.item_id = ?
  `).get(sourceId, targetId) as { n: number };
  if (usedInStocktake.n > 0) throw new OpsError("BOTH_ITEMS_IN_SAME_STOCKTAKE", 409);
  db.transaction(() => {
    db.prepare("UPDATE items SET aliases_json = '[]', is_active = 0, name = name || ' (已合并#' || id || ')', updated_at = datetime('now') WHERE id = ?").run(sourceId);
    for (const table of ["order_items", "daily_list_items", "receiving_items", "discrepancies", "stocktake_lines"]) {
      db.prepare(`UPDATE ${table} SET item_id = ? WHERE item_id = ?`).run(targetId, sourceId);
    }
  })();
  const merged = updateItem(targetId, { aliases: [...target.aliases, source.name, ...source.aliases] }, actor);
  audit(actor, "ITEM_MERGE", "items", targetId, { source_id: sourceId });
  return merged;
}

// ---------- unit conversion (item aware) ----------

export { factorToBase, convertQuantity, convertPrice } from "@/lib/ops/unit-math";

// ---------- price history ----------

export type PricePoint = {
  date: string;
  supplier_id: number;
  supplier_name: string;
  item_name: string;
  unit: string;
  unit_price: number;
  base_unit_price: number | null;
  accepted_quantity: number;
  receiving_item_id: number;
};

export function getPriceHistory(itemId: number, opts: { asOf?: string; limit?: number; beforeDate?: string } = {}): PricePoint[] {
  const item = getItem(itemId);
  if (!item) return [];
  const rows = db.prepare(`
    SELECT dl.date, dli.supplier_id, sp.name AS supplier_name, dli.item_name, dli.unit, ri.unit_price, ri.id AS receiving_item_id,
           COALESCE(ri.received_quantity, CAST(dli.total_quantity AS REAL)) - COALESCE(ri.rejected_quantity, 0) AS accepted_quantity
    FROM receiving_items ri
    JOIN daily_list_items dli ON dli.id = ri.daily_list_item_id
    JOIN daily_lists dl ON dl.id = dli.daily_list_id
    JOIN suppliers sp ON sp.id = dli.supplier_id
    WHERE COALESCE(ri.item_id, dli.item_id) = ?
      AND ri.unit_price IS NOT NULL
      AND ri.quality_ok = 1
      AND dl.date <= ?
      AND dl.date < ?
    ORDER BY dl.date DESC, ri.received_at DESC, ri.id DESC
    LIMIT ?
  `).all(itemId, opts.asOf || "9999-12-31", opts.beforeDate || "9999-12-32", opts.limit ?? 200) as Array<Omit<PricePoint, "base_unit_price">>;
  return rows
    .filter((r) => r.accepted_quantity > 0)
    .map((r) => {
      const f = factorToBase(item, r.unit);
      return { ...r, base_unit_price: f ? round4(r.unit_price / f) : null };
    });
}

/** Latest qualified purchase price for the item, per base unit, as of a date (inclusive). */
export function getLatestBasePrice(itemId: number, asOf?: string) {
  const history = getPriceHistory(itemId, { asOf, limit: 50 });
  const hit = history.find((p) => p.base_unit_price !== null);
  return hit ? { base_unit_price: hit.base_unit_price as number, date: hit.date, supplier_name: hit.supplier_name } : null;
}
