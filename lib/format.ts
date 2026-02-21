import type { OrderItem } from "@/lib/types";

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

  return [`【${date} 下货】${supplierName}`, ...lines].join("\n");
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

  return groups.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
}
