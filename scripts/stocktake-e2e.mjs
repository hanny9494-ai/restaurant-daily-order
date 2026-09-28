// End-to-end: opening stocktake APPROVED -> one week of receiving (incl. reject + late return)
// -> revenue entry -> closing stocktake APPROVED -> food cost / cost rate with exact numbers.
// Usage: npm run build && node scripts/stocktake-e2e.mjs   (or E2E_BASE_URL=... against a server with STOCKTAKE_TIMING=END_OF_DAY)
import * as XLSX from "xlsx";
import { startServer, makeClient, check, near, passedCount } from "./lib/e2e-server.mjs";

async function main() {
  const server = await startServer("stocktake");
  const api = makeClient(server.baseUrl);
  try {
    console.log("1. staff, supplier, items (生抽 has 箱 = 12 瓶)");
    const admin = (await api.post("/api/staff", { name: "E2E店长", pin: "8888" }, { token: "" })).data;
    await api.login(admin.id, "8888");
    const counter = (await api.post("/api/staff", { name: "盘点阿华", pin: "4444", role: "RECEIVER" })).data;
    const chef = (await api.post("/api/staff", { name: "主厨阿伟", pin: "5555", role: "CHEF" })).data;
    const counterToken = await api.login(counter.id, "4444");
    const chefToken = await api.login(chef.id, "5555");
    api.setToken(chefToken);
    const supplier = (await api.post("/api/suppliers", { name: "E2E肉行" })).data;
    const beef = (await api.post("/api/items", { name: "牛肉", category: "肉", base_unit: "千克", storage_location: "冷藏", default_supplier_id: supplier.id })).data;
    const soy = (await api.post("/api/items", {
      name: "生抽", category: "调料", base_unit: "瓶", storage_location: "干仓", default_supplier_id: supplier.id,
      units: [{ unit: "箱", factor_to_base: 12 }]
    })).data;
    const stationId = (await api.get("/api/stations")).data[0].id;

    async function receiveDay(date, lines) {
      await api.post("/api/order", {
        items: lines.map((l) => ({ date, station_id: stationId, supplier_id: supplier.id, item_name: l.name, quantity: String(l.ordered), unit: l.unit }))
      }, { token: "" });
      const cmp = (await api.get(`/api/receiving/compare?date=${date}&supplier_id=${supplier.id}`, { token: counterToken })).data;
      const payload = lines.map((l) => {
        const row = cmp.rows.find((r) => r.item_name === l.name);
        return {
          daily_list_item_id: row.daily_list_item_id,
          received_quantity: l.received ?? l.ordered,
          rejected_quantity: l.rejected || 0,
          reject_reason: l.rejected ? "品质不合格" : undefined,
          input_unit_price: l.price,
          price_unit: l.price_unit || l.unit
        };
      });
      return (await api.post("/api/receiving/confirm", { date, supplier_id: supplier.id, complete: true, lines: payload }, { token: counterToken })).data;
    }

    console.log("2. price history before opening count (01-04: 牛肉 @80/千克, 生抽 @12/瓶)");
    await receiveDay("2026-01-04", [
      { name: "牛肉", ordered: 10, unit: "千克", price: 80 },
      { name: "生抽", ordered: 5, unit: "瓶", price: 12 }
    ]);

    console.log("3. opening stocktake 2026-01-05");
    await api.post("/api/stocktakes", { stocktake_date: "2026-01-05", kind: "WEEKLY" }, { token: counterToken, expect: 403 });
    let open = (await api.post("/api/stocktakes", { stocktake_date: "2026-01-05", kind: "WEEKLY" })).data;
    check(open.status === "DRAFT" && open.lines.length === 2, "opening stocktake has a line per active item");
    check(open.lines.every((l) => l.quantity === null), "lines start as NOT counted (null, not 0)");
    api.setToken(counterToken);
    await api.post(`/api/stocktakes/${open.id}/counts`, { counts: [{ item_id: beef.id, input_quantity: 10, input_unit: "千克" }] });
    const blocked = await api.post(`/api/stocktakes/${open.id}/submit`, {}, { expect: 409 });
    check(blocked.error === "UNCOUNTED_ITEMS" && blocked.detail.uncounted.length === 1 && blocked.detail.uncounted[0].item_name === "生抽", "submit warns about uncounted 生抽");
    await api.post(`/api/stocktakes/${open.id}/counts`, { counts: [{ item_id: soy.id, input_quantity: 5, input_unit: "瓶" }] });
    open = (await api.post(`/api/stocktakes/${open.id}/submit`, {})).data;
    check(open.status === "SUBMITTED", "opening stocktake SUBMITTED");
    await api.post(`/api/stocktakes/${open.id}/approve`, {}, { expect: 403 });
    open = (await api.post(`/api/stocktakes/${open.id}/approve`, {}, { token: chefToken })).data;
    check(open.status === "APPROVED" && near(open.total_value, 860), "opening APPROVED: 10x80 + 5x12 = 860", open.total_value);
    await api.post(`/api/stocktakes/${open.id}/counts`, { counts: [{ item_id: beef.id, input_quantity: 1 }] }, { expect: 409 });

    console.log("4. one week of receiving");
    await receiveDay("2026-01-07", [
      { name: "牛肉", ordered: 20, unit: "千克", price: 85 },
      { name: "生抽", ordered: 1, unit: "箱", price: 132, price_unit: "箱" }
    ]);
    await receiveDay("2026-01-09", [{ name: "牛肉", ordered: 10, unit: "千克", received: 10, rejected: 2, price: 85 }]);
    const cmp07 = (await api.get(`/api/receiving/compare?date=2026-01-07&supplier_id=${supplier.id}`)).data;
    const beef07 = cmp07.rows.find((r) => r.item_name === "牛肉").receiving;
    const ret = (await api.post("/api/discrepancies", {
      type: "RETURN_LATER", receiving_item_id: beef07.receiving_item_id, quantity: 1, reason: "筋膜太多退回", effective_date: "2026-01-10"
    })).data;
    check(near(ret.adjustment_amount, -85), "late return 1千克 牛肉 = -85");
    const soyPrice = await api.get(`/api/items/${soy.id}/prices`);
    check(near(soyPrice.latest.base_unit_price, 11), "生抽 bought per 箱 @132 -> 11/瓶 base price");

    console.log("5. revenue entry");
    api.setToken(chefToken);
    await api.post("/api/revenue", { start_date: "2026-01-06", end_date: "2026-01-12", amount: 10675, note: "第2周" });
    await api.post("/api/revenue", { start_date: "2026-01-12", amount: 1 }, { expect: 409 });

    console.log("6. closing stocktake 2026-01-12 (生抽 counted in 箱)");
    let close = (await api.post("/api/stocktakes", { stocktake_date: "2026-01-12" })).data;
    check(close.lines.find((l) => l.item_id === beef.id).prev_quantity === 10, "previous count shown as reference");
    await api.post(`/api/stocktakes/${close.id}/counts`, { counts: [{ item_id: beef.id, input_quantity: 12, input_unit: "千克" }] }, { token: counterToken });
    close = (await api.post(`/api/stocktakes/${close.id}/counts`, { counts: [{ item_id: soy.id, input_quantity: 1, input_unit: "箱" }] }, { token: counterToken })).data.stocktake;
    check(near(close.lines.find((l) => l.item_id === soy.id).quantity, 12), "1 箱 converted to 12 瓶");
    await api.post(`/api/stocktakes/${close.id}/submit`, {}, { token: counterToken });
    close = (await api.post(`/api/stocktakes/${close.id}/approve`, {})).data;
    const beefLine = close.lines.find((l) => l.item_id === beef.id);
    check(near(beefLine.unit_price_snapshot, 85) && near(beefLine.value, 1020), "牛肉 12 x 85 = 1020 (price snapshot)");
    check(near(close.total_value, 1152), "closing APPROVED: 1020 + 12x11 = 1152", close.total_value);

    console.log("7. food cost + cost rate");
    let cost = (await api.get("/api/cost")).data;
    let p = cost.periods[0];
    check(cost.periods.length === 1 && p.start_date === "2026-01-05" && p.end_date === "2026-01-12", "one cost period between the two approved counts");
    check(p.purchase_window.from === "2026-01-06" && p.purchase_window.to === "2026-01-12", "purchase window (01-05, 01-12]");
    check(near(p.totals.opening, 860) && near(p.totals.purchases, 2427) && near(p.totals.closing, 1152), "opening 860, purchases 1700+132+680-85 = 2427, closing 1152", p.totals);
    check(near(p.food_cost, 2135), "food cost = 860 + 2427 - 1152 = 2135");
    check(near(p.revenue, 10675) && near(p.food_cost_rate, 0.2, 1e-6), "revenue 10675 -> food cost rate 20.00%");
    const meat = p.categories.find((c) => c.category === "肉");
    const sauce = p.categories.find((c) => c.category === "调料");
    check(near(meat.opening, 800) && near(meat.purchases, 2295) && near(meat.closing, 1020) && near(meat.consumption, 2075), "肉: 800 + 2295 - 1020 = 2075", meat);
    check(near(sauce.consumption, 60) && near(meat.share, 0.9719, 1e-4) && near(sauce.share, 0.0281, 1e-4), "调料 60; shares 97.19% / 2.81%");
    const beefUse = p.items.find((i) => i.item_id === beef.id);
    const soyUse = p.items.find((i) => i.item_id === soy.id);
    check(near(beefUse.consumption, 25) && near(soyUse.consumption, 5), "consumption: 牛肉 10+27-12 = 25千克, 生抽 5+12-12 = 5瓶");

    console.log("8. snapshot prices are frozen after later price changes");
    await receiveDay("2026-01-13", [{ name: "牛肉", ordered: 5, unit: "千克", price: 100 }]);
    cost = (await api.get("/api/cost")).data;
    p = cost.periods[0];
    check(near(p.totals.closing, 1152) && near(p.food_cost, 2135), "later purchase @100 does not change approved report");

    const buf = await api.get("/api/cost/export");
    const wb = XLSX.read(buf, { type: "buffer" });
    const catRows = XLSX.utils.sheet_to_json(wb.Sheets["品类成本"]);
    const total = catRows.find((r) => r["品类"] === "合计");
    check(near(total["消耗(食材成本)"], 2135), "xlsx 品类成本 total 2135");
    const trend = XLSX.utils.sheet_to_json(wb.Sheets["成本率趋势"]);
    check(trend.length === 1 && near(trend[0]["食材成本率"], 0.2, 1e-6), "xlsx 成本率趋势 0.2");

    console.log(`\nstocktake e2e PASSED (${passedCount()} checks)`);
  } catch (error) {
    console.error(String(error?.stack || error));
    if (server.log) console.error("---- server log (tail) ----\n" + server.log().slice(-4000));
    process.exitCode = 1;
  } finally {
    await server.stop();
  }
}

main();
