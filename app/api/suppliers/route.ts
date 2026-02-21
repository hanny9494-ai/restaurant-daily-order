import { NextRequest, NextResponse } from "next/server";
import { addSupplier, getSuppliers } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ data: getSuppliers() });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const supplier = addSupplier(name);
    if (!supplier) {
      return NextResponse.json({ error: "invalid name" }, { status: 400 });
    }

    return NextResponse.json({ data: supplier }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
}
