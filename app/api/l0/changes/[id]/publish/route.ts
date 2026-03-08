import { NextRequest, NextResponse } from "next/server";
import { publishL0Draft } from "@/lib/l0-engine";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const publisher = String(body.publisher || "");
    const publishNote = typeof body.publish_note === "string" ? body.publish_note : undefined;
    const updated = publishL0Draft(id, publisher, publishNote);
    return NextResponse.json({ data: updated });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "PUBLISHER_REQUIRED" || code === "NO_CITATION") {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    if (code === "NOT_FOUND") {
      return NextResponse.json({ error: code }, { status: 404 });
    }
    if (code === "INVALID_STAGE") {
      return NextResponse.json({ error: code }, { status: 409 });
    }
    return NextResponse.json({ error: "publish failed" }, { status: 500 });
  }
}
