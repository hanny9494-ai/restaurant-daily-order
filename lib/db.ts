import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { CreateOrderPayload, OrderItem, Station, Supplier } from "@/lib/types";

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

CREATE INDEX IF NOT EXISTS idx_order_items_date ON order_items(date);
CREATE INDEX IF NOT EXISTS idx_order_items_supplier ON order_items(supplier_id);
`);

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

export function deleteOrderItem(id: number) {
  return db.prepare("DELETE FROM order_items WHERE id = ?").run(id).changes;
}
