import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { getSupplierStatement, statementToXlsx } from "@/lib/ops/statement";
import { xlsxResponse } from "@/lib/ops/http";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request, "CHEF");
    const sp = request.nextUrl.searchParams;
    const a = assertDate(sp.get("start") || localToday());
    const b = assertDate(sp.get("end") || a);
    const [from, to] = a <= b ? [a, b] : [b, a];
    const supplierId = sp.get("supplier_id") ? Number(sp.get("supplier_id")) : null;
    const statement = getSupplierStatement({ supplier_id: supplierId, from, to, origin: request.nextUrl.origin });
    return xlsxResponse(statementToXlsx(statement), `supplier_statement_${supplierId || "all"}_${from}_${to}.xlsx`);
  });
}
