import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { getSupplierStatement } from "@/lib/ops/statement";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request, "CHEF");
    const sp = request.nextUrl.searchParams;
    const from = assertDate(sp.get("start") || localToday());
    const to = assertDate(sp.get("end") || from);
    return {
      data: getSupplierStatement({
        supplier_id: sp.get("supplier_id") ? Number(sp.get("supplier_id")) : null,
        from: from <= to ? from : to,
        to: from <= to ? to : from,
        origin: request.nextUrl.origin
      })
    };
  });
}
