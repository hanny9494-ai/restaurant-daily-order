const WEIGHT_UNIT_FACTORS: Record<string, number> = {
  "g": 1,
  "克": 1,
  "kg": 1000,
  "千克": 1000,
  "公斤": 1000,
  "斤": 500
};

function normalizeRawUnit(unit: string) {
  return unit.trim().toLowerCase();
}

export function normalizeUnitAlias(unit: string) {
  const raw = normalizeRawUnit(unit);
  if (raw === "g") return "克";
  if (raw === "kg") return "千克";
  return unit.trim();
}

export function isWeightUnit(unit: string) {
  const raw = normalizeRawUnit(unit);
  return Number.isFinite(WEIGHT_UNIT_FACTORS[raw]);
}

export function convertUnitPrice(price: number, fromUnit: string, toUnit: string) {
  if (!Number.isFinite(price)) return null;
  const fromRaw = normalizeRawUnit(fromUnit);
  const toRaw = normalizeRawUnit(toUnit);
  if (fromRaw === toRaw) return price;

  const fromFactor = WEIGHT_UNIT_FACTORS[fromRaw];
  const toFactor = WEIGHT_UNIT_FACTORS[toRaw];
  const fromIsWeight = Number.isFinite(fromFactor);
  const toIsWeight = Number.isFinite(toFactor);

  if (fromIsWeight && toIsWeight) {
    return price * (toFactor / fromFactor);
  }

  return null;
}

export function getPriceUnitOptions(orderUnit: string, unitLibrary: string[] = []) {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u: string) => {
    const clean = normalizeUnitAlias(u);
    if (!seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  };

  push(orderUnit);
  unitLibrary.forEach((u) => push(u));
  push("克");
  push("千克");
  push("斤");
  return out;
}
