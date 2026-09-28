import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff } from "@/lib/ops/auth";
import { assertDate, localToday, OpsError } from "@/lib/ops/common";

export const dynamic = "force-dynamic";

import { costReportXlsx } from "@/lib/ops/cost";
import { xlsxResponse } from "@/lib/ops/http";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request, "CHEF");
    const endId = request.nextUrl.searchParams.get("end_stocktake_id");
    return xlsxResponse(costReportXlsx(endId ? Number(endId) : null), `food_cost_${endId || "all"}.xlsx`);
  });
}
