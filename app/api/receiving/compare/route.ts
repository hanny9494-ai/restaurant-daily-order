import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { buildComparison } from "@/lib/ops/receiving";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request);
    const date = assertDate(request.nextUrl.searchParams.get("date") || localToday());
    const supplierId = Number(request.nextUrl.searchParams.get("supplier_id"));
    if (!supplierId) throw new OpsError("SUPPLIER_REQUIRED", 400);
    return { data: buildComparison(date, supplierId) };
  });
}
