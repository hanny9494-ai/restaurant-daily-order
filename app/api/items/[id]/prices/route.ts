import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { getLatestBasePrice, getPriceHistory } from "@/lib/ops/items";

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  return handle(() => {
    requireStaff(request);
    const id = Number(context.params.id);
    return { data: getPriceHistory(id, { limit: 100 }), latest: getLatestBasePrice(id) };
  });
}
