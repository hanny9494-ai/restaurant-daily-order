import { NextRequest, NextResponse } from "next/server";
import { createOrderItem, getOrderItemsByDate } from "@/lib/db";
import { todayString } from "@/lib/date";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || todayString();
  const items = getOrderItemsByDate(date);
  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const station_id = Number(body.station_id);
    const supplier_id = Number(body.supplier_id);
    const item_name = String(body.item_name || "").trim();
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
      note
    });

    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
