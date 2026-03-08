import { NextRequest, NextResponse } from "next/server";
import { createKnowledgeUpload, listKnowledgeUploads } from "@/lib/knowledge-admin";

function isValidLayer(value: string): value is "L1" | "L2" | "L3" | "L4" | "L5" {
  return value === "L1" || value === "L2" || value === "L3" || value === "L4" || value === "L5";
}

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit") || "50");
  const layerParam = String(request.nextUrl.searchParams.get("layer") || "").toUpperCase();
  const layer = isValidLayer(layerParam) ? layerParam : undefined;
  const data = listKnowledgeUploads(layer, Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const layer = String(body.layer || "").toUpperCase();
    if (!isValidLayer(layer)) {
      return NextResponse.json({ error: "INVALID_LAYER" }, { status: 400 });
    }
    const uploader = String(body.uploader || "");
    const payload = body.payload;
    if (payload === undefined || payload === null) {
      return NextResponse.json({ error: "PAYLOAD_REQUIRED" }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note : undefined;
    const created = createKnowledgeUpload(layer, payload, uploader, note);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error: any) {
    if (String(error?.message || "") === "UPLOADER_REQUIRED") {
      return NextResponse.json({ error: "UPLOADER_REQUIRED" }, { status: 400 });
    }
    return NextResponse.json({ error: "upload failed" }, { status: 500 });
  }
}
