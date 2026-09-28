import * as XLSX from "xlsx";
import { db, round2, round4 } from "@/lib/ops/common";
import { effectiveAccepted, effectiveReceived } from "@/lib/ops/receiving";
import { factorToBase, listItems } from "@/lib/ops/items";
import type { Item } from "@/lib/ops/items";
import { listDiscrepancies } from "@/lib/ops/discrepancies";

export type PurchaseLine = {
  receiving_item_id: number;
  date: string;
  supplier_id: number;
  supplier_name: string;
  item_id: number | null;
  item_name: string;
  category: string;
  unit: string;
  ordered_quantity: number;
  received_quantity: number;
  rejected_quantity: number;
  accepted_quantity: number;
  accepted_base_quantity: number | null;
  base_unit: string | null;
  unit_price: number | null;
  amount: number;
  received_by: string | null;
  reject_reason: string | null;
  receive_note: string | null;
  scan_file_id: number | null;
};

/** Every receiving line in [from, to] (by delivery date). amount = accepted qty × unit price. */
export function getPurchaseLines(from: string, to: string, supplierId?: number | null): PurchaseLine[] {
  const items = new Map<number, Item>();
  for (const it of listItems({ includeInactive: true })) items.set(it.id, it);
  const rows = db.prepare(`
    SELECT ri.id AS receiving_item_id, dl.date, dli.supplier_id, sp.name AS supplier_name,
           COALESCE(ri.item_id, dli.item_id) AS item_id, dli.item_name, dli.unit, dli.total_quantity, dli.is_extra,
           ri.received_quantity, ri.rejected_quantity, ri.quality_ok, ri.unit_price, ri.received_by,
           ri.reject_reason, ri.receive_note, ri.scan_file_id
    FROM receiving_items ri
    JOIN daily_list_items dli ON dli.id = ri.daily_list_item_id
    JOIN daily_lists dl ON dl.id = dli.daily_list_id
    JOIN suppliers sp ON sp.id = dli.supplier_id
    WHERE dl.date BETWEEN ? AND ? ${supplierId ? "AND dli.supplier_id = ?" : ""}
    ORDER BY dl.date, sp.id, dli.id
  `).all(...(supplierId ? [from, to, supplierId] : [from, to])) as any[];
  return rows.map((r) => {
    const item = r.item_id ? items.get(r.item_id) || null : null;
    const accepted = effectiveAccepted(r);
    const received = effectiveReceived(r);
    const f = item ? factorToBase(item, r.unit) : null;
    return {
      receiving_item_id: r.receiving_item_id,
      date: r.date,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      item_id: r.item_id,
      item_name: r.item_name,
      category: item?.category || "未归类",
      unit: r.unit,
      ordered_quantity: r.is_extra ? 0 : Number(r.total_quantity) || 0,
      received_quantity: received,
      rejected_quantity: r.received_quantity === null ? (r.quality_ok === 1 ? 0 : Number(r.total_quantity) || 0) : r.rejected_quantity || 0,
      accepted_quantity: accepted,
      accepted_base_quantity: f !== null ? round4(accepted * f) : null,
      base_unit: item?.base_unit || null,
      unit_price: r.unit_price,
      amount: round2(accepted * (r.unit_price || 0)),
      received_by: r.received_by,
      reject_reason: r.reject_reason,
      receive_note: r.receive_note,
      scan_file_id: r.scan_file_id
    };
  });
}

export type Adjustment = {
  id: number;
  effective_date: string;
  date: string;
  supplier_id: number;
  supplier_name: string;
  item_id: number | null;
  item_name: string;
  category: string;
  unit: string;
  type: string;
  status: string;
  quantity: number;
  adjustment_amount: number;
  base_quantity: number | null;
};

/** Payable adjustments (return credits, deductions) booked on effective_date in [from, to]. */
export function getAdjustments(from: string, to: string, supplierId?: number | null): Adjustment[] {
  const items = new Map<number, Item>();
  for (const it of listItems({ includeInactive: true })) items.set(it.id, it);
  const rows = db.prepare(`
    SELECT d.id, d.effective_date, d.date, d.supplier_id, sp.name AS supplier_name, d.item_id, d.item_name, d.unit, d.type, d.status,
           d.quantity, d.adjustment_amount
    FROM discrepancies d JOIN suppliers sp ON sp.id = d.supplier_id
    WHERE d.adjustment_amount <> 0 AND d.effective_date BETWEEN ? AND ? ${supplierId ? "AND d.supplier_id = ?" : ""}
    ORDER BY d.effective_date, d.id
  `).all(...(supplierId ? [from, to, supplierId] : [from, to])) as any[];
  return rows.map((r) => {
    const item = r.item_id ? items.get(r.item_id) || null : null;
    const f = item ? factorToBase(item, r.unit) : null;
    const isReturn = r.type === "RETURN_LATER" || r.type === "EXCHANGE";
    return {
      ...r,
      category: item?.category || "未归类",
      base_quantity: isReturn && f !== null ? round4(-r.quantity * f) : null
    };
  });
}

function isReturnType(type: string) {
  return type === "RETURN_LATER" || type === "EXCHANGE";
}

export function getSupplierStatement(input: { supplier_id?: number | null; from: string; to: string; origin?: string }) {
  const lines = getPurchaseLines(input.from, input.to, input.supplier_id);
  const adjustments = getAdjustments(input.from, input.to, input.supplier_id);
  const byKey = new Map<string, { date: string; supplier_id: number; supplier_name: string; received_amount: number; returns: number; adjustments: number; payable: number; invoice_total: number | null; received_by: string | null }>();
  const keyOf = (date: string, supplierId: number) => `${date}::${supplierId}`;
  const ensure = (date: string, supplierId: number, supplierName: string) => {
    const k = keyOf(date, supplierId);
    let row = byKey.get(k);
    if (!row) {
      const so = db.prepare("SELECT invoice_total, received_by FROM supplier_orders WHERE date = ? AND supplier_id = ?").get(date, supplierId) as any;
      row = { date, supplier_id: supplierId, supplier_name: supplierName, received_amount: 0, returns: 0, adjustments: 0, payable: 0, invoice_total: so?.invoice_total ?? null, received_by: so?.received_by ?? null };
      byKey.set(k, row);
    }
    return row;
  };
  for (const l of lines) ensure(l.date, l.supplier_id, l.supplier_name).received_amount += l.amount;
  for (const a of adjustments) {
    const row = ensure(a.effective_date, a.supplier_id, a.supplier_name);
    if (isReturnType(a.type)) row.returns += a.adjustment_amount;
    else row.adjustments += a.adjustment_amount;
  }
  const daily = Array.from(byKey.values())
    .map((r) => ({
      ...r,
      received_amount: round2(r.received_amount),
      returns: round2(r.returns),
      adjustments: round2(r.adjustments),
      payable: round2(r.received_amount + r.returns + r.adjustments)
    }))
    .sort((a, b) => (a.date === b.date ? a.supplier_id - b.supplier_id : a.date < b.date ? -1 : 1));
  const totals = daily.reduce(
    (acc, r) => ({
      received_amount: round2(acc.received_amount + r.received_amount),
      returns: round2(acc.returns + r.returns),
      adjustments: round2(acc.adjustments + r.adjustments),
      payable: round2(acc.payable + r.payable)
    }),
    { received_amount: 0, returns: 0, adjustments: 0, payable: 0 }
  );
  const openDiscrepancies = listDiscrepancies({ supplier_id: input.supplier_id || null, date_from: input.from, date_to: input.to, unsettled_only: true });
  const scans = db.prepare(`
    SELECT sf.id, sf.service_date, sf.supplier_id, sp.name AS supplier_name, sf.kind, sf.file_url, sf.original_filename, sf.created_by, sf.created_at
    FROM receiving_scan_files sf LEFT JOIN suppliers sp ON sp.id = sf.supplier_id
    WHERE sf.service_date BETWEEN ? AND ? ${input.supplier_id ? "AND sf.supplier_id = ?" : "AND sf.supplier_id IS NOT NULL"}
    ORDER BY sf.service_date, sf.id
  `).all(...(input.supplier_id ? [input.from, input.to, input.supplier_id] : [input.from, input.to])) as any[];
  const origin = (input.origin || "").replace(/\/+$/, "");
  return {
    supplier_id: input.supplier_id || null,
    from: input.from,
    to: input.to,
    daily,
    totals,
    lines,
    adjustments,
    open_discrepancies: openDiscrepancies,
    scans: scans.map((s) => ({ ...s, absolute_url: `${origin}${s.file_url}` }))
  };
}

export function statementToXlsx(statement: ReturnType<typeof getSupplierStatement>) {
  const wb = XLSX.utils.book_new();
  const summary = statement.daily.map((d) => ({
    "日期": d.date,
    "供应商": d.supplier_name,
    "实收金额": d.received_amount,
    "退货红冲": d.returns,
    "调整": d.adjustments,
    "应付": d.payable,
    "单据合计": d.invoice_total ?? "",
    "收货人": d.received_by || ""
  }));
  summary.push({
    "日期": "合计",
    "供应商": "",
    "实收金额": statement.totals.received_amount,
    "退货红冲": statement.totals.returns,
    "调整": statement.totals.adjustments,
    "应付": statement.totals.payable,
    "单据合计": "",
    "收货人": ""
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "应付汇总");

  const scanUrl = new Map<number, string>();
  statement.scans.forEach((s: any) => scanUrl.set(s.id, s.absolute_url));
  const detail = statement.lines.map((l) => ({
    "日期": l.date,
    "供应商": l.supplier_name,
    "品名": l.item_name,
    "品类": l.category,
    "单位": l.unit,
    "订货数量": l.ordered_quantity,
    "实收数量": l.received_quantity,
    "拒收数量": l.rejected_quantity,
    "合格数量": l.accepted_quantity,
    "单价": l.unit_price ?? "",
    "金额": l.amount,
    "拒收原因": l.reject_reason || "",
    "备注": l.receive_note || "",
    "收货人": l.received_by || "",
    "单据图片": l.scan_file_id ? scanUrl.get(l.scan_file_id) || "" : ""
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail.length ? detail : [{ "日期": "无记录" }]), "每日实收明细");

  const adj = statement.adjustments.map((a) => ({
    "入账日期": a.effective_date,
    "原收货日期": a.date,
    "供应商": a.supplier_name,
    "品名": a.item_name,
    "类型": a.type,
    "状态": a.status,
    "数量": a.quantity,
    "金额": a.adjustment_amount
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(adj.length ? adj : [{ "入账日期": "无红冲/调整" }]), "红冲与调整");

  const open = statement.open_discrepancies.map((d: any) => ({
    "ID": d.id,
    "日期": d.date,
    "供应商": d.supplier_name,
    "品名": d.item_name,
    "类型": d.type,
    "状态": d.status,
    "数量": d.quantity,
    "单位": d.unit,
    "单价": d.unit_price ?? "",
    "参考单价": d.expected_unit_price ?? "",
    "差异金额": d.amount,
    "调整金额": d.adjustment_amount,
    "原因": d.reason || "",
    "登记人": d.created_by || ""
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(open.length ? open : [{ "ID": "无未结差异" }]), "未结差异");

  const scans = statement.scans.map((s: any) => ({
    "日期": s.service_date,
    "供应商": s.supplier_name || "",
    "类型": s.kind === "PROBLEM" ? "问题照片" : "来货单",
    "链接": s.absolute_url,
    "上传人": s.created_by || "",
    "上传时间": s.created_at
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scans.length ? scans : [{ "日期": "无单据" }]), "单据图片");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
