import * as XLSX from "xlsx";
import { db, OpsError, audit, assertDate, addDays, getOpsConfig, num, round2, round4 } from "@/lib/ops/common";
import type { Actor } from "@/lib/ops/common";
import { getAdjustments, getPurchaseLines } from "@/lib/ops/statement";

// ---------- revenue ----------

export function listRevenue(from?: string, to?: string) {
  return db.prepare(`
    SELECT * FROM revenue_entries WHERE end_date >= ? AND start_date <= ? ORDER BY start_date DESC, id DESC
  `).all(from || "0000-01-01", to || "9999-12-31") as any[];
}

export function createRevenue(input: { start_date: string; end_date?: string; amount: number; note?: string }, actor: Actor) {
  const start = assertDate(input.start_date);
  const end = input.end_date ? assertDate(input.end_date) : start;
  if (end < start) throw new OpsError("END_BEFORE_START", 400);
  const amount = num(input.amount);
  if (amount === null || amount < 0) throw new OpsError("INVALID_AMOUNT", 400);
  const overlap = db.prepare("SELECT id FROM revenue_entries WHERE start_date <= ? AND end_date >= ?").get(end, start) as { id: number } | undefined;
  if (overlap) throw new OpsError("REVENUE_PERIOD_OVERLAP", 409, { id: overlap.id });
  const r = db.prepare("INSERT INTO revenue_entries(start_date, end_date, amount, note, created_by) VALUES (?, ?, ?, ?, ?)")
    .run(start, end, round2(amount), String(input.note || "").trim() || null, actor.name);
  audit(actor, "REVENUE_CREATE", "revenue_entries", Number(r.lastInsertRowid), { start, end, amount });
  return db.prepare("SELECT * FROM revenue_entries WHERE id = ?").get(Number(r.lastInsertRowid));
}

export function deleteRevenue(id: number, actor: Actor) {
  const r = db.prepare("DELETE FROM revenue_entries WHERE id = ?").run(id);
  if (r.changes !== 1) throw new OpsError("REVENUE_NOT_FOUND", 404);
  audit(actor, "REVENUE_DELETE", "revenue_entries", id);
  return { ok: true };
}

// ---------- cost periods ----------

type StocktakeHead = { id: number; stocktake_date: string; total_value: number | null };

function approvedStocktakes(): StocktakeHead[] {
  return db.prepare("SELECT id, stocktake_date, total_value FROM stocktakes WHERE status = 'APPROVED' ORDER BY stocktake_date ASC, id ASC").all() as StocktakeHead[];
}

/** Delivery dates counted in the period between two counts (see STOCKTAKE_TIMING). */
export function periodWindow(startDate: string, endDate: string) {
  return getOpsConfig().stocktakeTiming === "START_OF_DAY"
    ? { from: startDate, to: addDays(endDate, -1) }
    : { from: addDays(startDate, 1), to: endDate };
}

function stockLines(stocktakeId: number) {
  return db.prepare("SELECT item_id, item_name, category, base_unit, quantity, unit_price_snapshot, value FROM stocktake_lines WHERE stocktake_id = ?")
    .all(stocktakeId) as Array<{ item_id: number; item_name: string; category: string; base_unit: string; quantity: number | null; unit_price_snapshot: number | null; value: number | null }>;
}

export function computePeriod(start: StocktakeHead, end: StocktakeHead) {
  const window = periodWindow(start.stocktake_date, end.stocktake_date);
  const opening = stockLines(start.id);
  const closing = stockLines(end.id);
  const purchases = window.from <= window.to ? getPurchaseLines(window.from, window.to) : [];
  const adjustments = window.from <= window.to ? getAdjustments(window.from, window.to) : [];

  type Cat = { category: string; opening: number; purchases: number; closing: number; consumption: number; share: number };
  const cats = new Map<string, Cat>();
  const cat = (name: string) => {
    let c = cats.get(name);
    if (!c) {
      c = { category: name, opening: 0, purchases: 0, closing: 0, consumption: 0, share: 0 };
      cats.set(name, c);
    }
    return c;
  };
  for (const l of opening) cat(l.category).opening += l.value || 0;
  for (const l of closing) cat(l.category).closing += l.value || 0;
  for (const p of purchases) cat(p.category).purchases += p.amount;
  for (const a of adjustments) cat(a.category).purchases += a.adjustment_amount;

  const categories = Array.from(cats.values()).map((c) => ({
    ...c,
    opening: round2(c.opening),
    purchases: round2(c.purchases),
    closing: round2(c.closing),
    consumption: round2(c.opening + c.purchases - c.closing)
  }));
  const totals = categories.reduce(
    (acc, c) => ({
      opening: round2(acc.opening + c.opening),
      purchases: round2(acc.purchases + c.purchases),
      closing: round2(acc.closing + c.closing),
      consumption: round2(acc.consumption + c.consumption)
    }),
    { opening: 0, purchases: 0, closing: 0, consumption: 0 }
  );
  for (const c of categories) c.share = totals.consumption ? round4(c.consumption / totals.consumption) : 0;
  categories.sort((a, b) => b.consumption - a.consumption);

  const revenueRows = db.prepare(`
    SELECT * FROM revenue_entries WHERE start_date >= ? AND end_date <= ? ORDER BY start_date
  `).all(window.from, window.to) as any[];
  const partialRevenue = db.prepare(`
    SELECT * FROM revenue_entries WHERE end_date >= ? AND start_date <= ? AND NOT (start_date >= ? AND end_date <= ?)
  `).all(window.from, window.to, window.from, window.to) as any[];
  const revenue = round2(revenueRows.reduce((s, r) => s + r.amount, 0));

  // per-item consumption in base units (for anomaly detection)
  const itemUse = new Map<number, { item_id: number; item_name: string; base_unit: string; opening: number; purchased: number; closing: number; consumption: number }>();
  const use = (id: number, name: string, unit: string) => {
    let u = itemUse.get(id);
    if (!u) {
      u = { item_id: id, item_name: name, base_unit: unit, opening: 0, purchased: 0, closing: 0, consumption: 0 };
      itemUse.set(id, u);
    }
    return u;
  };
  for (const l of opening) use(l.item_id, l.item_name, l.base_unit).opening += l.quantity || 0;
  for (const l of closing) use(l.item_id, l.item_name, l.base_unit).closing += l.quantity || 0;
  for (const p of purchases) if (p.item_id && p.accepted_base_quantity !== null) use(p.item_id, p.item_name, p.base_unit || "").purchased += p.accepted_base_quantity;
  for (const a of adjustments) if (a.item_id && a.base_quantity !== null) use(a.item_id, a.item_name, "").purchased += a.base_quantity;
  const items = Array.from(itemUse.values()).map((u) => ({
    ...u,
    opening: round4(u.opening),
    purchased: round4(u.purchased),
    closing: round4(u.closing),
    consumption: round4(u.opening + u.purchased - u.closing)
  }));

  return {
    start_stocktake_id: start.id,
    end_stocktake_id: end.id,
    start_date: start.stocktake_date,
    end_date: end.stocktake_date,
    purchase_window: window,
    categories,
    totals,
    food_cost: totals.consumption,
    revenue,
    revenue_entries: revenueRows,
    partial_revenue_entries: partialRevenue,
    food_cost_rate: revenue > 0 ? round4(totals.consumption / revenue) : null,
    items
  };
}

export function listCostPeriods() {
  const heads = approvedStocktakes();
  const periods: Array<ReturnType<typeof computePeriod> & { anomalies: any[] }> = [];
  const threshold = getOpsConfig().consumptionAnomalyThreshold;
  for (let i = 1; i < heads.length; i += 1) {
    const p = computePeriod(heads[i - 1], heads[i]);
    const history = periods.slice(-4);
    const anomalies: any[] = [];
    if (history.length > 0) {
      for (const item of p.items) {
        const past = history.map((h) => h.items.find((x) => x.item_id === item.item_id)?.consumption).filter((v): v is number => typeof v === "number");
        if (past.length === 0) continue;
        const avg = past.reduce((s, v) => s + v, 0) / past.length;
        if (avg <= 0) continue;
        const deviation = (item.consumption - avg) / avg;
        if (Math.abs(deviation) > threshold) {
          anomalies.push({ item_id: item.item_id, item_name: item.item_name, base_unit: item.base_unit, consumption: item.consumption, avg_previous: round4(avg), deviation: round4(deviation), periods_compared: past.length });
        }
      }
    }
    periods.push({ ...p, anomalies });
  }
  return {
    periods: periods.reverse(),
    trend: periods.slice().reverse().map((p) => ({ start_date: p.start_date, end_date: p.end_date, food_cost: p.food_cost, revenue: p.revenue, food_cost_rate: p.food_cost_rate })),
    config: { stocktake_timing: getOpsConfig().stocktakeTiming, anomaly_threshold: threshold }
  };
}

export function costReportXlsx(periodEndStocktakeId?: number | null) {
  const { periods, trend } = listCostPeriods();
  const selected = periodEndStocktakeId ? periods.filter((p) => p.end_stocktake_id === periodEndStocktakeId) : periods;
  const wb = XLSX.utils.book_new();
  const catRows: any[] = [];
  for (const p of selected) {
    for (const c of p.categories) {
      catRows.push({
        "期间": `${p.start_date} ~ ${p.end_date}`,
        "品类": c.category,
        "期初库存": c.opening,
        "本期采购": c.purchases,
        "期末库存": c.closing,
        "消耗(食材成本)": c.consumption,
        "占比": c.share
      });
    }
    catRows.push({
      "期间": `${p.start_date} ~ ${p.end_date}`,
      "品类": "合计",
      "期初库存": p.totals.opening,
      "本期采购": p.totals.purchases,
      "期末库存": p.totals.closing,
      "消耗(食材成本)": p.totals.consumption,
      "占比": 1
    });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows.length ? catRows : [{ "期间": "暂无两次已审核盘点" }]), "品类成本");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(trend.length ? trend.map((t) => ({
      "期初盘点": t.start_date,
      "期末盘点": t.end_date,
      "食材成本": t.food_cost,
      "营业额": t.revenue,
      "食材成本率": t.food_cost_rate ?? ""
    })) : [{ "期初盘点": "无数据" }]),
    "成本率趋势"
  );
  const anomalyRows: any[] = [];
  for (const p of selected) {
    for (const a of p.anomalies) {
      anomalyRows.push({
        "期间": `${p.start_date} ~ ${p.end_date}`,
        "品项": a.item_name,
        "本期消耗": a.consumption,
        "前期均值": a.avg_previous,
        "偏差": a.deviation,
        "单位": a.base_unit
      });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(anomalyRows.length ? anomalyRows : [{ "期间": "无异常" }]), "消耗异常");
  const itemRows: any[] = [];
  for (const p of selected) {
    for (const i of p.items) {
      itemRows.push({ "期间": `${p.start_date} ~ ${p.end_date}`, "品项": i.item_name, "单位": i.base_unit, "期初": i.opening, "采购": i.purchased, "期末": i.closing, "消耗": i.consumption });
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows.length ? itemRows : [{ "期间": "无数据" }]), "品项消耗");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
