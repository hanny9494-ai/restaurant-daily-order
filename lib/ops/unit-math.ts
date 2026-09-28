// Pure unit conversion helpers (no DB) shared by server modules and client pages.
import { weightFactor } from "@/lib/unit-convert";

export type UnitDef = { base_unit: string; units: Array<{ unit: string; factor_to_base: number }> };

/** How many base units one `unit` of this item equals; null if unknown. */
export function factorToBase(item: UnitDef | null, unit: string): number | null {
  const u = String(unit || "").trim();
  if (!item || !u) return null;
  if (u === item.base_unit) return 1;
  const custom = item.units.find((x) => x.unit === u);
  if (custom) return custom.factor_to_base;
  const fu = weightFactor(u);
  const fb = weightFactor(item.base_unit);
  if (fu !== null && fb !== null) return fu / fb;
  return null;
}

/** Convert quantity between units: via item conversions, else plain weight conversion. */
export function convertQuantity(item: UnitDef | null, qty: number, fromUnit: string, toUnit: string): number | null {
  if (String(fromUnit).trim() === String(toUnit).trim()) return qty;
  if (item) {
    const f = factorToBase(item, fromUnit);
    const t = factorToBase(item, toUnit);
    if (f !== null && t !== null && t !== 0) return (qty * f) / t;
  }
  const wf = weightFactor(fromUnit);
  const wt = weightFactor(toUnit);
  if (wf !== null && wt !== null) return (qty * wf) / wt;
  return null;
}

/** Convert a price quoted per `priceUnit` into price per `targetUnit`. */
export function convertPrice(item: UnitDef | null, price: number, priceUnit: string, targetUnit: string): number | null {
  const perTarget = convertQuantity(item, 1, targetUnit, priceUnit);
  return perTarget === null ? null : price * perTarget;
}

/** Candidate units for pricing / counting an item. */
export function unitOptionsFor(item: UnitDef | null, extra: string[] = []) {
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    const v = String(u || "").trim();
    if (v && !out.includes(v)) out.push(v);
  };
  extra.forEach(push);
  if (item) {
    push(item.base_unit);
    item.units.forEach((u) => push(u.unit));
  }
  ["千克", "克", "斤"].forEach(push);
  return out;
}
