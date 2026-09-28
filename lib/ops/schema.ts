import type Database from "better-sqlite3";

type Db = Database.Database;

function columnNames(db: Db, table: string) {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name));
}

function addColumns(db: Db, table: string, defs: Record<string, string>) {
  const existing = columnNames(db, table);
  for (const [name, def] of Object.entries(defs)) {
    if (!existing.has(name)) {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
      } catch (error: any) {
        // parallel processes (next build workers, multiple instances) may race on the same migration
        if (!String(error?.message || "").includes("duplicate column name")) throw error;
      }
    }
  }
}

/**
 * Incremental, idempotent migration for the receiving loop + inventory/cost module.
 * Only CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN so old databases keep working.
 */
export function migrateOpsSchema(db: Db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('RECEIVER', 'CHEF', 'MANAGER', 'ADMIN')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ops_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_staff_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '其他',
  base_unit TEXT NOT NULL,
  default_supplier_id INTEGER REFERENCES suppliers(id),
  storage_location TEXT NOT NULL DEFAULT '干仓',
  par_level REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS item_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  unit TEXT NOT NULL,
  factor_to_base REAL NOT NULL,
  UNIQUE(item_id, unit)
);

CREATE TABLE IF NOT EXISTS supplier_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL DEFAULT 'PENDING_SEND'
    CHECK (status IN ('PENDING_SEND', 'SENT', 'PARTIAL', 'RECEIVED', 'REVIEWED')),
  sent_at TEXT,
  sent_by TEXT,
  received_at TEXT,
  received_by TEXT,
  received_by_staff_id INTEGER,
  has_discrepancy INTEGER NOT NULL DEFAULT 0,
  reviewed_at TEXT,
  reviewed_by TEXT,
  invoice_total REAL,
  system_total REAL,
  invoice_note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, supplier_id)
);

CREATE TABLE IF NOT EXISTS discrepancies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  receiving_item_id INTEGER REFERENCES receiving_items(id),
  daily_list_item_id INTEGER REFERENCES daily_list_items(id),
  item_id INTEGER REFERENCES items(id),
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('SHORT', 'REJECT_ON_SITE', 'RETURN_LATER', 'EXCHANGE', 'OVER_DELIVERY', 'PRICE_MISMATCH')),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'RESOLVED_RESENT', 'RESOLVED_RETURNED', 'RESOLVED_DEDUCTED', 'SETTLED')),
  quantity REAL NOT NULL DEFAULT 0,
  unit_price REAL,
  expected_unit_price REAL,
  amount REAL NOT NULL DEFAULT 0,
  adjustment_amount REAL NOT NULL DEFAULT 0,
  reason TEXT,
  photo_file_id INTEGER REFERENCES receiving_scan_files(id),
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('AUTO', 'MANUAL')),
  related_receiving_item_id INTEGER,
  resolution_note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_by TEXT,
  resolved_at TEXT,
  settled_by TEXT,
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS receiving_lock_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('LOCK', 'UNLOCK')),
  actor_name TEXT,
  actor_staff_id INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stocktakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_date TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'WEEKLY' CHECK (kind IN ('WEEKLY', 'ADHOC')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED')),
  note TEXT,
  total_value REAL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_by TEXT,
  submitted_at TEXT,
  approved_by TEXT,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS stocktake_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stocktake_id INTEGER NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  storage_location TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  quantity REAL,
  input_quantity REAL,
  input_unit TEXT,
  prev_quantity REAL,
  unit_price_snapshot REAL,
  value REAL,
  counted_by TEXT,
  counted_at TEXT,
  UNIQUE(stocktake_id, item_id)
);

CREATE TABLE IF NOT EXISTS revenue_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  amount REAL NOT NULL,
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_supplier_orders_date ON supplier_orders(date);
CREATE INDEX IF NOT EXISTS idx_discrepancies_supplier_date ON discrepancies(supplier_id, date);
CREATE INDEX IF NOT EXISTS idx_discrepancies_status ON discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_discrepancies_receiving ON discrepancies(receiving_item_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_lines_stocktake ON stocktake_lines(stocktake_id);
CREATE INDEX IF NOT EXISTS idx_stocktakes_status_date ON stocktakes(status, stocktake_date);
CREATE INDEX IF NOT EXISTS idx_revenue_entries_dates ON revenue_entries(start_date, end_date);
`);

  addColumns(db, "order_items", { item_id: "INTEGER" });
  addColumns(db, "daily_list_items", { item_id: "INTEGER", is_extra: "INTEGER NOT NULL DEFAULT 0" });
  addColumns(db, "daily_lists", { reviewed_by: "TEXT", reviewed_by_staff_id: "INTEGER" });
  addColumns(db, "receiving_items", {
    item_id: "INTEGER",
    received_quantity: "REAL",
    rejected_quantity: "REAL",
    reject_reason: "TEXT",
    problem_photo_file_id: "INTEGER",
    ocr_name: "TEXT",
    ocr_quantity: "REAL",
    ocr_unit: "TEXT",
    ocr_unit_price: "REAL",
    match_status: "TEXT",
    reference_unit_price: "REAL",
    received_by: "TEXT",
    received_by_staff_id: "INTEGER"
  });
  addColumns(db, "receiving_scan_files", {
    supplier_id: "INTEGER",
    kind: "TEXT NOT NULL DEFAULT 'INVOICE'",
    ocr_json: "TEXT",
    ocr_status: "TEXT"
  });
  db.exec("CREATE INDEX IF NOT EXISTS idx_order_items_item ON order_items(item_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_daily_list_items_item ON daily_list_items(item_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_receiving_items_item ON receiving_items(item_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_receiving_scan_files_supplier ON receiving_scan_files(service_date, supplier_id)");
}
