import { NextRequest, NextResponse } from "next/server";
import { addUnit, getUnits } from "@/lib/db";

export async function GET(request: NextRequest) {
  const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "1";
  return NextResponse.json({ data: getUnits(includeInactive) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const unit = addUnit(name);
    if (!unit) {
      return NextResponse.json({ error: "invalid name" }, { status: 400 });
    }

    return NextResponse.json({ data: unit }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
}
