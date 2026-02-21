import { NextRequest, NextResponse } from "next/server";
import { setSupplierActive } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const isActive = body.is_active === 1 || body.is_active === true ? 1 : 0;

    const updated = setSupplierActive(id, isActive);
    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
}
