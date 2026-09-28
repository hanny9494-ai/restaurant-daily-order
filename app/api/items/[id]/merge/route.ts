import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { mergeItems, mergeNamesIntoItem } from "@/lib/ops/items";

// body: { names: string[] } to attach free-text names as aliases, or { source_item_id } to merge a duplicate item.
export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    const body = await readJson(request);
    const id = Number(context.params.id);
    if (body.source_item_id) return { data: mergeItems(Number(body.source_item_id), id, actor) };
    return { data: mergeNamesIntoItem(id, Array.isArray(body.names) ? body.names.map(String) : [], actor) };
  });
}
