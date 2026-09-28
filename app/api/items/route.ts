import { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/ops/http";
import { requireStaff, staffFromRequest } from "@/lib/ops/auth";

export const dynamic = "force-dynamic";

import { createItem, listItems, ITEM_CATEGORIES, STORAGE_LOCATIONS } from "@/lib/ops/items";

// Catalog read is open (the /order page has no login); prices are behind /api/items/[id]/prices.
export async function GET(request: NextRequest) {
  return handle(() => {
    const includeInactive = request.nextUrl.searchParams.get("include_inactive") === "1";
    if (includeInactive) requireStaff(request, "CHEF");
    return { data: listItems({ includeInactive }), categories: ITEM_CATEGORIES, storage_locations: STORAGE_LOCATIONS };
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const actor = requireStaff(request, "CHEF");
    return { data: createItem(await readJson(request), actor) };
  });
}
