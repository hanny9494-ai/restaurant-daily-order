import { NextRequest, NextResponse } from "next/server";
import { renameUnit, setUnitActive, softDeleteUnit } from "@/lib/db";

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

    const hasName = typeof body.name === "string";
    let updated;
    if (hasName) {
      updated = renameUnit(id, String(body.name));
      if (!updated) {
        return NextResponse.json({ error: "invalid name or not found" }, { status: 400 });
      }
      return NextResponse.json({ data: updated });
    }

    const isActive = body.is_active === 1 || body.is_active === true ? 1 : 0;
    updated = setUnitActive(id, isActive);
    if (!updated) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!id) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const deleted = softDeleteUnit(id);
  if (!deleted) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ data: deleted });
}
