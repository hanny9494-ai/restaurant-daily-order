import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  generateDailyListSnapshot,
  getOrderItemsByDate,
  getOrderItemsByDateRange,
  getReceivingPriceRowsByDateRange
} from "@/lib/db";
import { todayString } from "@/lib/date";
import type { OrderItem } from "@/lib/types";

function listDates(from: string, to: string) {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cur <= end) {
    const yyyy = cur.getFullYear();
    const mm = `${cur.getMonth() + 1}`.padStart(2, "0");
    const dd = `${cur.getDate()}`.padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  let rows: OrderItem[] = [];
  let filenameDatePart = "";

  if (start && end) {
    const [from, to] = start <= end ? [start, end] : [end, start];
    rows = getOrderItemsByDateRange(from, to);
    filenameDatePart = `${from}_to_${to}`;
  } else {
    const selectedDate = date || todayString();
    rows = getOrderItemsByDate(selectedDate);
    filenameDatePart = selectedDate;
  }

  const [from, to] = start && end
    ? (start <= end ? [start, end] : [end, start])
    : [date || todayString(), date || todayString()];

  // Ensure snapshot exists so receiving price rows can be queried reliably.
  listDates(from, to).forEach((d) => generateDailyListSnapshot(d));

  const priceRows = getReceivingPriceRowsByDateRange(from, to);
  const priceMap = new Map<string, {
    quality_ok: number | null;
    unit_price: number | null;
    input_unit_price: number | null;
    price_unit: string | null;
  }>();
  priceRows.forEach((p) => {
    const key = `${p.date}::${p.supplier_id}::${p.item_name}::${p.unit}`;
    priceMap.set(key, {
      quality_ok: p.quality_ok,
      unit_price: p.unit_price,
      input_unit_price: p.input_unit_price,
      price_unit: p.price_unit
    });
  });

  const exportRows = rows.map((row) => {
    const key = `${row.date}::${row.supplier_id}::${row.item_name}::${row.unit}`;
    const receiving = priceMap.get(key);
    const hasReceiving = Boolean(receiving);
    const quality = receiving?.quality_ok === 1 ? "Good" : "No";
    const unitPrice = receiving?.unit_price ?? "";
    const inputUnitPrice = receiving?.input_unit_price ?? "";
    const priceUnit = receiving?.price_unit ?? row.unit;
    const qty = Number(row.quantity);
    const amount = typeof unitPrice === "number" && Number.isFinite(qty) ? qty * unitPrice : "";
    const returnNote = !hasReceiving ? "不及格退回（无收货记录）" : "";

    return {
      "日期": row.date,
      "供应商": row.supplier_name,
      "Station": row.station_name,
      "品名": row.item_name,
      "数量": row.quantity,
      "单位": row.unit,
      "质量": quality,
      "单价(下单单位)": unitPrice,
      "录入单价": inputUnitPrice,
      "录入单价单位": priceUnit,
      "金额": amount,
      "备注": [row.note || "", returnNote].filter(Boolean).join("; "),
      "状态": row.status,
      "创建时间": row.created_at
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(exportRows.length > 0 ? exportRows : [{ "日期": filenameDatePart }]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");

  const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const filename = `ensue_orders_${filenameDatePart}.xlsx`;

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`
    }
  });
}
