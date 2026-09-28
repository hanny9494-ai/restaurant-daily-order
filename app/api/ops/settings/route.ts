import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { getOpsConfig, setSetting, OpsError } from "@/lib/ops/common";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request);
    const { ocrMockEnabled, ...config } = getOpsConfig();
    return { data: { ...config, ocr_mock_enabled: ocrMockEnabled } };
  });
}

export async function PATCH(request: NextRequest) {
  return handle(async () => {
    requireStaff(request, "ADMIN");
    const body = await readJson(request);
    if (body.price_deviation_threshold !== undefined) {
      const v = Number(body.price_deviation_threshold);
      if (!Number.isFinite(v) || v <= 0 || v >= 5) throw new OpsError("INVALID_THRESHOLD", 400);
      setSetting("price_deviation_threshold", String(v));
    }
    if (body.stocktake_weekday !== undefined) {
      const v = Number(body.stocktake_weekday);
      if (!Number.isInteger(v) || v < 0 || v > 6) throw new OpsError("INVALID_WEEKDAY", 400);
      setSetting("stocktake_weekday", String(v));
    }
    return { data: getOpsConfig() };
  });
}
