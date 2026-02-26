import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { convertUnitPrice, normalizeUnitAlias } from "@/lib/unit-convert";
import type {
  CreateOrderPayload,
  DailyListItem,
  DailyListMeta,
  OrderItem,
  Station,
  Supplier,
  UnitOption
} from "@/lib/types";

const runtimeDbBase = process.env.VERCEL ? os.tmpdir() : process.cwd();
const dbDir = path.join(runtimeDbBase, "data");
const dbPath = path.join(dbDir, "app.db");

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  station_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  unit TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (station_id) REFERENCES stations(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS daily_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  receiving_locked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_list_id INTEGER NOT NULL,
  supplier_id INTEGER NOT NULL,
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  total_quantity TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (daily_list_id) REFERENCES daily_lists(id),
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS receiving_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  daily_list_item_id INTEGER NOT NULL UNIQUE,
  quality_ok INTEGER NOT NULL DEFAULT 1,
  unit_price REAL,
  input_unit_price REAL,
  price_unit TEXT,
  receive_note TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (daily_list_item_id) REFERENCES daily_list_items(id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_date ON order_items(date);
CREATE INDEX IF NOT EXISTS idx_order_items_supplier ON order_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_daily_lists_date ON daily_lists(date);
CREATE INDEX IF NOT EXISTS idx_daily_list_items_list_id ON daily_list_items(daily_list_id);
CREATE INDEX IF NOT EXISTS idx_daily_list_items_supplier ON daily_list_items(supplier_id);
`);

const dailyListsColumns = db.prepare("PRAGMA table_info(daily_lists)").all() as Array<{ name: string }>;
if (!dailyListsColumns.some((col) => col.name === "receiving_locked_at")) {
  db.exec("ALTER TABLE daily_lists ADD COLUMN receiving_locked_at TEXT");
}
const receivingItemColumns = db.prepare("PRAGMA table_info(receiving_items)").all() as Array<{ name: string }>;
if (!receivingItemColumns.some((col) => col.name === "input_unit_price")) {
  db.exec("ALTER TABLE receiving_items ADD COLUMN input_unit_price REAL");
}
if (!receivingItemColumns.some((col) => col.name === "price_unit")) {
  db.exec("ALTER TABLE receiving_items ADD COLUMN price_unit TEXT");
}

const defaultStations = ["Hot", "Cold", "Prep", "Pastry", "Fish", "GM"];

const syncStations = db.transaction(() => {
  const upsert = db.prepare("INSERT INTO stations(name, is_active) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET is_active = 1");
  for (const name of defaultStations) {
    upsert.run(name);
  }
});

syncStations();

const defaultSuppliers = [
  "菜佬",
  "盒马",
  "员工餐",
  "香记",
  "心意",
  "西诺蒂斯",
  "美食富",
  "花草",
  "杂货",
  "试菜"
];

const syncSuppliers = db.transaction(() => {
  const upsert = db.prepare("INSERT INTO suppliers(name, is_active) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET is_active = 1");

  for (const name of defaultSuppliers) {
    upsert.run(name);
  }
});

syncSuppliers();

const defaultUnits = ["克", "千克", "条", "个", "箱"];

const syncUnits = db.transaction(() => {
  const upsert = db.prepare("INSERT INTO units(name, is_active) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET is_active = 1");
  for (const name of defaultUnits) {
    upsert.run(name);
  }
});

syncUnits();

export function getStations(): Station[] {
  return db.prepare("SELECT id, name, is_active FROM stations WHERE is_active = 1 ORDER BY id ASC").all() as Station[];
}

export function getSuppliers(includeInactive = false): Supplier[] {
  if (includeInactive) {
    return db.prepare("SELECT id, name, is_active FROM suppliers ORDER BY id ASC").all() as Supplier[];
  }
  return db.prepare("SELECT id, name, is_active FROM suppliers WHERE is_active = 1 ORDER BY id ASC").all() as Supplier[];
}

export function addSupplier(name: string) {
  const cleanName = name.trim();
  if (!cleanName) {
    return null;
  }

  db.prepare("INSERT INTO suppliers(name, is_active) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET is_active = 1")
    .run(cleanName);

  return db
    .prepare("SELECT id, name, is_active FROM suppliers WHERE name = ? LIMIT 1")
    .get(cleanName) as Supplier;
}

export function setSupplierActive(id: number, isActive: number) {
  db.prepare("UPDATE suppliers SET is_active = ? WHERE id = ?").run(isActive, id);
  return db.prepare("SELECT id, name, is_active FROM suppliers WHERE id = ?").get(id) as Supplier | undefined;
}

export function renameSupplier(id: number, name: string) {
  const cleanName = name.trim();
  if (!cleanName) return null;
  db.prepare("UPDATE suppliers SET name = ? WHERE id = ?").run(cleanName, id);
  return db.prepare("SELECT id, name, is_active FROM suppliers WHERE id = ?").get(id) as Supplier | undefined;
}

export function softDeleteSupplier(id: number) {
  db.prepare("UPDATE suppliers SET is_active = 0 WHERE id = ?").run(id);
  return db.prepare("SELECT id, name, is_active FROM suppliers WHERE id = ?").get(id) as Supplier | undefined;
}

export function getUnits(includeInactive = false): UnitOption[] {
  if (includeInactive) {
    return db.prepare("SELECT id, name, is_active FROM units ORDER BY id ASC").all() as UnitOption[];
  }
  return db.prepare("SELECT id, name, is_active FROM units WHERE is_active = 1 ORDER BY id ASC").all() as UnitOption[];
}

export function addUnit(name: string) {
  const cleanName = name.trim();
  if (!cleanName) {
    return null;
  }

  db.prepare("INSERT INTO units(name, is_active) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET is_active = 1")
    .run(cleanName);

  return db
    .prepare("SELECT id, name, is_active FROM units WHERE name = ? LIMIT 1")
    .get(cleanName) as UnitOption;
}

export function setUnitActive(id: number, isActive: number) {
  db.prepare("UPDATE units SET is_active = ? WHERE id = ?").run(isActive, id);
  return db.prepare("SELECT id, name, is_active FROM units WHERE id = ?").get(id) as UnitOption | undefined;
}

export function renameUnit(id: number, name: string) {
  const cleanName = name.trim();
  if (!cleanName) return null;
  db.prepare("UPDATE units SET name = ? WHERE id = ?").run(cleanName, id);
  return db.prepare("SELECT id, name, is_active FROM units WHERE id = ?").get(id) as UnitOption | undefined;
}

export function softDeleteUnit(id: number) {
  db.prepare("UPDATE units SET is_active = 0 WHERE id = ?").run(id);
  return db.prepare("SELECT id, name, is_active FROM units WHERE id = ?").get(id) as UnitOption | undefined;
}

export function createOrderItem(payload: CreateOrderPayload) {
  const stmt = db.prepare(`
    INSERT INTO order_items (
      date, station_id, supplier_id, item_name, quantity, unit, note, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')
  `);

  const result = stmt.run(
    payload.date,
    payload.station_id,
    payload.supplier_id,
    payload.item_name.trim(),
    payload.quantity.trim(),
    payload.unit.trim(),
    payload.note?.trim() || null
  );

  return result.lastInsertRowid;
}

export function createOrderItemsBulk(payloads: CreateOrderPayload[]) {
  const stmt = db.prepare(`
    INSERT INTO order_items (
      date, station_id, supplier_id, item_name, quantity, unit, note, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted')
  `);

  const insertMany = db.transaction((rows: CreateOrderPayload[]) => {
    const ids: number[] = [];
    for (const row of rows) {
      const result = stmt.run(
        row.date,
        row.station_id,
        row.supplier_id,
        row.item_name.trim(),
        row.quantity.trim(),
        row.unit.trim(),
        row.note?.trim() || null
      );
      ids.push(Number(result.lastInsertRowid));
    }
    return ids;
  });

  return insertMany(payloads);
}

export function getOrderItemsByDate(date: string): OrderItem[] {
  const stmt = db.prepare(`
    SELECT
      oi.id,
      oi.date,
      oi.station_id,
      st.name AS station_name,
      oi.supplier_id,
      sp.name AS supplier_name,
      oi.item_name,
      oi.quantity,
      oi.unit,
      oi.note,
      oi.status,
      oi.created_at
    FROM order_items oi
    JOIN stations st ON st.id = oi.station_id
    JOIN suppliers sp ON sp.id = oi.supplier_id
    WHERE oi.date = ?
    ORDER BY oi.created_at DESC, oi.id DESC
  `);

  return stmt.all(date) as OrderItem[];
}

export function getOrderItemsByDateRange(startDate: string, endDate: string): OrderItem[] {
  const stmt = db.prepare(`
    SELECT
      oi.id,
      oi.date,
      oi.station_id,
      st.name AS station_name,
      oi.supplier_id,
      sp.name AS supplier_name,
      oi.item_name,
      oi.quantity,
      oi.unit,
      oi.note,
      oi.status,
      oi.created_at
    FROM order_items oi
    JOIN stations st ON st.id = oi.station_id
    JOIN suppliers sp ON sp.id = oi.supplier_id
    WHERE oi.date BETWEEN ? AND ?
    ORDER BY oi.date DESC, oi.created_at DESC, oi.id DESC
  `);

  return stmt.all(startDate, endDate) as OrderItem[];
}

function toNumber(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function generateDailyListSnapshot(date: string) {
  const insertList = db.prepare("INSERT INTO daily_lists(date) VALUES (?)");
  const insertItem = db.prepare(`
    INSERT INTO daily_list_items (
      daily_list_id, supplier_id, item_name, unit, total_quantity, source_count
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const updateItem = db.prepare(`
    UPDATE daily_list_items
    SET total_quantity = ?, source_count = ?
    WHERE id = ?
  `);
  const getList = db.prepare("SELECT id, receiving_locked_at FROM daily_lists WHERE date = ? LIMIT 1");
  const getExistingItems = db.prepare(`
    SELECT id, supplier_id, item_name, unit
    FROM daily_list_items
    WHERE daily_list_id = ?
  `);
  const hasReceivingByItem = db.prepare("SELECT id FROM receiving_items WHERE daily_list_item_id = ? LIMIT 1");
  const deleteItem = db.prepare("DELETE FROM daily_list_items WHERE id = ?");

  const run = db.transaction(() => {
    let list = getList.get(date) as { id: number; receiving_locked_at: string | null } | undefined;
    if (!list) {
      const listResult = insertList.run(date);
      list = { id: Number(listResult.lastInsertRowid), receiving_locked_at: null };
    }

    if (list.receiving_locked_at) {
      return list.id;
    }

    const orders = getOrderItemsByDate(date);
    const merged = new Map<string, {
      supplier_id: number;
      item_name: string;
      unit: string;
      total: number;
      source_count: number;
    }>();

    for (const order of orders) {
      const key = `${order.supplier_id}::${order.item_name}::${order.unit}`;
      const existing = merged.get(key);
      if (existing) {
        existing.total += toNumber(order.quantity);
        existing.source_count += 1;
      } else {
        merged.set(key, {
          supplier_id: order.supplier_id,
          item_name: order.item_name,
          unit: order.unit,
          total: toNumber(order.quantity),
          source_count: 1
        });
      }
    }

    const existingRows = getExistingItems.all(list.id) as Array<{
      id: number;
      supplier_id: number;
      item_name: string;
      unit: string;
    }>;
    const existingMap = new Map<string, number>();
    for (const row of existingRows) {
      const key = `${row.supplier_id}::${row.item_name}::${row.unit}`;
      existingMap.set(key, row.id);
    }

    for (const row of Array.from(merged.values())) {
      const key = `${row.supplier_id}::${row.item_name}::${row.unit}`;
      const existingId = existingMap.get(key);
      if (existingId) {
        updateItem.run(String(row.total), row.source_count, existingId);
      } else {
        insertItem.run(
          list.id,
          row.supplier_id,
          row.item_name,
          row.unit,
          String(row.total),
          row.source_count
        );
      }
    }

    for (const row of existingRows) {
      const key = `${row.supplier_id}::${row.item_name}::${row.unit}`;
      if (merged.has(key)) continue;
      const hasReceiving = hasReceivingByItem.get(row.id) as { id: number } | undefined;
      if (!hasReceiving) {
        deleteItem.run(row.id);
      }
    }

    return list.id;
  });

  return run();
}

export function getDailyListMetaByDate(date: string): DailyListMeta {
  const row = db
    .prepare("SELECT date, receiving_locked_at FROM daily_lists WHERE date = ? LIMIT 1")
    .get(date) as { date: string; receiving_locked_at: string | null } | undefined;

  if (!row) {
    return {
      date,
      is_locked: false,
      receiving_locked_at: null
    };
  }

  return {
    date: row.date,
    is_locked: Boolean(row.receiving_locked_at),
    receiving_locked_at: row.receiving_locked_at
  };
}

export function unlockDailyListByDate(date: string): DailyListMeta {
  const result = db
    .prepare("UPDATE daily_lists SET receiving_locked_at = NULL WHERE date = ?")
    .run(date);

  if (result.changes !== 1) {
    throw new Error("DAILY_LIST_NOT_FOUND");
  }

  return getDailyListMetaByDate(date);
}

export function getDailyListItemsByDate(date: string): DailyListItem[] {
  const list = db.prepare("SELECT id FROM daily_lists WHERE date = ?").get(date) as { id: number } | undefined;
  if (!list) {
    return [];
  }

  const stmt = db.prepare(`
    SELECT
      dli.id,
      dli.daily_list_id,
      dl.date,
      dli.supplier_id,
      sp.name AS supplier_name,
      dli.item_name,
      dli.unit,
      dli.total_quantity,
      dli.source_count,
      ri.quality_ok,
      ri.unit_price,
      ri.input_unit_price,
      ri.price_unit,
      ri.receive_note,
      ri.received_at
    FROM daily_list_items dli
    JOIN daily_lists dl ON dl.id = dli.daily_list_id
    JOIN suppliers sp ON sp.id = dli.supplier_id
    LEFT JOIN receiving_items ri ON ri.daily_list_item_id = dli.id
    WHERE dli.daily_list_id = ?
    ORDER BY dli.id ASC
  `);

  return stmt.all(list.id) as DailyListItem[];
}

export function upsertReceivingItems(items: Array<{
  daily_list_item_id: number;
  quality_ok: number;
  unit_price: number | null;
  input_unit_price: number | null;
  price_unit: string | null;
  receive_note: string;
}>) {
  const stmt = db.prepare(`
    INSERT INTO receiving_items (
      daily_list_item_id, quality_ok, unit_price, input_unit_price, price_unit, receive_note, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(daily_list_item_id) DO UPDATE SET
      quality_ok = excluded.quality_ok,
      unit_price = excluded.unit_price,
      input_unit_price = excluded.input_unit_price,
      price_unit = excluded.price_unit,
      receive_note = excluded.receive_note,
      received_at = datetime('now')
  `);

  const run = db.transaction((rows: typeof items) => {
    for (const row of rows) {
      stmt.run(
        row.daily_list_item_id,
        row.quality_ok,
        row.unit_price,
        row.input_unit_price,
        row.price_unit,
        row.receive_note || null
      );
    }
  });

  run(items);
}

export function upsertReceivingItemsAndLock(
  date: string,
  items: Array<{
    daily_list_item_id: number;
    quality_ok: number;
    input_unit_price: number | null;
    price_unit: string | null;
    receive_note: string;
  }>
) {
  const upsertStmt = db.prepare(`
    INSERT INTO receiving_items (
      daily_list_item_id, quality_ok, unit_price, input_unit_price, price_unit, receive_note, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(daily_list_item_id) DO UPDATE SET
      quality_ok = excluded.quality_ok,
      unit_price = excluded.unit_price,
      input_unit_price = excluded.input_unit_price,
      price_unit = excluded.price_unit,
      receive_note = excluded.receive_note,
      received_at = datetime('now')
  `);
  const hasItemStmt = db.prepare("SELECT id, unit FROM daily_list_items WHERE id = ? AND daily_list_id = ? LIMIT 1");
  const getListStmt = db.prepare("SELECT id, receiving_locked_at FROM daily_lists WHERE date = ? LIMIT 1");
  const lockListStmt = db.prepare("UPDATE daily_lists SET receiving_locked_at = datetime('now') WHERE id = ? AND receiving_locked_at IS NULL");

  const run = db.transaction(() => {
    const list = getListStmt.get(date) as { id: number; receiving_locked_at: string | null } | undefined;
    if (!list) {
      throw new Error("DAILY_LIST_NOT_FOUND");
    }
    if (list.receiving_locked_at) {
      throw new Error("DAILY_LIST_LOCKED");
    }

    for (const row of items) {
      const exists = hasItemStmt.get(row.daily_list_item_id, list.id) as { id: number; unit: string } | undefined;
      if (!exists) {
        throw new Error("INVALID_DAILY_LIST_ITEM");
      }

      const orderUnit = exists.unit;
      const priceUnit = normalizeUnitAlias(row.price_unit?.trim() || orderUnit);
      const inputUnitPrice = row.input_unit_price;
      let normalizedUnitPrice: number | null = null;

      if (row.quality_ok === 1 && inputUnitPrice !== null) {
        const converted = convertUnitPrice(inputUnitPrice, priceUnit, orderUnit);
        if (converted === null) {
          throw new Error("INVALID_PRICE_UNIT_CONVERSION");
        }
        normalizedUnitPrice = converted;
      }

      upsertStmt.run(
        row.daily_list_item_id,
        row.quality_ok,
        normalizedUnitPrice,
        row.quality_ok === 1 ? inputUnitPrice : null,
        row.quality_ok === 1 ? priceUnit : null,
        row.receive_note || null
      );
    }

    const lockResult = lockListStmt.run(list.id);
    if (lockResult.changes !== 1) {
      throw new Error("DAILY_LIST_LOCKED");
    }
  });

  run();
}

export function getReceivingPriceRowsByDateRange(startDate: string, endDate: string) {
  const stmt = db.prepare(`
    SELECT
      dl.date AS date,
      dli.supplier_id AS supplier_id,
      dli.item_name AS item_name,
      dli.unit AS unit,
      ri.quality_ok AS quality_ok,
      ri.unit_price AS unit_price,
      ri.input_unit_price AS input_unit_price,
      ri.price_unit AS price_unit
    FROM receiving_items ri
    JOIN daily_list_items dli ON dli.id = ri.daily_list_item_id
    JOIN daily_lists dl ON dl.id = dli.daily_list_id
    WHERE dl.date BETWEEN ? AND ?
  `);

  return stmt.all(startDate, endDate) as Array<{
    date: string;
    supplier_id: number;
    item_name: string;
    unit: string;
    quality_ok: number | null;
    unit_price: number | null;
    input_unit_price: number | null;
    price_unit: string | null;
  }>;
}

export function deleteOrderItem(id: number) {
  return db.prepare("DELETE FROM order_items WHERE id = ?").run(id).changes;
}
