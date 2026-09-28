import { NextRequest, NextResponse } from "next/server";
import { createOrderItem, createOrderItemsBulk, getOrderItemsByDate } from "@/lib/db";
import { todayString } from "@/lib/date";
import { buildNameIndex, getItem } from "@/lib/ops/items";
import { normalizeName } from "@/lib/ops/common";

// Link each order line to the item master: explicit item_id wins, else name/alias match; unmatched stays free text ("待归并").
// Linked lines are stored under the canonical item name so aliases (鸡胸肉 / 鸡胸) merge in the daily snapshot.
function resolveItem(explicit: unknown, name: string, index: Map<string, number>) {
  const explicitId = Number(explicit);
  const id = Number.isInteger(explicitId) && explicitId > 0 ? explicitId : index.get(normalizeName(name)) ?? null;
  const item = id ? getItem(id) : null;
  return item ? { item_id: item.id, item_name: item.name } : { item_id: null, item_name: name };
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || todayString();
  const items = getOrderItemsByDate(date);
  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (Array.isArray(body.items)) {
      type BulkRow = {
        date: string;
        station_id: number;
        supplier_id: number;
        item_name: string;
        quantity: string;
        unit: string;
        note: string;
        item_id: number | null;
      };

      const index = buildNameIndex();
      const rows = body.items
        .map((it: any) => ({
          date: it.date ? String(it.date) : todayString(),
          station_id: Number(it.station_id),
          supplier_id: Number(it.supplier_id),
          ...resolveItem(it.item_id, String(it.item_name || "").trim(), index),
          quantity: String(it.quantity || "").trim(),
          unit: String(it.unit || "").trim(),
          note: it.note ? String(it.note) : ""
        })) as BulkRow[];

      const validRows = rows.filter((it) => it.station_id && it.supplier_id && it.item_name && it.quantity && it.unit);

      if (validRows.length === 0) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      const ids = createOrderItemsBulk(validRows);
      return NextResponse.json({ data: { ids } }, { status: 201 });
    }

    const station_id = Number(body.station_id);
    const supplier_id = Number(body.supplier_id);
    const resolved = resolveItem(body.item_id, String(body.item_name || "").trim(), buildNameIndex());
    const item_name = resolved.item_name;
    const quantity = String(body.quantity || "").trim();
    const unit = String(body.unit || "").trim();
    const note = body.note ? String(body.note) : "";
    const date = body.date ? String(body.date) : todayString();

    if (!station_id || !supplier_id || !item_name || !quantity || !unit) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = createOrderItem({
      date,
      station_id,
      supplier_id,
      item_name,
      quantity,
      unit,
      note,
      item_id: resolved.item_id
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
