// End-to-end: staff -> items -> order -> mark sent -> OCR receiving (mocked) with a short + a reject
// -> discrepancies -> review lock -> late return -> supplier statement xlsx.
// Usage: npm run build && node scripts/receiving-loop-e2e.mjs   (or E2E_BASE_URL=http://host:port with RECEIVING_OCR_MOCK=1)
import * as XLSX from "xlsx";
import { startServer, makeClient, check, near, passedCount, TINY_PNG } from "./lib/e2e-server.mjs";

const D0 = "2026-03-09"; // previous delivery: establishes reference price for 鸡胸
const D = "2026-03-10";
const D1 = "2026-03-11";

async function main() {
  const server = await startServer("receiving");
  const api = makeClient(server.baseUrl);
  try {
    console.log("1. staff bootstrap + PIN login");
    const pub = await api.get("/api/staff", { token: "" });
    check(pub.bootstrap_required === true, "fresh store requires bootstrap");
    const admin = (await api.post("/api/staff", { name: "E2E老板", pin: "9999" }, { token: "" })).data;
    check(admin.role === "ADMIN", "first staff becomes ADMIN");
    await api.post("/api/staff", { name: "E2E闯入者", pin: "0000", role: "ADMIN" }, { token: "", expect: 401 });
    await api.post("/api/staff/login", { staff_id: admin.id, pin: "1234" }, { token: "", expect: 401 });
    const adminToken = await api.login(admin.id, "9999");
    const receiver = (await api.post("/api/staff", { name: "收货阿明", pin: "1111", role: "RECEIVER" })).data;
    const chef = (await api.post("/api/staff", { name: "主厨阿强", pin: "2222", role: "CHEF" })).data;
    check(receiver.role === "RECEIVER" && chef.role === "CHEF", "receiver and chef created");
    const receiverToken = await api.login(receiver.id, "1111");
    const chefToken = await api.login(chef.id, "2222");
    await api.post("/api/staff", { name: "越权", pin: "3333", role: "RECEIVER" }, { token: receiverToken, expect: 403 });

    console.log("2. supplier + item master");
    const supplier = (await api.post("/api/suppliers", { name: "E2E蔬菜行" })).data;
    api.setToken(chefToken);
    const tomato = (await api.post("/api/items", {
      name: "番茄", aliases: ["西红柿"], category: "蔬菜", base_unit: "千克", storage_location: "冷藏", default_supplier_id: supplier.id
    })).data;
    const chicken = (await api.post("/api/items", {
      name: "鸡胸", aliases: ["鸡胸肉"], category: "肉", base_unit: "千克", storage_location: "冷藏", default_supplier_id: supplier.id
    })).data;
    check(tomato.id > 0 && chicken.id > 0, "items created with aliases");
    await api.post("/api/items", { name: "西红柿", base_unit: "千克" }, { expect: 409 });
    const stations = (await api.get("/api/stations")).data;
    const stationId = stations[0].id;

    console.log("3. previous day delivery sets reference price (鸡胸 @30)");
    await api.post("/api/order", { items: [{ date: D0, station_id: stationId, supplier_id: supplier.id, item_name: "鸡胸", quantity: "5", unit: "千克" }] });
    api.setToken(receiverToken);
    const cmp0 = (await api.get(`/api/receiving/compare?date=${D0}&supplier_id=${supplier.id}`)).data;
    check(cmp0.rows.length === 1 && cmp0.rows[0].status === "NO_OCR", "manual receiving without invoice photo is allowed");
    await api.post("/api/receiving/confirm", {
      date: D0, supplier_id: supplier.id, complete: true,
      lines: [{ daily_list_item_id: cmp0.rows[0].daily_list_item_id, received_quantity: 5, input_unit_price: 30, price_unit: "千克" }]
    });

    console.log("4. order (item master + free text) and pending-merge list");
    api.setToken("");
    await api.post("/api/order", {
      items: [
        { date: D, station_id: stationId, supplier_id: supplier.id, item_name: "番茄", quantity: "10", unit: "千克" },
        { date: D, station_id: stationId, supplier_id: supplier.id, item_name: "鸡胸肉", quantity: "5", unit: "千克" },
        { date: D, station_id: stationId, supplier_id: supplier.id, item_name: "神秘香料", quantity: "1", unit: "个" }
      ]
    });
    const orders = (await api.get(`/api/order?date=${D}`)).data;
    const byName = Object.fromEntries(orders.map((o) => [o.item_name, o]));
    check(byName["番茄"].item_id === tomato.id, "order line linked to item by name");
    check(byName["鸡胸"] && byName["鸡胸"].item_id === chicken.id && !byName["鸡胸肉"], "alias 鸡胸肉 linked and stored under canonical name 鸡胸");
    check(byName["神秘香料"].item_id === null, "free-text order line stays unlinked");
    const cands = await api.get("/api/items/candidates", { token: chefToken });
    check(cands.pending_merge.some((c) => c.name === "神秘香料"), "free-text name appears in 待归并 list");
    await api.del(`/api/order/${byName["神秘香料"].id}`);

    console.log("5. supplier order status: PENDING_SEND -> SENT");
    api.setToken(receiverToken);
    let board = (await api.get(`/api/supplier-orders?date=${D}`)).data;
    let so = board.suppliers.find((s) => s.supplier_id === supplier.id);
    check(so.status === "PENDING_SEND" && so.line_count === 2, "board shows supplier PENDING_SEND with 2 lines", so);
    await api.post("/api/supplier-orders/send", { date: D, supplier_ids: [supplier.id] }, { expect: 403 });
    await api.post("/api/supplier-orders/send", { date: D, supplier_ids: [supplier.id] }, { token: chefToken });
    board = (await api.get(`/api/supplier-orders?date=${D}`)).data;
    so = board.suppliers.find((s) => s.supplier_id === supplier.id);
    check(so.status === "SENT" && so.sent_by === "主厨阿强", "marked SENT by chef");

    console.log("6. OCR invoice (mock) and comparison");
    const mock = {
      supplier_name: "E2E蔬菜行",
      items: [
        { name: "西红柿", quantity: 8, unit: "kg", unit_price: 6, amount: 48 },
        { name: "鸡胸肉", quantity: 5, unit: "千克", unit_price: 36, amount: 180 },
        { name: "香葱", quantity: 1, unit: "千克", unit_price: 10, amount: 10 }
      ],
      total: 238
    };
    const ocr = (await api.post("/api/receiving/ocr", { date: D, supplier_id: supplier.id, image: TINY_PNG, file_name: "invoice.png", mime_type: "image/png", mock_ocr: mock })).data;
    check(ocr.scan.scan_file_id > 0 && ocr.scan.ocr.items.length === 3, "invoice image archived and OCR parsed");
    const cmp = ocr.comparison;
    const rowTomato = cmp.rows.find((r) => r.item_id === tomato.id);
    const rowChicken = cmp.rows.find((r) => r.item_id === chicken.id);
    check(rowTomato.status === "QTY_DIFF" && near(rowTomato.ocr_quantity, 8), "番茄 matched via alias 西红柿, kg->千克, qty diff 8 vs 10", rowTomato);
    check(rowChicken.status === "MATCH" && near(rowChicken.ocr_quantity, 5), "鸡胸 matched via alias 鸡胸肉");
    check(rowChicken.price_flag === true && near(rowChicken.reference_unit_price, 30) && near(rowChicken.price_deviation, 0.2), "鸡胸 price 36 flagged vs last 30 (+20% > 15%)", rowChicken);
    check(cmp.extras.length === 1 && cmp.extras[0].ocr_name === "香葱" && cmp.extras[0].status === "EXTRA", "unordered 香葱 shown as EXTRA");
    check(near(cmp.invoice_total_ocr, 238), "invoice total captured from OCR");
    const img = await fetch(`${server.baseUrl}${ocr.scan.file_url}`);
    check(img.ok, "archived invoice image is retrievable");

    console.log("7. receiver confirms: short 番茄, partial reject 鸡胸 (with photo)");
    const photo = (await api.post("/api/receiving/photos", { date: D, supplier_id: supplier.id, image: TINY_PNG, file_name: "bad.png", mime_type: "image/png" })).data;
    const confirm = (await api.post("/api/receiving/confirm", {
      date: D,
      supplier_id: supplier.id,
      complete: true,
      invoice_total: 238,
      lines: [
        { daily_list_item_id: rowTomato.daily_list_item_id, received_quantity: 8, input_unit_price: 6, price_unit: "千克", ocr_name: "西红柿", ocr_quantity: 8, ocr_unit: "kg", ocr_unit_price: 6, scan_file_id: ocr.scan.scan_file_id },
        { daily_list_item_id: rowChicken.daily_list_item_id, received_quantity: 5, rejected_quantity: 1, reject_reason: "不新鲜", problem_photo_file_id: photo.file_id, input_unit_price: 36, price_unit: "千克", scan_file_id: ocr.scan.scan_file_id }
      ]
    })).data;
    check(confirm.status === "RECEIVED" && confirm.has_discrepancy === true, "supplier RECEIVED with discrepancy flag");
    check(near(confirm.system_total, 228) && near(confirm.invoice_diff, 10), "system total 228 vs invoice 238 (diff 10 = 香葱 not accepted)", confirm);

    const discs = (await api.get(`/api/discrepancies?supplier_id=${supplier.id}&date_from=${D}&date_to=${D}`)).data;
    const short = discs.find((d) => d.type === "SHORT");
    const reject = discs.find((d) => d.type === "REJECT_ON_SITE");
    const priceMismatch = discs.find((d) => d.type === "PRICE_MISMATCH");
    check(short && short.item_name === "番茄" && near(short.quantity, 2) && short.status === "OPEN", "SHORT 番茄 2千克 auto-created");
    check(reject && reject.item_name === "鸡胸" && near(reject.quantity, 1) && reject.reason === "不新鲜" && reject.photo_file_id === photo.file_id, "REJECT_ON_SITE 鸡胸 1千克 with reason + photo");
    check(priceMismatch && near(priceMismatch.amount, 24) && near(priceMismatch.expected_unit_price, 30), "PRICE_MISMATCH 鸡胸 (36-30)x4 = 24 pending");

    board = (await api.get(`/api/supplier-orders?date=${D}`)).data;
    so = board.suppliers.find((s) => s.supplier_id === supplier.id);
    check(so.status === "RECEIVED" && so.received_by === "收货阿明" && so.open_discrepancies === 3, "board: RECEIVED by 收货阿明, 3 open discrepancies", so);
    check(board.all_received === true, "all suppliers received");

    console.log("8. review lock (CHEF), unlock needs reason, locked day is read-only");
    await api.post("/api/receiving/review", { date: D }, { expect: 403 });
    const locked = (await api.post("/api/receiving/review", { date: D }, { token: chefToken })).data;
    check(locked.is_locked && locked.reviewed_by === "主厨阿强", "day locked and reviewer recorded");
    check(locked.suppliers.find((s) => s.supplier_id === supplier.id).status === "REVIEWED", "supplier REVIEWED");
    await api.post("/api/receiving/confirm", { date: D, supplier_id: supplier.id, lines: [] }, { expect: 409 });
    await api.post("/api/receiving/review/unlock", { date: D }, { token: chefToken, expect: 400 });
    const unlocked = (await api.post("/api/receiving/review/unlock", { date: D, reason: "补录单价" }, { token: chefToken })).data;
    check(!unlocked.is_locked && unlocked.lock_logs[0].action === "UNLOCK" && unlocked.lock_logs[0].reason === "补录单价", "unlock logged with reason and actor");
    await api.post("/api/receiving/lock", { date: D }, { token: chefToken });
    board = (await api.get(`/api/supplier-orders?date=${D}`)).data;
    check(board.is_locked === true, "legacy /api/receiving/lock route re-locks via staff session");

    console.log("9. resolve discrepancies + late return after lock");
    await api.post(`/api/discrepancies/${priceMismatch.id}/resolve`, { resolution: "RESOLVED_DEDUCTED" }, { token: "", expect: 401 });
    const pm = (await api.post(`/api/discrepancies/${priceMismatch.id}/resolve`, { resolution: "RESOLVED_DEDUCTED", note: "供应商同意按30结" }, { token: chefToken })).data;
    check(pm.status === "RESOLVED_DEDUCTED" && near(pm.adjustment_amount, -24), "price mismatch deducted: adjustment -24");
    const shortResolved = (await api.post(`/api/discrepancies/${short.id}/resolve`, { resolution: "RESOLVED_DEDUCTED" }, { token: receiverToken })).data;
    check(shortResolved.status === "RESOLVED_DEDUCTED" && shortResolved.resolved_by === "收货阿明", "RECEIVER can resolve a discrepancy, resolved_by recorded", shortResolved);
    await api.post("/api/discrepancies/settle", { ids: [short.id] }, { token: receiverToken, expect: 403 });
    check(true, "RECEIVER cannot settle discrepancies (403)");
    const tomatoReceiving = (await api.get(`/api/receiving/compare?date=${D}&supplier_id=${supplier.id}`)).data.rows.find((r) => r.item_id === tomato.id).receiving;
    await api.post("/api/discrepancies", { type: "RETURN_LATER", receiving_item_id: tomatoReceiving.receiving_item_id, quantity: 9, reason: "坏" }, { expect: 400 });
    const ret = (await api.post("/api/discrepancies", {
      type: "RETURN_LATER", receiving_item_id: tomatoReceiving.receiving_item_id, quantity: 1, reason: "开箱发现烂果", effective_date: D1
    })).data;
    check(ret.type === "RETURN_LATER" && near(ret.adjustment_amount, -6) && ret.effective_date === D1, "RETURN_LATER on locked day books -6 red-letter on D+1");

    console.log("10. supplier statement + xlsx export");
    await api.get(`/api/reconciliation?supplier_id=${supplier.id}&start=${D}&end=${D1}`, { expect: 403 });
    api.setToken(chefToken);
    const st = (await api.get(`/api/reconciliation?supplier_id=${supplier.id}&start=${D}&end=${D1}`)).data;
    check(near(st.totals.received_amount, 192), "accepted amount = 8x6 + 4x36 = 192", st.totals);
    check(near(st.totals.returns, -6) && near(st.totals.adjustments, -24), "returns -6, adjustments -24");
    check(near(st.totals.payable, 162), "payable = 192 - 6 - 24 = 162");
    check(st.open_discrepancies.length === 4, "unsettled discrepancies listed (4)", st.open_discrepancies.map((d) => `${d.type}:${d.status}`));
    check(st.scans.length >= 2 && st.scans.every((s) => s.absolute_url.startsWith("http")), "invoice/problem photo links included");

    const buf = await api.get(`/api/reconciliation/export?supplier_id=${supplier.id}&start=${D}&end=${D1}`);
    check(Buffer.isBuffer(buf) && buf.length > 1000, "xlsx downloaded");
    const wb = XLSX.read(buf, { type: "buffer" });
    check(["应付汇总", "每日实收明细", "红冲与调整", "未结差异", "单据图片"].every((n) => wb.SheetNames.includes(n)), "xlsx has all statement sheets", wb.SheetNames);
    const summary = XLSX.utils.sheet_to_json(wb.Sheets["应付汇总"]);
    const totalRow = summary.find((r) => r["日期"] === "合计");
    check(near(totalRow["应付"], 162), "xlsx total payable 162", totalRow);
    const detail = XLSX.utils.sheet_to_json(wb.Sheets["每日实收明细"]);
    check(detail.length === 2 && detail.some((r) => r["品名"] === "鸡胸" && r["拒收数量"] === 1 && r["合格数量"] === 4), "xlsx detail has accepted/rejected qty");

    console.log("11. settle (MANAGER+) and price history");
    await api.post("/api/discrepancies/settle", { ids: [priceMismatch.id] }, { expect: 403 });
    const settled = (await api.post("/api/discrepancies/settle", { ids: [priceMismatch.id, short.id, reject.id] }, { token: adminToken })).data;
    check(settled.settled.length === 2 && settled.skipped.some((s) => s.id === reject.id && s.reason === "STILL_OPEN"), "resolved ones settled, open one skipped");
    const prices = await api.get(`/api/items/${chicken.id}/prices`);
    check(near(prices.latest.base_unit_price, 36) && prices.latest.date === D && prices.data.length === 2, "鸡胸 latest price 36 (history kept: 2 points)");

    console.log(`\nreceiving-loop e2e PASSED (${passedCount()} checks)`);
  } catch (error) {
    console.error(String(error?.stack || error));
    if (server.log) console.error("---- server log (tail) ----\n" + server.log().slice(-4000));
    process.exitCode = 1;
  } finally {
    await server.stop();
  }
}

main();
