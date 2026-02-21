import type { OrderItem, Supplier } from "@/lib/types";

const RESTAURANT_NAME = "ensue";

type SupplierGroup = {
  supplier_id: number;
  supplier_name: string;
  items: OrderItem[];
  formatted_text: string;
};

export function formatSupplierText(date: string, supplierName: string, items: OrderItem[]) {
  const lines = items.map((item) => {
    const notePart = item.note ? ` (${item.note})` : "";
    return `- [${item.station_name}] ${item.item_name} ${item.quantity}${item.unit}${notePart}`;
  });

  return [`【${RESTAURANT_NAME} ${date} 下货】${supplierName}`, ...lines].join("\n");
}

export function formatAllSuppliersText(date: string, groups: SupplierGroup[]) {
  const blocks = groups.map((group) => {
    const lines = group.items.map((item) => {
      const notePart = item.note ? ` (${item.note})` : "";
      return `- [${item.station_name}] ${item.item_name} ${item.quantity}${item.unit}${notePart}`;
    });
    return [`【${group.supplier_name}】`, ...lines].join("\n");
  });

  return [`【${RESTAURANT_NAME} ${date} 下货】全部供应商`, ...blocks].join("\n\n");
}

export function groupOrdersBySupplier(date: string, orders: OrderItem[]): SupplierGroup[] {
  const map = new Map<number, SupplierGroup>();

  for (const order of orders) {
    const existing = map.get(order.supplier_id);
    if (existing) {
      existing.items.push(order);
      continue;
    }

    map.set(order.supplier_id, {
      supplier_id: order.supplier_id,
      supplier_name: order.supplier_name,
      items: [order],
      formatted_text: ""
    });
  }

  const groups = Array.from(map.values());
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
