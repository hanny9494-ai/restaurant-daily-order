import fs from "node:fs";
import { NextResponse } from "next/server";
import { getReceivingScanFileById } from "@/lib/db";

export const dynamic = "force-dynamic";
export const preferredRegion = "hkg1";

export async function GET(_: Request, context: { params: { id: string } }) {
  const id = Number(context.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const file = getReceivingScanFileById(id);
  if (!file) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (!fs.existsSync(file.storage_path)) {
    return NextResponse.json({ error: "FILE_NOT_FOUND" }, { status: 404 });
  }

  const buffer = fs.readFileSync(file.storage_path);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": file.mime_type || "application/octet-stream",
      "Cache-Control": "private, max-age=86400",
      "Content-Length": String(buffer.byteLength)
    }
  });
}
