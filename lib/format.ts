import type { OrderItem, Supplier } from "@/lib/types";

const RESTAURANT_NAME = "ensue";

type MergedItem = {
  supplier_id: number;
  supplier_name: string;
  item_name: string;
  unit: string;
  total_quantity: number;
  station_names: string[];
  notes: string[];
};

type SupplierGroup = {
  supplier_id: number;
  supplier_name: string;
  items: MergedItem[];
  formatted_text: string;
};

function toNumber(quantity: string) {
  const n = Number(quantity);
  return Number.isFinite(n) ? n : 0;
}

function formatMergedLine(item: MergedItem) {
  const stationPart = item.station_names.length > 0 ? ` [${item.station_names.join("/")}]` : "";
  const notePart = item.notes.length > 0 ? ` (${item.notes.join("; ")})` : "";
  return `- ${item.item_name} ${item.total_quantity}${item.unit}${stationPart}${notePart}`;
}

export function formatSupplierText(date: string, supplierName: string, items: MergedItem[]) {
  const lines = items.map((item) => formatMergedLine(item));
  return [`【${RESTAURANT_NAME} ${date} 下货】${supplierName}`, ...lines].join("\n");
}

export function formatAllSuppliersText(date: string, groups: SupplierGroup[]) {
  const blocks = groups.map((group) => {
    const lines = group.items.map((item) => formatMergedLine(item));
    return [`【${group.supplier_name}】`, ...lines].join("\n");
  });

  return [`【${RESTAURANT_NAME} ${date} 下货】全部供应商`, ...blocks].join("\n\n");
}

export function groupOrdersBySupplier(date: string, orders: OrderItem[]): SupplierGroup[] {
  const supplierMap = new Map<number, SupplierGroup>();

  for (const order of orders) {
    const supplierGroup = supplierMap.get(order.supplier_id) || {
      supplier_id: order.supplier_id,
      supplier_name: order.supplier_name,
      items: [],
      formatted_text: ""
    };

    const key = `${order.item_name}::${order.unit}`;
    const existing = supplierGroup.items.find((item) => `${item.item_name}::${item.unit}` === key);

    if (existing) {
      existing.total_quantity += toNumber(order.quantity);
      if (!existing.station_names.includes(order.station_name)) {
        existing.station_names.push(order.station_name);
      }
      if (order.note && !existing.notes.includes(order.note)) {
        existing.notes.push(order.note);
      }
    } else {
      supplierGroup.items.push({
        supplier_id: order.supplier_id,
        supplier_name: order.supplier_name,
        item_name: order.item_name,
        unit: order.unit,
        total_quantity: toNumber(order.quantity),
        station_names: [order.station_name],
        notes: order.note ? [order.note] : []
      });
    }

    supplierMap.set(order.supplier_id, supplierGroup);
  }

  const groups = Array.from(supplierMap.values());
  for (const group of groups) {
    group.formatted_text = formatSupplierText(date, group.supplier_name, group.items);
  }

  return groups;
}

export function sortGroupsBySuppliers(groups: SupplierGroup[], suppliers: Supplier[]) {
  const orderMap = new Map<number, number>();
  suppliers.forEach((s, index) => orderMap.set(s.id, index));

  return [...groups].sort((a, b) => {
    const ia = orderMap.get(a.supplier_id) ?? Number.MAX_SAFE_INTEGER;
    const ib = orderMap.get(b.supplier_id) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });
}
