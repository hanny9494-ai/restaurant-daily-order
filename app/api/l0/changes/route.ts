import { NextRequest, NextResponse } from "next/server";
import { getL0ChangeDetail, listL0Changes, submitL0Draft } from "@/lib/l0-engine";

export async function GET(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id") || "");
  if (Number.isInteger(id) && id > 0) {
    const detail = getL0ChangeDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ data: detail });
  }

  const limit = Number(request.nextUrl.searchParams.get("limit") || "50");
  const data = listL0Changes(Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const created = submitL0Draft({
      principle_key: String(body.principle_key || ""),
      claim: String(body.claim || ""),
      mechanism: String(body.mechanism || ""),
      boundary_conditions: Array.isArray(body.boundary_conditions) ? body.boundary_conditions : [],
      control_variables:
        body.control_variables && typeof body.control_variables === "object" ? body.control_variables : {},
      expected_effects: Array.isArray(body.expected_effects) ? body.expected_effects : [],
      counter_examples: Array.isArray(body.counter_examples) ? body.counter_examples : [],
      evidence_level: body.evidence_level,
      confidence: typeof body.confidence === "number" ? body.confidence : undefined,
      change_reason: String(body.change_reason || ""),
      proposer: String(body.proposer || ""),
      citations: Array.isArray(body.citations) ? body.citations : []
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error: any) {
    const code = String(error?.message || "");
    if (
      code === "INVALID_REQUIRED_FIELDS" ||
      code === "BOUNDARY_CONDITIONS_REQUIRED" ||
      code === "CITATIONS_REQUIRED" ||
      code === "INVALID_CITATION_FIELDS"
    ) {
      return NextResponse.json({ error: code }, { status: 400 });
    }
    return NextResponse.json({ error: "create draft failed" }, { status: 500 });
  }
}
