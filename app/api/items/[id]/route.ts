import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { getItem, updateItem } from "@/lib/ops/items";
import { OpsError } from "@/lib/ops/common";

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  return handle(() => {
    requireStaff(request);
    const item = getItem(Number(context.params.id));
    if (!item) throw new OpsError("ITEM_NOT_FOUND", 404);
    return { data: item };
  });
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    return { data: updateItem(Number(context.params.id), await readJson(request), actor) };
  });
}
