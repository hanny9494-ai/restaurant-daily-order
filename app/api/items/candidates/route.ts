import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { importCandidates, listItemCandidates } from "@/lib/ops/items";

export async function GET(request: NextRequest) {
  return handle(() => {
    requireStaff(request, "CHEF");
    const rows = listItemCandidates();
    return { data: rows, pending_merge: rows.filter((r) => !r.matched_item_id) };
  });
}

// body: { rows: [{ name, base_unit, category, storage_location, default_supplier_id, aliases }] }
export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    const body = await readJson(request);
    return { data: importCandidates(body.rows, actor) };
  });
}
