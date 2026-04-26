const STORAGE_KEY = "recipe_menu_cycles_v1";

function normalize(values: string[]) {
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  );
}

export function mergeMenuCycles(...groups: Array<Array<string | null | undefined>>) {
  return normalize(groups.flat().map((item) => String(item || "").trim()));
}

export function readLocalMenuCycles() {
  if (typeof window === "undefined") return [] as string[];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? normalize(parsed.map((item) => String(item || ""))) : [];
  } catch {
    return [];
  }
}

export function writeLocalMenuCycles(values: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalize(values)));
}

export function addLocalMenuCycle(value: string) {
  const next = mergeMenuCycles(readLocalMenuCycles(), [value]);
  writeLocalMenuCycles(next);
  return next;
}
