import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { createDiscrepancy, listDiscrepancies } from "@/lib/ops/discrepancies";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request);
    const sp = request.nextUrl.searchParams;
    return {
      data: listDiscrepancies({
        status: sp.get("status") || undefined,
        supplier_id: sp.get("supplier_id") ? Number(sp.get("supplier_id")) : null,
        date_from: sp.get("date_from") || undefined,
        date_to: sp.get("date_to") || undefined,
        unsettled_only: sp.get("unsettled") === "1"
      })
    };
  });
}

// Manual discrepancy, e.g. RETURN_LATER on an already locked day (negative red-letter entry).
export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request);
    const body = await readJson(request);
    return { data: createDiscrepancy(body, actor) };
  });
}
