import { generateDailyListSnapshot } from "@/lib/db";
import { callQwenJson, resolveQwenModel } from "@/lib/qwen";
import { receivingInvoicePrompt } from "@/lib/prompts";
import { normalizeUnitAlias } from "@/lib/unit-convert";
import {
  db,
  OpsError,
  audit,
  getOpsConfig,
  nameSimilarity,
  normalizeName,
  num,
  round2,
  round4
} from "@/lib/ops/common";
import type { Actor } from "@/lib/ops/common";
import {
  buildNameIndex,
  convertPrice,
  convertQuantity,
  factorToBase,
  getItem,
  listItems,
  resolveItemIdByName
} from "@/lib/ops/items";
import type { Item } from "@/lib/ops/items";
import { saveReceivingUpload } from "@/lib/ops/uploads";

export type SupplierOrderStatus = "PENDING_SEND" | "SENT" | "PARTIAL" | "RECEIVED" | "REVIEWED";
const STATUS_RANK: Record<SupplierOrderStatus, number> = { PENDING_SEND: 0, SENT: 1, PARTIAL: 2, RECEIVED: 3, REVIEWED: 4 };

export type OcrItem = {
  name: string;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  amount: number | null;
};

export type OcrResult = {
  supplier_name: string | null;
  date: string | null;
  items: OcrItem[];
  total: number | null;
};

type ListItemRow = {
  id: number;
  supplier_id: number;
  item_name: string;
  unit: string;
  total_quantity: string;
  item_id: number | null;
  is_extra: number;
  receiving_item_id: number | null;
  received_quantity: number | null;
  rejected_quantity: number | null;
  reject_reason: string | null;
  quality_ok: number | null;
  unit_price: number | null;
  input_unit_price: number | null;
  price_unit: string | null;
  receive_note: string | null;
  problem_photo_file_id: number | null;
  received_by: string | null;
  received_at: string | null;
  ocr_name: string | null;
  ocr_quantity: number | null;
  ocr_unit: string | null;
  ocr_unit_price: number | null;
  match_status: string | null;
  reference_unit_price: number | null;
};

function toQty(value: string | number | null | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Daily list / supplier order state
// ---------------------------------------------------------------------------

function getList(date: string) {
  return db.prepare("SELECT id, date, receiving_locked_at, reviewed_by FROM daily_lists WHERE date = ?").get(date) as
    | { id: number; date: string; receiving_locked_at: string | null; reviewed_by: string | null }
    | undefined;
}

function ensureList(date: string) {
  generateDailyListSnapshot(date);
  let list = getList(date);
  if (!list) {
    db.prepare("INSERT OR IGNORE INTO daily_lists(date) VALUES (?)").run(date);
    list = getList(date)!;
  }
  return list;
}

/** Snapshot the day and make sure every supplier with lines has a supplier_orders row. */
export function ensureSupplierOrders(date: string) {
  const list = ensureList(date);
  db.prepare(`
    INSERT OR IGNORE INTO supplier_orders(date, supplier_id, status)
    SELECT DISTINCT ?, dli.supplier_id, 'PENDING_SEND' FROM daily_list_items dli WHERE dli.daily_list_id = ?
  `).run(date, list.id);
  return list;
}

function getSupplierOrder(date: string, supplierId: number) {
  return db.prepare("SELECT * FROM supplier_orders WHERE date = ? AND supplier_id = ?").get(date, supplierId) as any;
}

function ensureSupplierOrder(date: string, supplierId: number) {
  db.prepare("INSERT OR IGNORE INTO supplier_orders(date, supplier_id, status) VALUES (?, ?, 'PENDING_SEND')").run(date, supplierId);
  return getSupplierOrder(date, supplierId);
}

function assertSupplier(supplierId: number) {
  const row = db.prepare("SELECT id, name FROM suppliers WHERE id = ?").get(supplierId) as { id: number; name: string } | undefined;
  if (!row) throw new OpsError("INVALID_SUPPLIER", 400);
  return row;
}

export function markSent(date: string, supplierIds: number[], actor: Actor) {
  ensureSupplierOrders(date);
  const updated: number[] = [];
  const run = db.transaction(() => {
    for (const supplierId of supplierIds) {
      assertSupplier(supplierId);
      const order = ensureSupplierOrder(date, supplierId);
      if (STATUS_RANK[order.status as SupplierOrderStatus] >= STATUS_RANK.SENT) continue;
      db.prepare(`
        UPDATE supplier_orders SET status = 'SENT', sent_at = datetime('now'), sent_by = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(actor.name, order.id);
      updated.push(supplierId);
    }
  });
  run();
  audit(actor, "SUPPLIER_ORDER_SENT", "supplier_orders", date, { supplier_ids: updated });
  return { updated };
}

function listItemsForSupplier(listId: number, supplierId: number): ListItemRow[] {
  return db.prepare(`
    SELECT dli.id, dli.supplier_id, dli.item_name, dli.unit, dli.total_quantity, dli.item_id, dli.is_extra,
           ri.id AS receiving_item_id, ri.received_quantity, ri.rejected_quantity, ri.reject_reason, ri.quality_ok,
           ri.unit_price, ri.input_unit_price, ri.price_unit, ri.receive_note, ri.problem_photo_file_id,
           ri.received_by, ri.received_at, ri.ocr_name, ri.ocr_quantity, ri.ocr_unit, ri.ocr_unit_price,
           ri.match_status, ri.reference_unit_price
    FROM daily_list_items dli
    LEFT JOIN receiving_items ri ON ri.daily_list_item_id = dli.id
    WHERE dli.daily_list_id = ? AND dli.supplier_id = ?
    ORDER BY dli.is_extra ASC, dli.id ASC
  `).all(listId, supplierId) as ListItemRow[];
}

/** Received qty for a receiving row; legacy rows (no received_quantity) fall back to the ordered qty when quality was OK. */
export function effectiveReceived(row: { received_quantity: number | null; total_quantity: string; quality_ok: number | null }) {
  if (row.received_quantity !== null && row.received_quantity !== undefined) return row.received_quantity;
  return row.quality_ok === 1 ? toQty(row.total_quantity) : 0;
}

export function effectiveAccepted(row: { received_quantity: number | null; rejected_quantity: number | null; total_quantity: string; quality_ok: number | null }) {
  if (row.received_quantity === null || row.received_quantity === undefined) {
    return row.quality_ok === 1 ? toQty(row.total_quantity) : 0;
  }
  return Math.max(0, row.received_quantity - (row.rejected_quantity || 0));
}

export function getDayBoard(date: string) {
  const list = ensureSupplierOrders(date);
  const orders = db.prepare(`
    SELECT so.*, sp.name AS supplier_name
    FROM supplier_orders so JOIN suppliers sp ON sp.id = so.supplier_id
    WHERE so.date = ?
    ORDER BY sp.id
  `).all(date) as any[];
  const suppliers = orders.map((order) => {
    const lines = listItemsForSupplier(list.id, order.supplier_id);
    const ordered = lines.filter((l) => !l.is_extra);
    const receivedLines = lines.filter((l) => l.receiving_item_id);
    const missing = ordered.filter((l) => !l.receiving_item_id || effectiveReceived({ ...l }) <= 0);
    const openDiscrepancies = (db.prepare(`
      SELECT COUNT(*) AS n FROM discrepancies WHERE supplier_id = ? AND date = ? AND status = 'OPEN'
    `).get(order.supplier_id, date) as { n: number }).n;
    const acceptedTotal = lines.reduce((sum, l) => sum + (l.receiving_item_id && l.unit_price !== null ? effectiveAccepted(l) * l.unit_price : 0), 0);
    return {
      supplier_id: order.supplier_id,
      supplier_name: order.supplier_name,
      status: order.status as SupplierOrderStatus,
      sent_at: order.sent_at,
      sent_by: order.sent_by,
      received_at: order.received_at,
      received_by: order.received_by,
      reviewed_at: order.reviewed_at,
      reviewed_by: order.reviewed_by,
      has_discrepancy: order.has_discrepancy === 1,
      invoice_total: order.invoice_total,
      system_total: order.system_total,
      accepted_total: round2(acceptedTotal),
      line_count: ordered.length,
      received_line_count: receivedLines.length,
      missing_items: order.status === "PENDING_SEND" || order.status === "SENT"
        ? ordered.map((l) => l.item_name)
        : missing.map((l) => l.item_name),
      open_discrepancies: openDiscrepancies
    };
  });
  const allReceived = suppliers.length > 0 && suppliers.every((s) => s.status === "RECEIVED" || s.status === "REVIEWED");
  return {
    date,
    is_locked: Boolean(list.receiving_locked_at),
    locked_at: list.receiving_locked_at,
    reviewed_by: list.reviewed_by,
    all_received: allReceived,
    open_discrepancies_total: suppliers.reduce((s, x) => s + x.open_discrepancies, 0),
    suppliers,
    lock_logs: db.prepare("SELECT * FROM receiving_lock_logs WHERE date = ? ORDER BY id DESC").all(date)
  };
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

function normalizeOcr(raw: any): OcrResult {
  const items = Array.isArray(raw?.items) ? raw.items : [];
  return {
    supplier_name: raw?.supplier_name ? String(raw.supplier_name).trim() : null,
    date: raw?.date ? String(raw.date).trim() : null,
    total: num(raw?.total),
    items: items
      .map((it: any) => ({
        name: String(it?.name || "").trim(),
        quantity: num(typeof it?.quantity === "string" ? it.quantity.replace(/[^\d.\-]/g, "") : it?.quantity),
        unit: String(it?.unit || "").trim(),
        unit_price: num(typeof it?.unit_price === "string" ? it.unit_price.replace(/[^\d.\-]/g, "") : it?.unit_price),
        amount: num(typeof it?.amount === "string" ? it.amount.replace(/[^\d.\-]/g, "") : it?.amount)
      }))
      .filter((it: OcrItem) => it.name)
  };
}

export async function scanInvoice(input: {
  date: string;
  supplier_id: number;
  image_base64: string;
  file_name?: string;
  mime_type?: string;
  mock_ocr?: unknown;
}, actor: Actor) {
  assertSupplier(input.supplier_id);
  const saved = saveReceivingUpload({
    date: input.date,
    supplier_id: input.supplier_id,
    image_base64: input.image_base64,
    file_name: input.file_name,
    mime_type: input.mime_type,
    kind: "INVOICE",
    created_by: actor.name
  });

  let ocr: OcrResult | null = null;
  let ocrError: string | null = null;
  const config = getOpsConfig();
  try {
    if (config.ocrMockEnabled && input.mock_ocr) {
      ocr = normalizeOcr(input.mock_ocr);
    } else {
      const raw = await callQwenJson({
        model: resolveQwenModel("vision"),
        systemPrompt: receivingInvoicePrompt,
        imageBase64: saved.base64,
        userText: "请识别此来货单的每一行商品。",
        timeoutMs: 60000,
        retryTimes: 1
      });
      ocr = normalizeOcr(raw);
    }
  } catch (error: any) {
    ocrError = String(error?.message || "OCR_FAILED");
  }

  db.prepare("UPDATE receiving_scan_files SET ocr_json = ?, ocr_status = ? WHERE id = ?")
    .run(ocr ? JSON.stringify(ocr) : null, ocr ? "OK" : "FAILED", saved.id);
  audit(actor, "RECEIVING_SCAN", "receiving_scan_files", saved.id, { date: input.date, supplier_id: input.supplier_id, ocr_error: ocrError });
  return { scan_file_id: saved.id, file_url: saved.file_url, ocr, ocr_error: ocrError };
}

export function uploadProblemPhoto(input: { date: string; supplier_id: number | null; image_base64: string; file_name?: string; mime_type?: string }, actor: Actor) {
  const saved = saveReceivingUpload({ ...input, kind: "PROBLEM", created_by: actor.name });
  return { file_id: saved.id, file_url: saved.file_url };
}

export function deleteScan(scanId: number, actor: Actor) {
  const scan = db.prepare("SELECT id, service_date, supplier_id FROM receiving_scan_files WHERE id = ?").get(scanId) as any;
  if (!scan) throw new OpsError("SCAN_NOT_FOUND", 404);
  const list = getList(scan.service_date);
  if (list?.receiving_locked_at) throw new OpsError("DAILY_LIST_LOCKED", 409);
  // keep the file for audit, just drop its OCR contribution
  db.prepare("UPDATE receiving_scan_files SET ocr_status = 'IGNORED' WHERE id = ?").run(scanId);
  audit(actor, "RECEIVING_SCAN_IGNORE", "receiving_scan_files", scanId);
  return { ok: true };
}

function listScans(date: string, supplierId: number) {
  return db.prepare(`
    SELECT id, service_date, supplier_id, kind, original_filename, file_url, ocr_status, ocr_json, created_by, created_at
    FROM receiving_scan_files
    WHERE service_date = ? AND supplier_id = ?
    ORDER BY id ASC
  `).all(date, supplierId) as Array<{
    id: number; service_date: string; supplier_id: number; kind: string; original_filename: string; file_url: string;
    ocr_status: string | null; ocr_json: string | null; created_by: string | null; created_at: string;
  }>;
}

// ---------------------------------------------------------------------------
// Comparison (OCR vs ordered)
// ---------------------------------------------------------------------------

export type CompareStatus = "MATCH" | "QTY_DIFF" | "MISSING" | "EXTRA" | "UNIT_MISMATCH" | "NO_OCR";

type OcrLine = OcrItem & { key: string; scan_file_id: number };

/** Reference price per `unit` for the item (last accepted receiving strictly before `date`). */
export function referencePrice(opts: { item: Item | null; item_name: string; unit: string; supplier_id: number; date: string }) {
  if (opts.item) {
    const rows = db.prepare(`
      SELECT dli.unit, ri.unit_price, dl.date
      FROM receiving_items ri
      JOIN daily_list_items dli ON dli.id = ri.daily_list_item_id
      JOIN daily_lists dl ON dl.id = dli.daily_list_id
      WHERE COALESCE(ri.item_id, dli.item_id) = ? AND ri.unit_price IS NOT NULL AND ri.quality_ok = 1 AND dl.date < ?
      ORDER BY dl.date DESC, ri.id DESC LIMIT 20
    `).all(opts.item.id, opts.date) as Array<{ unit: string; unit_price: number; date: string }>;
    for (const r of rows) {
      const perBase = factorToBase(opts.item, r.unit);
      const target = factorToBase(opts.item, opts.unit);
      if (perBase && target) return round4((r.unit_price / perBase) * target);
    }
    return null;
  }
  const row = db.prepare(`
    SELECT ri.unit_price FROM receiving_items ri
    JOIN daily_list_items dli ON dli.id = ri.daily_list_item_id
    JOIN daily_lists dl ON dl.id = dli.daily_list_id
    WHERE dli.supplier_id = ? AND dli.item_name = ? AND dli.unit = ? AND ri.unit_price IS NOT NULL AND ri.quality_ok = 1 AND dl.date < ?
    ORDER BY dl.date DESC, ri.id DESC LIMIT 1
  `).get(opts.supplier_id, opts.item_name, opts.unit, opts.date) as { unit_price: number } | undefined;
  return row ? row.unit_price : null;
}

export function buildComparison(date: string, supplierId: number) {
  const list = ensureSupplierOrders(date);
  const lines = listItemsForSupplier(list.id, supplierId);
  const scans = listScans(date, supplierId);
  const itemsById = new Map<number, Item>();
  for (const it of listItems({ includeInactive: true })) itemsById.set(it.id, it);
  const nameIndex = buildNameIndex();
  const threshold = getOpsConfig().priceDeviationThreshold;

  const ocrLines: OcrLine[] = [];
  let invoiceTotalFromOcr: number | null = null;
  for (const scan of scans) {
    if (scan.kind !== "INVOICE" || scan.ocr_status !== "OK" || !scan.ocr_json) continue;
    const parsed = JSON.parse(scan.ocr_json) as OcrResult;
    parsed.items.forEach((it, idx) => ocrLines.push({ ...it, key: `ocr:${scan.id}:${idx}`, scan_file_id: scan.id }));
    if (parsed.total !== null && parsed.total !== undefined) invoiceTotalFromOcr = round2((invoiceTotalFromOcr || 0) + parsed.total);
  }
  const hasOcr = ocrLines.length > 0;

  // score every (ocr, list line) pair, then greedy assign best-first
  type Pair = { o: number; l: number; score: number };
  const pairs: Pair[] = [];
  ocrLines.forEach((o, oi) => {
    const ocrItemId = nameIndex.get(normalizeName(o.name)) ?? null;
    lines.forEach((l, li) => {
      let score = nameSimilarity(o.name, l.item_name);
      if (ocrItemId && l.item_id && ocrItemId === l.item_id) score = Math.max(score, 0.95);
      const item = l.item_id ? itemsById.get(l.item_id) : undefined;
      if (item) {
        for (const alias of item.aliases) score = Math.max(score, nameSimilarity(o.name, alias));
      }
      if (score >= 0.5) pairs.push({ o: oi, l: li, score });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const ocrToLine = new Map<number, { l: number; score: number }>();
  const lineToOcr = new Map<number, number[]>();
  for (const p of pairs) {
    if (ocrToLine.has(p.o)) continue;
    // a list line may take several OCR rows only if they are the exact same normalised name
    const taken = lineToOcr.get(p.l) || [];
    if (taken.length > 0 && normalizeName(ocrLines[taken[0]].name) !== normalizeName(ocrLines[p.o].name)) continue;
    ocrToLine.set(p.o, { l: p.l, score: p.score });
    lineToOcr.set(p.l, [...taken, p.o]);
  }

  const rows = lines.map((l, li) => {
    const item = l.item_id ? itemsById.get(l.item_id) || null : null;
    const matched = (lineToOcr.get(li) || []).map((oi) => ocrLines[oi]);
    const ordered = l.is_extra ? 0 : toQty(l.total_quantity);
    let ocrQty: number | null = null;
    let ocrPrice: number | null = null;
    let unitMismatch = false;
    for (const m of matched) {
      if (m.quantity === null) continue;
      const q = m.unit ? convertQuantity(item, m.quantity, normalizeUnitAlias(m.unit), l.unit) : m.quantity;
      if (q === null) {
        unitMismatch = true;
        continue;
      }
      ocrQty = round4((ocrQty || 0) + q);
      if (m.unit_price !== null) {
        const p = m.unit ? convertPrice(item, m.unit_price, normalizeUnitAlias(m.unit), l.unit) : m.unit_price;
        if (p !== null) ocrPrice = round4(p);
      }
    }
    const refPrice = referencePrice({ item, item_name: l.item_name, unit: l.unit, supplier_id: supplierId, date });
    const candidatePrice = ocrPrice ?? l.unit_price ?? null;
    const deviation = refPrice && candidatePrice !== null ? round4((candidatePrice - refPrice) / refPrice) : null;

    let status: CompareStatus;
    if (!hasOcr) status = "NO_OCR";
    else if (matched.length === 0) status = "MISSING";
    else if (unitMismatch && ocrQty === null) status = "UNIT_MISMATCH";
    else if (l.is_extra) status = "EXTRA";
    else if (ocrQty !== null && Math.abs(ocrQty - ordered) < 1e-6) status = "MATCH";
    else status = "QTY_DIFF";

    const suggestedReceived = l.receiving_item_id
      ? effectiveReceived(l)
      : hasOcr
        ? (ocrQty ?? 0)
        : ordered;
    return {
      key: `dli:${l.id}`,
      daily_list_item_id: l.id,
      item_id: l.item_id,
      item_name: l.item_name,
      unit: l.unit,
      base_unit: item?.base_unit || null,
      ordered_quantity: ordered,
      is_extra: l.is_extra === 1,
      ocr_lines: matched.map((m) => ({ key: m.key, name: m.name, quantity: m.quantity, unit: m.unit, unit_price: m.unit_price, amount: m.amount, scan_file_id: m.scan_file_id })),
      ocr_quantity: ocrQty,
      ocr_unit_price: ocrPrice,
      reference_unit_price: refPrice,
      price_deviation: deviation,
      price_flag: deviation !== null && Math.abs(deviation) > threshold,
      status,
      suggested_received_quantity: suggestedReceived,
      suggested_unit_price: l.receiving_item_id ? (l.input_unit_price ?? l.unit_price) : (ocrPrice ?? refPrice),
      suggested_price_unit: l.receiving_item_id ? (l.price_unit || l.unit) : l.unit,
      receiving: l.receiving_item_id
        ? {
            receiving_item_id: l.receiving_item_id,
            received_quantity: effectiveReceived(l),
            rejected_quantity: l.rejected_quantity || 0,
            reject_reason: l.reject_reason,
            unit_price: l.unit_price,
            input_unit_price: l.input_unit_price,
            price_unit: l.price_unit,
            receive_note: l.receive_note,
            problem_photo_file_id: l.problem_photo_file_id,
            received_by: l.received_by,
            received_at: l.received_at,
            match_status: l.match_status
          }
        : null
    };
  });

  const extras = ocrLines
    .map((o, oi) => ({ o, oi }))
    .filter(({ oi }) => !ocrToLine.has(oi))
    .map(({ o }) => {
      const itemId = resolveItemIdByName(o.name, nameIndex);
      const item = itemId ? itemsById.get(itemId) || null : null;
      const unit = o.unit ? normalizeUnitAlias(o.unit) : item?.base_unit || "";
      const refPrice = unit ? referencePrice({ item, item_name: item?.name || o.name, unit, supplier_id: supplierId, date }) : null;
      const deviation = refPrice && o.unit_price !== null ? round4((o.unit_price - refPrice) / refPrice) : null;
      return {
        key: o.key,
        daily_list_item_id: null,
        item_id: itemId,
        item_name: item?.name || o.name,
        ocr_name: o.name,
        unit,
        ordered_quantity: 0,
        is_extra: true,
        ocr_lines: [{ key: o.key, name: o.name, quantity: o.quantity, unit: o.unit, unit_price: o.unit_price, amount: o.amount, scan_file_id: o.scan_file_id }],
        ocr_quantity: o.quantity,
        ocr_unit_price: o.unit_price,
        reference_unit_price: refPrice,
        price_deviation: deviation,
        price_flag: deviation !== null && Math.abs(deviation) > threshold,
        status: "EXTRA" as CompareStatus,
        suggested_received_quantity: o.quantity ?? 0,
        suggested_unit_price: o.unit_price,
        suggested_price_unit: unit
      };
    });

  const ocrComputedTotal = round2(ocrLines.reduce((s, o) => s + (o.amount ?? ((o.quantity ?? 0) * (o.unit_price ?? 0))), 0));
  const order = ensureSupplierOrder(date, supplierId);
  return {
    date,
    supplier_id: supplierId,
    is_locked: Boolean(list.receiving_locked_at),
    order,
    has_ocr: hasOcr,
    price_deviation_threshold: threshold,
    invoice_total_ocr: invoiceTotalFromOcr,
    ocr_computed_total: ocrComputedTotal,
    rows,
    extras,
    scans: scans.map(({ ocr_json, ...rest }) => ({ ...rest, ocr: ocr_json ? JSON.parse(ocr_json) : null })),
    discrepancies: db.prepare(`
      SELECT * FROM discrepancies WHERE (supplier_id = ? AND date = ?) OR related_receiving_item_id IN (
        SELECT ri.id FROM receiving_items ri JOIN daily_list_items dli ON dli.id = ri.daily_list_item_id
        WHERE dli.daily_list_id = ? AND dli.supplier_id = ?
      ) ORDER BY id
    `).all(supplierId, date, list.id, supplierId)
  };
}

// ---------------------------------------------------------------------------
// Confirm receiving (per supplier)
// ---------------------------------------------------------------------------

export type ConfirmLine = {
  daily_list_item_id?: number | null;
  item_id?: number | null;
  item_name?: string;
  unit?: string;
  received_quantity: number;
  rejected_quantity?: number;
  reject_reason?: string;
  input_unit_price?: number | null;
  price_unit?: string | null;
  receive_note?: string;
  problem_photo_file_id?: number | null;
  scan_file_id?: number | null;
  ocr_name?: string | null;
  ocr_quantity?: number | null;
  ocr_unit?: string | null;
  ocr_unit_price?: number | null;
  match_status?: string | null;
  resolves_discrepancy_id?: number | null;
};

const AUTO_TYPES = ["SHORT", "REJECT_ON_SITE", "OVER_DELIVERY", "PRICE_MISMATCH"] as const;

function regenerateAutoDiscrepancies(input: {
  date: string;
  supplier_id: number;
  receiving_item_id: number;
  daily_list_item_id: number;
  item_id: number | null;
  item_name: string;
  unit: string;
  ordered: number;
  received: number;
  rejected: number;
  reject_reason: string | null;
  unit_price: number | null;
  reference_price: number | null;
  photo_file_id: number | null;
  actor: Actor;
}) {
  const threshold = getOpsConfig().priceDeviationThreshold;
  db.prepare("DELETE FROM discrepancies WHERE receiving_item_id = ? AND source = 'AUTO' AND status = 'OPEN'").run(input.receiving_item_id);
  const closedTypes = new Set(
    (db.prepare("SELECT type FROM discrepancies WHERE receiving_item_id = ? AND source = 'AUTO' AND status <> 'OPEN'").all(input.receiving_item_id) as Array<{ type: string }>)
      .map((r) => r.type)
  );
  const price = input.unit_price;
  const accepted = Math.max(0, input.received - input.rejected);
  const wanted: Array<{ type: typeof AUTO_TYPES[number]; quantity: number; amount: number; reason: string | null; expected?: number | null }> = [];
  if (input.received < input.ordered - 1e-9) {
    const q = round4(input.ordered - input.received);
    wanted.push({ type: "SHORT", quantity: q, amount: round2(q * (price ?? input.reference_price ?? 0)), reason: input.received === 0 ? "未到货" : "短斤/少送" });
  }
  if (input.rejected > 0) {
    wanted.push({ type: "REJECT_ON_SITE", quantity: round4(input.rejected), amount: round2(input.rejected * (price ?? 0)), reason: input.reject_reason });
  }
  if (input.received > input.ordered + 1e-9) {
    const q = round4(input.received - input.ordered);
    wanted.push({ type: "OVER_DELIVERY", quantity: q, amount: round2(q * (price ?? 0)), reason: input.ordered === 0 ? "未下单多送" : "多送" });
  }
  if (price !== null && input.reference_price && Math.abs(price - input.reference_price) / input.reference_price > threshold && accepted > 0) {
    wanted.push({
      type: "PRICE_MISMATCH",
      quantity: round4(accepted),
      amount: round2((price - input.reference_price) * accepted),
      reason: `单价 ${price} 与上次 ${input.reference_price} 偏差 ${Math.round(((price - input.reference_price) / input.reference_price) * 100)}%，按报价入账待确认`,
      expected: input.reference_price
    });
  }
  const ins = db.prepare(`
    INSERT INTO discrepancies(date, effective_date, supplier_id, receiving_item_id, daily_list_item_id, item_id, item_name, unit, type,
      status, quantity, unit_price, expected_unit_price, amount, adjustment_amount, reason, photo_file_id, source, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, 0, ?, ?, 'AUTO', ?)
  `);
  for (const w of wanted) {
    if (closedTypes.has(w.type)) continue;
    ins.run(
      input.date, input.date, input.supplier_id, input.receiving_item_id, input.daily_list_item_id, input.item_id, input.item_name, input.unit,
      w.type, w.quantity, price, w.expected ?? null, w.amount, w.reason, w.type === "REJECT_ON_SITE" ? input.photo_file_id : null, input.actor.name
    );
  }
}

export function confirmReceiving(input: {
  date: string;
  supplier_id: number;
  lines: ConfirmLine[];
  invoice_total?: number | null;
  invoice_note?: string | null;
  complete?: boolean;
}, actor: Actor) {
  const supplier = assertSupplier(input.supplier_id);
  if (!Array.isArray(input.lines)) throw new OpsError("LINES_REQUIRED", 400);
  const list = ensureSupplierOrders(input.date);
  if (list.receiving_locked_at) throw new OpsError("DAILY_LIST_LOCKED", 409);

  const itemsById = new Map<number, Item>();
  for (const it of listItems({ includeInactive: true })) itemsById.set(it.id, it);
  const nameIndex = buildNameIndex();

  const getLine = db.prepare("SELECT id, supplier_id, daily_list_id, item_name, unit, total_quantity, item_id, is_extra FROM daily_list_items WHERE id = ?");
  const findExtra = db.prepare("SELECT id FROM daily_list_items WHERE daily_list_id = ? AND supplier_id = ? AND item_name = ? AND unit = ? LIMIT 1");
  const insertExtra = db.prepare(`
    INSERT INTO daily_list_items(daily_list_id, supplier_id, item_name, unit, total_quantity, source_count, item_id, is_extra)
    VALUES (?, ?, ?, ?, '0', 0, ?, 1)
  `);
  const upsert = db.prepare(`
    INSERT INTO receiving_items(
      daily_list_item_id, quality_ok, unit_price, input_unit_price, price_unit, scan_file_id, receive_note, is_auto_recognized, received_at,
      item_id, received_quantity, rejected_quantity, reject_reason, problem_photo_file_id, ocr_name, ocr_quantity, ocr_unit, ocr_unit_price,
      match_status, reference_unit_price, received_by, received_by_staff_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(daily_list_item_id) DO UPDATE SET
      quality_ok = excluded.quality_ok,
      unit_price = excluded.unit_price,
      input_unit_price = excluded.input_unit_price,
      price_unit = excluded.price_unit,
      scan_file_id = COALESCE(excluded.scan_file_id, receiving_items.scan_file_id),
      receive_note = excluded.receive_note,
      is_auto_recognized = excluded.is_auto_recognized,
      received_at = datetime('now'),
      item_id = excluded.item_id,
      received_quantity = excluded.received_quantity,
      rejected_quantity = excluded.rejected_quantity,
      reject_reason = excluded.reject_reason,
      problem_photo_file_id = COALESCE(excluded.problem_photo_file_id, receiving_items.problem_photo_file_id),
      ocr_name = COALESCE(excluded.ocr_name, receiving_items.ocr_name),
      ocr_quantity = COALESCE(excluded.ocr_quantity, receiving_items.ocr_quantity),
      ocr_unit = COALESCE(excluded.ocr_unit, receiving_items.ocr_unit),
      ocr_unit_price = COALESCE(excluded.ocr_unit_price, receiving_items.ocr_unit_price),
      match_status = excluded.match_status,
      reference_unit_price = excluded.reference_unit_price,
      received_by = excluded.received_by,
      received_by_staff_id = excluded.received_by_staff_id
  `);
  const getReceivingId = db.prepare("SELECT id FROM receiving_items WHERE daily_list_item_id = ?");

  const run = db.transaction(() => {
    const touched = new Set<number>();
    const results: Array<{ daily_list_item_id: number; receiving_item_id: number }> = [];

    const processLine = (line: ConfirmLine) => {
      let dli: any;
      if (line.daily_list_item_id) {
        dli = getLine.get(Number(line.daily_list_item_id));
        if (!dli || dli.daily_list_id !== list.id || dli.supplier_id !== input.supplier_id) {
          throw new OpsError("INVALID_DAILY_LIST_ITEM", 400, { daily_list_item_id: line.daily_list_item_id });
        }
      } else {
        const name = String(line.item_name || "").trim();
        const itemId = num(line.item_id) ?? resolveItemIdByName(name, nameIndex);
        const item = itemId ? itemsById.get(itemId) : undefined;
        const unit = String(line.unit || "").trim() || item?.base_unit || "";
        const finalName = item?.name || name;
        if (!finalName || !unit) throw new OpsError("EXTRA_LINE_NEEDS_NAME_AND_UNIT", 400);
        const existing = findExtra.get(list.id, input.supplier_id, finalName, unit) as { id: number } | undefined;
        const id = existing ? existing.id : Number(insertExtra.run(list.id, input.supplier_id, finalName, unit, itemId ?? null).lastInsertRowid);
        dli = getLine.get(id);
      }
      if (touched.has(dli.id)) throw new OpsError("DUPLICATE_LINE", 400, { daily_list_item_id: dli.id });
      touched.add(dli.id);

      const itemId: number | null = dli.item_id ?? resolveItemIdByName(dli.item_name, nameIndex);
      if (itemId && !dli.item_id) db.prepare("UPDATE daily_list_items SET item_id = ? WHERE id = ?").run(itemId, dli.id);
      const item = itemId ? itemsById.get(itemId) || null : null;

      const received = num(line.received_quantity);
      if (received === null || received < 0) throw new OpsError("INVALID_RECEIVED_QUANTITY", 400, { item: dli.item_name });
      const rejected = num(line.rejected_quantity) ?? 0;
      if (rejected < 0 || rejected > received + 1e-9) throw new OpsError("INVALID_REJECTED_QUANTITY", 400, { item: dli.item_name });
      const accepted = received - rejected;

      const inputPrice = num(line.input_unit_price);
      const priceUnit = normalizeUnitAlias(String(line.price_unit || dli.unit).trim() || dli.unit);
      let unitPrice: number | null = null;
      if (inputPrice !== null) {
        if (inputPrice < 0) throw new OpsError("INVALID_PRICE", 400);
        const converted = priceUnit === dli.unit ? inputPrice : convertPrice(item, inputPrice, priceUnit, dli.unit);
        if (converted === null) throw new OpsError("INVALID_PRICE_UNIT_CONVERSION", 400, { item: dli.item_name, from: priceUnit, to: dli.unit });
        unitPrice = round4(converted);
      }
      const ordered = dli.is_extra ? 0 : toQty(dli.total_quantity);
      const refPrice = referencePrice({ item, item_name: dli.item_name, unit: dli.unit, supplier_id: input.supplier_id, date: input.date });
      const matchStatus = line.match_status
        || (received === 0 && ordered > 0 ? "MISSING" : ordered === 0 ? "EXTRA" : Math.abs(received - ordered) < 1e-9 ? "MATCH" : "QTY_DIFF");

      upsert.run(
        dli.id,
        accepted > 0 ? 1 : 0,
        unitPrice,
        inputPrice,
        inputPrice !== null ? priceUnit : null,
        num(line.scan_file_id),
        String(line.receive_note || "").trim() || null,
        line.ocr_name ? 1 : 0,
        itemId,
        received,
        rejected,
        String(line.reject_reason || "").trim() || null,
        num(line.problem_photo_file_id),
        line.ocr_name ? String(line.ocr_name) : null,
        num(line.ocr_quantity),
        line.ocr_unit ? String(line.ocr_unit) : null,
        num(line.ocr_unit_price),
        matchStatus,
        refPrice,
        actor.name,
        actor.id
      );
      const receivingId = (getReceivingId.get(dli.id) as { id: number }).id;
      regenerateAutoDiscrepancies({
        date: input.date,
        supplier_id: input.supplier_id,
        receiving_item_id: receivingId,
        daily_list_item_id: dli.id,
        item_id: itemId,
        item_name: dli.item_name,
        unit: dli.unit,
        ordered,
        received,
        rejected,
        reject_reason: String(line.reject_reason || "").trim() || null,
        unit_price: unitPrice,
        reference_price: refPrice,
        photo_file_id: num(line.problem_photo_file_id),
        actor
      });

      const resolves = num(line.resolves_discrepancy_id);
      if (resolves) {
        const d = db.prepare("SELECT id, status, supplier_id FROM discrepancies WHERE id = ?").get(resolves) as any;
        if (!d || d.supplier_id !== input.supplier_id) throw new OpsError("INVALID_RESOLVES_DISCREPANCY", 400);
        if (d.status === "OPEN") {
          db.prepare(`
            UPDATE discrepancies SET status = 'RESOLVED_RESENT', related_receiving_item_id = ?, resolved_by = ?, resolved_at = datetime('now'),
              resolution_note = COALESCE(resolution_note, '') || ?
            WHERE id = ?
          `).run(receivingId, actor.name, `补送收货 ${input.date} #${receivingId}`, resolves);
        }
      }
      results.push({ daily_list_item_id: dli.id, receiving_item_id: receivingId });
    };

    for (const line of input.lines) processLine(line);

    if (input.complete) {
      // anything ordered but not confirmed counts as not delivered (0 received -> SHORT)
      const pending = listItemsForSupplier(list.id, input.supplier_id).filter((l) => !l.receiving_item_id && !touched.has(l.id) && !l.is_extra);
      for (const l of pending) processLine({ daily_list_item_id: l.id, received_quantity: 0, match_status: "MISSING" });
    }

    const all = listItemsForSupplier(list.id, input.supplier_id);
    const systemTotal = round2(all.reduce((s, l) => s + (l.receiving_item_id && l.unit_price !== null ? effectiveReceived(l) * l.unit_price : 0), 0));
    const hasDiscrepancy = (db.prepare("SELECT COUNT(*) AS n FROM discrepancies WHERE supplier_id = ? AND date = ?").get(input.supplier_id, input.date) as { n: number }).n > 0;
    const order = ensureSupplierOrder(input.date, input.supplier_id);
    const nextStatus: SupplierOrderStatus = input.complete ? "RECEIVED" : (STATUS_RANK[order.status as SupplierOrderStatus] >= STATUS_RANK.RECEIVED ? order.status : "PARTIAL");
    db.prepare(`
      UPDATE supplier_orders SET status = ?, received_at = datetime('now'), received_by = ?, received_by_staff_id = ?,
        has_discrepancy = ?, invoice_total = COALESCE(?, invoice_total), invoice_note = COALESCE(?, invoice_note),
        system_total = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextStatus, actor.name, actor.id, hasDiscrepancy ? 1 : 0, num(input.invoice_total), input.invoice_note ?? null, systemTotal, order.id);
    return { results, status: nextStatus, system_total: systemTotal, has_discrepancy: hasDiscrepancy };
  });

  const out = run();
  audit(actor, input.complete ? "RECEIVING_COMPLETE" : "RECEIVING_SAVE", "supplier_orders", `${input.date}:${supplier.id}`, {
    lines: input.lines.length,
    invoice_total: input.invoice_total ?? null
  });
  const order = getSupplierOrder(input.date, input.supplier_id);
  return {
    ...out,
    invoice_total: order.invoice_total,
    invoice_diff: order.invoice_total !== null && order.invoice_total !== undefined ? round2(order.invoice_total - out.system_total) : null
  };
}

// ---------------------------------------------------------------------------
// Review lock / unlock
// ---------------------------------------------------------------------------

export function reviewLock(date: string, actor: Actor) {
  const list = ensureSupplierOrders(date);
  if (list.receiving_locked_at) throw new OpsError("DAILY_LIST_LOCKED", 409);
  const pending = db.prepare(`
    SELECT so.supplier_id, sp.name AS supplier_name, so.status FROM supplier_orders so
    JOIN suppliers sp ON sp.id = so.supplier_id
    WHERE so.date = ? AND so.status NOT IN ('RECEIVED', 'REVIEWED')
      AND EXISTS (SELECT 1 FROM daily_list_items dli WHERE dli.daily_list_id = ? AND dli.supplier_id = so.supplier_id)
  `).all(date, list.id) as Array<{ supplier_id: number; supplier_name: string; status: string }>;
  if (pending.length > 0) throw new OpsError("NOT_ALL_SUPPLIERS_RECEIVED", 409, { pending });
  db.transaction(() => {
    db.prepare("UPDATE daily_lists SET receiving_locked_at = datetime('now'), reviewed_by = ?, reviewed_by_staff_id = ? WHERE id = ?")
      .run(actor.name, actor.id, list.id);
    db.prepare("UPDATE supplier_orders SET status = 'REVIEWED', reviewed_at = datetime('now'), reviewed_by = ?, updated_at = datetime('now') WHERE date = ?")
      .run(actor.name, date);
    db.prepare("INSERT INTO receiving_lock_logs(date, action, actor_name, actor_staff_id, reason) VALUES (?, 'LOCK', ?, ?, NULL)")
      .run(date, actor.name, actor.id);
  })();
  audit(actor, "RECEIVING_REVIEW_LOCK", "daily_lists", date);
  return getDayBoard(date);
}

export function reviewUnlock(date: string, reason: string, actor: Actor) {
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new OpsError("UNLOCK_REASON_REQUIRED", 400);
  const list = getList(date);
  if (!list) throw new OpsError("DAILY_LIST_NOT_FOUND", 404);
  if (!list.receiving_locked_at) throw new OpsError("DAILY_LIST_NOT_LOCKED", 409);
  db.transaction(() => {
    db.prepare("UPDATE daily_lists SET receiving_locked_at = NULL, reviewed_by = NULL, reviewed_by_staff_id = NULL WHERE id = ?").run(list.id);
    db.prepare("UPDATE supplier_orders SET status = 'RECEIVED', reviewed_at = NULL, reviewed_by = NULL, updated_at = datetime('now') WHERE date = ? AND status = 'REVIEWED'")
      .run(date);
    db.prepare("INSERT INTO receiving_lock_logs(date, action, actor_name, actor_staff_id, reason) VALUES (?, 'UNLOCK', ?, ?, ?)")
      .run(date, actor.name, actor.id, cleanReason);
  })();
  audit(actor, "RECEIVING_REVIEW_UNLOCK", "daily_lists", date, { reason: cleanReason });
  return getDayBoard(date);
}

export function getReceivingItemContext(receivingItemId: number) {
  return db.prepare(`
    SELECT ri.*, dli.item_name, dli.unit, dli.total_quantity, dli.supplier_id, dli.item_id AS dli_item_id, dl.date, sp.name AS supplier_name
    FROM receiving_items ri
    JOIN daily_list_items dli ON dli.id = ri.daily_list_item_id
    JOIN daily_lists dl ON dl.id = dli.daily_list_id
    JOIN suppliers sp ON sp.id = dli.supplier_id
    WHERE ri.id = ?
  `).get(receivingItemId) as any;
}

export function getItemForReceiving(itemId: number | null) {
  return itemId ? getItem(itemId) : null;
}
