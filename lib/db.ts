import Database from "better-sqlite3";
import { convertUnitPrice, normalizeUnitAlias } from "@/lib/unit-convert";
import { resolveDataFile } from "@/lib/data-paths";
import type {
  CreateOrderPayload,
  DailyListItem,
  DailyListMeta,
  FohCheckResult,
  FohCheckResultItem,
  FohMenuDetail,
  ReceivingScanFile,
  RecipeDetail,
  RecipeIngredient,
  RecipeIngredientInput,
  RecipeSummary,
  RecipeUser,
  RecipeUserRole,
  RecipeVersion,
  RecipeVersionComponent,
  OrderItem,
  Station,
  Supplier,
  UnitOption
} from "@/lib/types";

const db = new Database(resolveDataFile(process.env.RECIPES_DB_FILE || "app.db"));

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
  scan_file_id INTEGER,
  receive_note TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (daily_list_item_id) REFERENCES daily_list_items(id),
  FOREIGN KEY (scan_file_id) REFERENCES receiving_scan_files(id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_date ON order_items(date);
CREATE INDEX IF NOT EXISTS idx_order_items_supplier ON order_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_daily_lists_date ON daily_lists(date);
CREATE INDEX IF NOT EXISTS idx_daily_list_items_list_id ON daily_list_items(daily_list_id);
CREATE INDEX IF NOT EXISTS idx_daily_list_items_supplier ON daily_list_items(supplier_id);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS recipe_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  entity_kind TEXT NOT NULL DEFAULT 'ELEMENT' CHECK (entity_kind IN ('COMPOSITE', 'ELEMENT')),
  business_type TEXT NOT NULL DEFAULT 'BACKBONE' CHECK (business_type IN ('MENU', 'BACKBONE')),
  technique_family TEXT,
  recipe_type TEXT NOT NULL DEFAULT 'BACKBONE' CHECK (recipe_type IN ('MENU', 'BACKBONE')),
  menu_cycle TEXT,
  active_version_id INTEGER,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (active_version_id) REFERENCES recipe_versions(id)
);

CREATE TABLE IF NOT EXISTS recipe_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED')),
  servings TEXT,
  instructions TEXT NOT NULL DEFAULT '',
  record_json TEXT NOT NULL DEFAULT '{}',
  change_note TEXT,
  created_by TEXT NOT NULL,
  submitted_at TEXT,
  approved_at TEXT,
  reviewed_by TEXT,
  review_note TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  UNIQUE(recipe_id, version_no)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_version_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  unit TEXT NOT NULL,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recipe_version_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_version_id INTEGER NOT NULL,
  component_kind TEXT NOT NULL CHECK (
    component_kind IN ('RECIPE_REF', 'REFERENCE_PREP', 'RAW_ITEM', 'FINISH_ITEM')
  ),
  child_recipe_id INTEGER,
  child_version_id INTEGER,
  display_name TEXT NOT NULL,
  component_role TEXT,
  section TEXT NOT NULL CHECK (
    section IN ('PREP', 'INTERMEDIATE', 'ASSEMBLY', 'FINISH', 'PLATING')
  ),
  quantity TEXT,
  unit TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_optional INTEGER NOT NULL DEFAULT 0,
  source_ref TEXT,
  prep_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_version_id) REFERENCES recipe_versions(id) ON DELETE CASCADE,
  FOREIGN KEY (child_recipe_id) REFERENCES recipes(id),
  FOREIGN KEY (child_version_id) REFERENCES recipe_versions(id)
);

CREATE TABLE IF NOT EXISTS recipe_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  recipe_version_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
  endpoint TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS foh_guest_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_date TEXT NOT NULL,
  guest_name TEXT,
  table_no TEXT,
  restrictions_json TEXT NOT NULL DEFAULT '[]',
  result_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receiving_scan_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_date TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_id INTEGER NOT NULL REFERENCES daily_menus(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(menu_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_users_email ON recipe_users(email);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe ON recipe_versions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_status ON recipe_versions(status);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_version ON recipe_ingredients(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_recipe_version_components_parent ON recipe_version_components(parent_version_id, section, sort_order);
CREATE INDEX IF NOT EXISTS idx_recipe_version_components_child_recipe ON recipe_version_components(child_recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_version_components_child_version ON recipe_version_components(child_version_id);
CREATE INDEX IF NOT EXISTS idx_recipe_sync_logs_recipe ON recipe_sync_logs(recipe_id);
CREATE INDEX IF NOT EXISTS idx_foh_guest_checks_date ON foh_guest_checks(service_date, created_at);
CREATE INDEX IF NOT EXISTS idx_daily_menu_items_menu ON daily_menu_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_daily_menu_items_recipe ON daily_menu_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_receiving_scan_files_date ON receiving_scan_files(service_date, created_at);
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
if (!receivingItemColumns.some((col) => col.name === "scan_file_id")) {
  db.exec("ALTER TABLE receiving_items ADD COLUMN scan_file_id INTEGER");
}
if (!receivingItemColumns.some((col) => col.name === "is_auto_recognized")) {
  db.exec("ALTER TABLE receiving_items ADD COLUMN is_auto_recognized INTEGER NOT NULL DEFAULT 0");
}
const recipeColumns = db.prepare("PRAGMA table_info(recipes)").all() as Array<{ name: string }>;
if (!recipeColumns.some((col) => col.name === "recipe_type")) {
  db.exec("ALTER TABLE recipes ADD COLUMN recipe_type TEXT NOT NULL DEFAULT 'BACKBONE'");
}
if (!recipeColumns.some((col) => col.name === "entity_kind")) {
  db.exec("ALTER TABLE recipes ADD COLUMN entity_kind TEXT NOT NULL DEFAULT 'ELEMENT'");
}
if (!recipeColumns.some((col) => col.name === "business_type")) {
  db.exec("ALTER TABLE recipes ADD COLUMN business_type TEXT NOT NULL DEFAULT 'BACKBONE'");
}
if (!recipeColumns.some((col) => col.name === "technique_family")) {
  db.exec("ALTER TABLE recipes ADD COLUMN technique_family TEXT");
}
if (!recipeColumns.some((col) => col.name === "menu_cycle")) {
  db.exec("ALTER TABLE recipes ADD COLUMN menu_cycle TEXT");
}
if (!recipeColumns.some((col) => col.name === "import_source")) {
  db.exec("ALTER TABLE recipes ADD COLUMN import_source TEXT NOT NULL DEFAULT 'manual'");
}
db.exec("UPDATE recipes SET recipe_type = 'BACKBONE' WHERE recipe_type IS NULL OR TRIM(recipe_type) = ''");
db.exec("UPDATE recipes SET entity_kind = 'ELEMENT' WHERE entity_kind IS NULL OR TRIM(entity_kind) = ''");
db.exec(`
  UPDATE recipes
  SET business_type = CASE
    WHEN recipe_type IN ('MENU', 'BACKBONE') THEN recipe_type
    ELSE 'BACKBONE'
  END
  WHERE business_type IS NULL OR TRIM(business_type) = ''
`);
db.exec("CREATE INDEX IF NOT EXISTS idx_recipes_type_cycle ON recipes(recipe_type, menu_cycle)");
db.exec("CREATE INDEX IF NOT EXISTS idx_recipes_entity_business ON recipes(entity_kind, business_type, technique_family)");
const recipeVersionColumns = db.prepare("PRAGMA table_info(recipe_versions)").all() as Array<{ name: string }>;
if (!recipeVersionColumns.some((col) => col.name === "record_json")) {
  db.exec("ALTER TABLE recipe_versions ADD COLUMN record_json TEXT NOT NULL DEFAULT '{}'");
}

const recipeUsersSqlRow = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='recipe_users'")
  .get() as { sql?: string } | undefined;
if (recipeUsersSqlRow?.sql && !recipeUsersSqlRow.sql.includes("'FOH'")) {
  db.exec(`
    CREATE TABLE recipe_users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER', 'FOH', 'RECEIVER')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO recipe_users_new(id, name, email, role, is_active, created_at)
    SELECT id, name, email, role, is_active, created_at
    FROM recipe_users;

    DROP TABLE recipe_users;
    ALTER TABLE recipe_users_new RENAME TO recipe_users;
    CREATE INDEX IF NOT EXISTS idx_recipe_users_email ON recipe_users(email);
  `);
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

const defaultRecipeUsers: Array<{ name: string; email: string; role: RecipeUserRole }> = [
  { name: "系统管理员", email: "owner@restaurant.local", role: "OWNER" },
  { name: "行政总厨", email: "chef@restaurant.local", role: "EDITOR" },
  { name: "店长审批", email: "manager@restaurant.local", role: "REVIEWER" },
  { name: "同事查看", email: "viewer@restaurant.local", role: "VIEWER" },
  { name: "前厅同事", email: "foh@restaurant.local", role: "FOH" },
  { name: "收货同事", email: "receiver@restaurant.local", role: "RECEIVER" }
];

const syncRecipeUsers = db.transaction(() => {
  const upsert = db.prepare(`
    INSERT INTO recipe_users(name, email, role, is_active)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      is_active = 1
  `);
  for (const user of defaultRecipeUsers) {
    upsert.run(user.name, user.email, user.role);
  }
});

syncRecipeUsers();

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
      ri.scan_file_id,
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
  scan_file_id?: number | null;
  receive_note: string;
}>) {
  const stmt = db.prepare(`
    INSERT INTO receiving_items (
      daily_list_item_id, quality_ok, unit_price, input_unit_price, price_unit, scan_file_id, receive_note, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(daily_list_item_id) DO UPDATE SET
      quality_ok = excluded.quality_ok,
      unit_price = excluded.unit_price,
      input_unit_price = excluded.input_unit_price,
      price_unit = excluded.price_unit,
      scan_file_id = COALESCE(excluded.scan_file_id, receiving_items.scan_file_id),
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
        row.scan_file_id ?? null,
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
      daily_list_item_id, quality_ok, unit_price, input_unit_price, price_unit, scan_file_id, receive_note, received_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, datetime('now'))
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

export function lockDailyListByDate(date: string, actorEmail: string) {
  ensureActorRole(actorEmail, ["OWNER", "EDITOR"]);
  const list = db
    .prepare("SELECT id, receiving_locked_at FROM daily_lists WHERE date = ? LIMIT 1")
    .get(date) as { id: number; receiving_locked_at: string | null } | undefined;
  if (!list) throw new Error("DAILY_LIST_NOT_FOUND");
  if (list.receiving_locked_at) throw new Error("DAILY_LIST_LOCKED");
  const result = db
    .prepare("UPDATE daily_lists SET receiving_locked_at = datetime('now') WHERE id = ? AND receiving_locked_at IS NULL")
    .run(list.id);
  if (result.changes !== 1) throw new Error("DAILY_LIST_LOCKED");
  return getDailyListMetaByDate(date);
}

export function createReceivingScanFile(input: {
  service_date: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  storage_path: string;
  file_url: string;
  created_by?: string;
}) {
  const result = db.prepare(`
    INSERT INTO receiving_scan_files(
      service_date, original_filename, mime_type, file_size_bytes, storage_path, file_url, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.service_date,
    input.original_filename,
    input.mime_type,
    input.file_size_bytes,
    input.storage_path,
    input.file_url,
    input.created_by?.trim() || null
  );
  return Number(result.lastInsertRowid);
}

export function updateReceivingScanFileUrl(id: number, fileUrl: string) {
  db.prepare("UPDATE receiving_scan_files SET file_url = ? WHERE id = ?").run(fileUrl, id);
}

export function getReceivingScanFileById(id: number): ReceivingScanFile | null {
  const row = db.prepare(`
    SELECT id, service_date, original_filename, mime_type, file_size_bytes, storage_path, file_url, created_by, created_at
    FROM receiving_scan_files
    WHERE id = ?
    LIMIT 1
  `).get(id) as ReceivingScanFile | undefined;
  return row || null;
}

export function listReceivingScanFiles(input: { date?: string; date_from?: string; date_to?: string }) {
  if (input.date) {
    return db.prepare(`
      SELECT id, service_date, original_filename, mime_type, file_size_bytes, storage_path, file_url, created_by, created_at
      FROM receiving_scan_files
      WHERE service_date = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 500
    `).all(input.date) as ReceivingScanFile[];
  }

  const from = input.date_from || "1970-01-01";
  const to = input.date_to || "2999-12-31";
  return db.prepare(`
    SELECT id, service_date, original_filename, mime_type, file_size_bytes, storage_path, file_url, created_by, created_at
    FROM receiving_scan_files
    WHERE service_date BETWEEN ? AND ?
    ORDER BY service_date DESC, created_at DESC, id DESC
    LIMIT 1000
  `).all(from, to) as ReceivingScanFile[];
}

export function confirmScannedReceiving(input: {
  date: string;
  supplier_id: number;
  items: Array<{
    name: string;
    quantity: string;
    unit_id?: number | null;
    unit_temp_id?: string | null;
    unit_price?: number | null;
    price_unit?: string | null;
    quality_ok?: number;
    receive_note?: string;
  }>;
  new_units?: Array<{ name: string; temp_id?: string }>;
  scan_file_id?: number | null;
  actor_email: string;
}) {
  ensureActorRole(input.actor_email, ["OWNER", "EDITOR", "RECEIVER"]);
  const date = String(input.date || "").trim();
  if (!date) throw new Error("DATE_REQUIRED");
  if (!Number.isInteger(input.supplier_id) || input.supplier_id <= 0) throw new Error("INVALID_SUPPLIER");
  if (!Array.isArray(input.items) || input.items.length < 1) throw new Error("INVALID_SCAN_ITEMS");

  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ? LIMIT 1").get(input.supplier_id) as { id: number } | undefined;
  if (!supplier) throw new Error("INVALID_SUPPLIER");
  if (input.scan_file_id !== undefined && input.scan_file_id !== null) {
    const scanFile = db.prepare("SELECT id FROM receiving_scan_files WHERE id = ? LIMIT 1").get(input.scan_file_id) as { id: number } | undefined;
    if (!scanFile) throw new Error("INVALID_SCAN_FILE");
  }

  const createUnitStmt = db.prepare("INSERT INTO units(name, is_active) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET is_active = 1");
  const getUnitByNameStmt = db.prepare("SELECT id, name FROM units WHERE name = ? LIMIT 1");
  const getUnitByIdStmt = db.prepare("SELECT id, name FROM units WHERE id = ? LIMIT 1");
  const getListStmt = db.prepare("SELECT id, receiving_locked_at FROM daily_lists WHERE date = ? LIMIT 1");
  const createListStmt = db.prepare("INSERT INTO daily_lists(date) VALUES (?)");
  const findListItemStmt = db.prepare(`
    SELECT id, unit, total_quantity, source_count
    FROM daily_list_items
    WHERE daily_list_id = ? AND supplier_id = ? AND item_name = ? AND unit = ?
    LIMIT 1
  `);
  const insertListItemStmt = db.prepare(`
    INSERT INTO daily_list_items(daily_list_id, supplier_id, item_name, unit, total_quantity, source_count)
    VALUES (?, ?, ?, ?, ?, 1)
  `);
  const updateListItemStmt = db.prepare(`
    UPDATE daily_list_items
    SET total_quantity = ?, source_count = ?
    WHERE id = ?
  `);
  const upsertReceivingStmt = db.prepare(`
    INSERT INTO receiving_items(
      daily_list_item_id, quality_ok, unit_price, input_unit_price, price_unit, scan_file_id, receive_note, is_auto_recognized, received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(daily_list_item_id) DO UPDATE SET
      quality_ok = excluded.quality_ok,
      unit_price = excluded.unit_price,
      input_unit_price = excluded.input_unit_price,
      price_unit = excluded.price_unit,
      scan_file_id = COALESCE(excluded.scan_file_id, receiving_items.scan_file_id),
      receive_note = excluded.receive_note,
      is_auto_recognized = 1,
      received_at = datetime('now')
  `);

  const run = db.transaction(() => {
    const unitTempMap = new Map<string, number>();
    const newUnitsCreated: Array<{ name: string; id: number }> = [];
    for (const unit of input.new_units || []) {
      const unitName = String(unit?.name || "").trim();
      if (!unitName) continue;
      createUnitStmt.run(unitName);
      const created = getUnitByNameStmt.get(unitName) as { id: number; name: string } | undefined;
      if (!created) continue;
      if (unit.temp_id) unitTempMap.set(String(unit.temp_id), created.id);
      newUnitsCreated.push({ name: created.name, id: created.id });
    }

    let list = getListStmt.get(date) as { id: number; receiving_locked_at: string | null } | undefined;
    if (!list) {
      const created = createListStmt.run(date);
      list = { id: Number(created.lastInsertRowid), receiving_locked_at: null };
    }
    if (list.receiving_locked_at) throw new Error("DAILY_LIST_LOCKED");

    let itemsCreated = 0;
    for (const row of input.items) {
      const itemName = String(row?.name || "").trim();
      const quantityRaw = String(row?.quantity || "").trim();
      const quantityNumber = toNumber(quantityRaw);
      if (!itemName || !quantityRaw || quantityNumber <= 0) throw new Error("INVALID_SCAN_ITEMS");

      const mappedUnitId = row.unit_id ?? (row.unit_temp_id ? unitTempMap.get(String(row.unit_temp_id)) : undefined);
      if (!mappedUnitId || !Number.isInteger(mappedUnitId) || mappedUnitId <= 0) throw new Error("INVALID_UNIT");
      const unitRow = getUnitByIdStmt.get(mappedUnitId) as { id: number; name: string } | undefined;
      if (!unitRow) throw new Error("INVALID_UNIT");

      const existing = findListItemStmt.get(list.id, input.supplier_id, itemName, unitRow.name) as
        | { id: number; unit: string; total_quantity: string; source_count: number }
        | undefined;
      const dailyListItemId = existing
        ? existing.id
        : Number(insertListItemStmt.run(list.id, input.supplier_id, itemName, unitRow.name, quantityRaw).lastInsertRowid);

      if (existing) {
        const nextQty = toNumber(existing.total_quantity) + quantityNumber;
        updateListItemStmt.run(String(nextQty), Number(existing.source_count) + 1, existing.id);
      }

      const qualityOk = row.quality_ok === 0 ? 0 : 1;
      const inputUnitPrice = qualityOk === 1 && row.unit_price !== undefined && row.unit_price !== null
        ? Number(row.unit_price)
        : null;
      const priceUnit = normalizeUnitAlias(String(row.price_unit || unitRow.name).trim() || unitRow.name);
      let normalizedPrice: number | null = null;
      if (qualityOk === 1 && inputUnitPrice !== null) {
        const converted = convertUnitPrice(inputUnitPrice, priceUnit, unitRow.name);
        if (converted === null) throw new Error("INVALID_PRICE_UNIT_CONVERSION");
        normalizedPrice = converted;
      }

      upsertReceivingStmt.run(
        dailyListItemId,
        qualityOk,
        normalizedPrice,
        qualityOk === 1 ? inputUnitPrice : null,
        qualityOk === 1 ? priceUnit : null,
        input.scan_file_id ?? null,
        row.receive_note?.trim() || null
      );
      itemsCreated += 1;
    }

    return {
      daily_list_id: list.id,
      items_created: itemsCreated,
      new_units_created: newUnitsCreated,
      is_locked: false
    };
  });

  return run();
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

function normalizeRecipeCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeMenuCycle(value?: string) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function makeAutoRecipeCode(indexOffset = 0) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const countRow = db
    .prepare("SELECT COUNT(1) AS count FROM recipes WHERE code LIKE ?")
    .get(`AUTO-${y}${m}${d}-%`) as { count: number };
  const seq = Number(countRow.count) + 1 + indexOffset;
  return `AUTO-${y}${m}${d}-${String(seq).padStart(3, "0")}`;
}

function ensureUniqueRecipeCode(baseCode: string) {
  let code = normalizeRecipeCode(baseCode);
  if (!code) code = makeAutoRecipeCode(0);
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? code : `${code}_${suffix}`;
    const exists = db.prepare("SELECT id FROM recipes WHERE code = ? LIMIT 1").get(candidate) as { id: number } | undefined;
    if (!exists) return candidate;
    suffix += 1;
  }
}

type RecipeRecordV2 = {
  meta: {
    dish_code: string;
    dish_name: string;
    recipe_type: "MENU" | "BACKBONE";
    menu_cycle: string | null;
    plating_image_url: string;
  };
  production: {
    servings: string;
    net_yield_rate: number;
    key_temperature_points: Array<{
      step: string;
      temp_c: number;
      hold_sec: number;
      note?: string;
    }>;
  };
  allergens: string[];
  diet_flags?: string[];
  ingredients: Array<{
    name: string;
    quantity: string;
    unit: string;
    note?: string;
  }>;
  steps: Array<{
    step_no: number;
    action: string;
    time_sec: number;
    temp_c?: number;
    ccp?: string;
    note?: string;
  }>;
};

function buildDefaultRecipeRecordV2(input: {
  code: string;
  name: string;
  recipe_type: "MENU" | "BACKBONE";
  menu_cycle?: string | null;
  servings?: string | null;
  ingredients: RecipeIngredientInput[];
  instructions: string;
}): RecipeRecordV2 {
  const lines = String(input.instructions || "")
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    meta: {
      dish_code: input.code,
      dish_name: input.name,
      recipe_type: input.recipe_type,
      menu_cycle: input.recipe_type === "MENU" ? normalizeMenuCycle(input.menu_cycle || "") || null : null,
      plating_image_url: ""
    },
    production: {
      servings: String(input.servings || ""),
      net_yield_rate: 1,
      key_temperature_points: []
    },
    allergens: [],
    diet_flags: [],
    ingredients: input.ingredients.map((item) => ({
      name: String(item.name || "").trim(),
      quantity: String(item.quantity || "").trim(),
      unit: String(item.unit || "").trim(),
      note: String(item.note || "").trim()
    })),
    steps: lines.length
      ? lines.map((line, idx) => ({
          step_no: idx + 1,
          action: line,
          time_sec: 0
        }))
      : [{ step_no: 1, action: "待填写", time_sec: 0 }]
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUnexpectedKeys(obj: Record<string, unknown>, allowedKeys: string[]) {
  return Object.keys(obj).filter((key) => !allowedKeys.includes(key));
}

function validateRecipeRecordV2(input: unknown) {
  const errors: string[] = [];
  if (!isPlainObject(input)) {
    return { ok: false, errors: ["root.object_required"] };
  }
  const record = input as Record<string, unknown>;
  const rootUnexpected = hasUnexpectedKeys(record, ["meta", "production", "allergens", "diet_flags", "ingredients", "steps"]);
  if (rootUnexpected.length > 0) errors.push(`root.additional_properties:${rootUnexpected.join("|")}`);

  if (!("meta" in record)) errors.push("meta.required");
  if (!("production" in record)) errors.push("production.required");
  if (!("allergens" in record)) errors.push("allergens.required");
  if (!("diet_flags" in record)) {
    // optional
  }
  if (!("ingredients" in record)) errors.push("ingredients.required");
  if (!("steps" in record)) errors.push("steps.required");

  const meta = record.meta;
  const production = record.production;
  const allergens = record.allergens;
  const dietFlags = record.diet_flags;
  const ingredients = record.ingredients;
  const steps = record.steps;

  if (!isPlainObject(meta)) {
    errors.push("meta.object_required");
  } else {
    const metaUnexpected = hasUnexpectedKeys(meta, ["dish_code", "dish_name", "recipe_type", "menu_cycle", "plating_image_url"]);
    if (metaUnexpected.length > 0) errors.push(`meta.additional_properties:${metaUnexpected.join("|")}`);
    if (!("dish_code" in meta)) errors.push("meta.dish_code.required");
    if (!("dish_name" in meta)) errors.push("meta.dish_name.required");
    if (!("recipe_type" in meta)) errors.push("meta.recipe_type.required");
    if (!("menu_cycle" in meta)) errors.push("meta.menu_cycle.required");
    if (!("plating_image_url" in meta)) errors.push("meta.plating_image_url.required");

    if (typeof meta.dish_code !== "string" || meta.dish_code.trim().length < 1) errors.push("meta.dish_code.invalid");
    if (typeof meta.dish_name !== "string" || meta.dish_name.trim().length < 1) errors.push("meta.dish_name.invalid");
    if (typeof meta.plating_image_url !== "string") errors.push("meta.plating_image_url.invalid");

    if (meta.recipe_type !== "MENU" && meta.recipe_type !== "BACKBONE") {
      errors.push("meta.recipe_type.invalid");
    } else if (meta.recipe_type === "MENU") {
      if (typeof meta.menu_cycle !== "string" || meta.menu_cycle.trim().length < 1) {
        errors.push("meta.menu_cycle.required_for_menu");
      }
    } else if (meta.recipe_type === "BACKBONE") {
      if (meta.menu_cycle !== null) {
        errors.push("meta.menu_cycle.must_be_null_for_backbone");
      }
    }
  }

  if (!isPlainObject(production)) {
    errors.push("production.object_required");
  } else {
    const productionUnexpected = hasUnexpectedKeys(production, ["servings", "net_yield_rate", "key_temperature_points"]);
    if (productionUnexpected.length > 0) errors.push(`production.additional_properties:${productionUnexpected.join("|")}`);
    if (!("servings" in production)) errors.push("production.servings.required");
    if (!("net_yield_rate" in production)) errors.push("production.net_yield_rate.required");
    if (!("key_temperature_points" in production)) errors.push("production.key_temperature_points.required");

    if (typeof production.servings !== "string") errors.push("production.servings.invalid");
    if (typeof production.net_yield_rate !== "number" || !Number.isFinite(production.net_yield_rate)) {
      errors.push("production.net_yield_rate.invalid");
    } else if (!(production.net_yield_rate > 0 && production.net_yield_rate <= 1)) {
      errors.push("production.net_yield_rate.must_between_0_1");
    }

    if (!Array.isArray(production.key_temperature_points)) {
      errors.push("production.key_temperature_points.array_required");
    } else {
      production.key_temperature_points.forEach((point, idx) => {
        if (!isPlainObject(point)) {
          errors.push(`production.key_temperature_points.${idx}.object_required`);
          return;
        }
        const ptUnexpected = hasUnexpectedKeys(point, ["step", "temp_c", "hold_sec", "note"]);
        if (ptUnexpected.length > 0) {
          errors.push(`production.key_temperature_points.${idx}.additional_properties:${ptUnexpected.join("|")}`);
        }
        if (!("step" in point)) errors.push(`production.key_temperature_points.${idx}.step.required`);
        if (!("temp_c" in point)) errors.push(`production.key_temperature_points.${idx}.temp_c.required`);
        if (!("hold_sec" in point)) errors.push(`production.key_temperature_points.${idx}.hold_sec.required`);

        if (typeof point.step !== "string") errors.push(`production.key_temperature_points.${idx}.step.invalid`);
        if (typeof point.temp_c !== "number" || !Number.isFinite(point.temp_c)) errors.push(`production.key_temperature_points.${idx}.temp_c.invalid`);
        if (typeof point.hold_sec !== "number" || !Number.isFinite(point.hold_sec)) errors.push(`production.key_temperature_points.${idx}.hold_sec.invalid`);
        if ("note" in point && typeof point.note !== "string") errors.push(`production.key_temperature_points.${idx}.note.invalid`);
      });
    }
  }

  if (!Array.isArray(allergens)) {
    errors.push("allergens.array_required");
  } else {
    allergens.forEach((item, idx) => {
      if (typeof item !== "string") errors.push(`allergens.${idx}.string_required`);
    });
  }
  if (dietFlags !== undefined) {
    if (!Array.isArray(dietFlags)) {
      errors.push("diet_flags.array_required");
    } else {
      dietFlags.forEach((item, idx) => {
        if (typeof item !== "string") errors.push(`diet_flags.${idx}.string_required`);
      });
    }
  }

  if (!Array.isArray(ingredients) || ingredients.length < 1) {
    errors.push("ingredients.min_1");
  } else {
    ingredients.forEach((item, idx) => {
      if (!isPlainObject(item)) {
        errors.push(`ingredients.${idx}.object_required`);
        return;
      }
      const ingUnexpected = hasUnexpectedKeys(item, ["name", "quantity", "unit", "note"]);
      if (ingUnexpected.length > 0) errors.push(`ingredients.${idx}.additional_properties:${ingUnexpected.join("|")}`);
      if (!("name" in item)) errors.push(`ingredients.${idx}.name.required`);
      if (!("quantity" in item)) errors.push(`ingredients.${idx}.quantity.required`);
      if (!("unit" in item)) errors.push(`ingredients.${idx}.unit.required`);
      if (typeof item.name !== "string" || item.name.trim().length < 1) errors.push(`ingredients.${idx}.name.invalid`);
      if (typeof item.quantity !== "string" || item.quantity.trim().length < 1) errors.push(`ingredients.${idx}.quantity.invalid`);
      if (typeof item.unit !== "string" || item.unit.trim().length < 1) errors.push(`ingredients.${idx}.unit.invalid`);
      if ("note" in item && typeof item.note !== "string") errors.push(`ingredients.${idx}.note.invalid`);
    });
  }

  if (!Array.isArray(steps) || steps.length < 1) {
    errors.push("steps.min_1");
  } else {
    steps.forEach((item, idx) => {
      if (!isPlainObject(item)) {
        errors.push(`steps.${idx}.object_required`);
        return;
      }
      const stepUnexpected = hasUnexpectedKeys(item, ["step_no", "action", "time_sec", "temp_c", "ccp", "note"]);
      if (stepUnexpected.length > 0) errors.push(`steps.${idx}.additional_properties:${stepUnexpected.join("|")}`);
      if (!("step_no" in item)) errors.push(`steps.${idx}.step_no.required`);
      if (!("action" in item)) errors.push(`steps.${idx}.action.required`);
      if (!("time_sec" in item)) errors.push(`steps.${idx}.time_sec.required`);
      if (typeof item.step_no !== "number" || !Number.isInteger(item.step_no) || item.step_no < 1) {
        errors.push(`steps.${idx}.step_no.invalid`);
      }
      if (typeof item.action !== "string" || item.action.trim().length < 1) errors.push(`steps.${idx}.action.invalid`);
      if (typeof item.time_sec !== "number" || !Number.isFinite(item.time_sec) || item.time_sec < 0) {
        errors.push(`steps.${idx}.time_sec.invalid`);
      }
      if ("temp_c" in item && (typeof item.temp_c !== "number" || !Number.isFinite(item.temp_c))) {
        errors.push(`steps.${idx}.temp_c.invalid`);
      }
      if ("ccp" in item && typeof item.ccp !== "string") errors.push(`steps.${idx}.ccp.invalid`);
      if ("note" in item && typeof item.note !== "string") errors.push(`steps.${idx}.note.invalid`);
    });
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function validateRecipeRecordV2ForDraft(input: unknown) {
  const validation = validateRecipeRecordV2(input);
  if (validation.ok) return validation;
  const filteredErrors = validation.errors.filter((item) => item !== "meta.menu_cycle.required_for_menu");
  return {
    ok: filteredErrors.length === 0,
    errors: filteredErrors
  };
}

function normalizeRecipeRecordV2(input: unknown) {
  const record = (input && typeof input === "object" ? input : {}) as Record<string, any>;
  const output: RecipeRecordV2 = {
    meta: {
      dish_code: String(record?.meta?.dish_code || "").trim(),
      dish_name: String(record?.meta?.dish_name || "").trim(),
      recipe_type: record?.meta?.recipe_type,
      menu_cycle: record?.meta?.recipe_type === "MENU"
        ? normalizeMenuCycle(String(record?.meta?.menu_cycle || ""))
        : null,
      plating_image_url: String(record?.meta?.plating_image_url || "").trim()
    },
    production: {
      servings: String(record?.production?.servings || "").trim(),
      net_yield_rate: Number(record?.production?.net_yield_rate || 0),
      key_temperature_points: Array.isArray(record?.production?.key_temperature_points)
        ? record.production.key_temperature_points.map((point: any) => ({
            step: String(point?.step || "").trim(),
            temp_c: Number(point?.temp_c || 0),
            hold_sec: Number(point?.hold_sec || 0),
            note: String(point?.note || "").trim()
          }))
        : []
    },
    allergens: Array.isArray(record?.allergens)
      ? record.allergens.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [],
    diet_flags: Array.isArray(record?.diet_flags)
      ? record.diet_flags.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [],
    ingredients: Array.isArray(record?.ingredients)
      ? record.ingredients.map((item: any) => ({
          name: String(item?.name || "").trim(),
          quantity: String(item?.quantity || "").trim(),
          unit: String(item?.unit || "").trim(),
          note: String(item?.note || "").trim()
        }))
      : [],
    steps: Array.isArray(record?.steps)
      ? record.steps.map((item: any) => {
          const out: {
            step_no: number;
            action: string;
            time_sec: number;
            temp_c?: number;
            ccp?: string;
            note?: string;
          } = {
            step_no: Number(item?.step_no || 0),
            action: String(item?.action || "").trim(),
            time_sec: Number(item?.time_sec || 0)
          };
          if (item?.temp_c !== undefined && item?.temp_c !== null) out.temp_c = Number(item?.temp_c);
          if (item?.ccp !== undefined) out.ccp = String(item?.ccp || "").trim();
          if (item?.note !== undefined) out.note = String(item?.note || "").trim();
          return out;
        })
      : []
  };

  return output;
}

function isCompositeRecipeRecord(input: unknown): input is {
  meta: {
    dish_code: string;
    dish_name: string;
    entity_kind: "COMPOSITE";
    business_type: "MENU" | "BACKBONE";
    menu_cycle: string | null;
  };
  assembly_components: unknown[];
  assembly_steps: unknown[];
} {
  if (!isPlainObject(input)) return false;
  if (!isPlainObject(input.meta)) return false;
  return input.meta.entity_kind === "COMPOSITE" &&
    Array.isArray((input as any).assembly_components) &&
    Array.isArray((input as any).assembly_steps);
}

function validateCompositeRecordV3Lite(input: unknown) {
  const errors: string[] = [];
  if (!isCompositeRecipeRecord(input)) {
    return { ok: false, errors: ["composite.root.invalid"] };
  }
  const meta = input.meta as Record<string, unknown>;
  if (typeof meta.dish_code !== "string" || meta.dish_code.trim().length < 1) errors.push("composite.meta.dish_code.invalid");
  if (typeof meta.dish_name !== "string" || meta.dish_name.trim().length < 1) errors.push("composite.meta.dish_name.invalid");
  if (meta.business_type !== "MENU" && meta.business_type !== "BACKBONE") errors.push("composite.meta.business_type.invalid");
  if ("menu_cycle" in meta && meta.menu_cycle !== null && typeof meta.menu_cycle !== "string") errors.push("composite.meta.menu_cycle.invalid");
  if (!Array.isArray(input.assembly_components) || input.assembly_components.length < 1) {
    errors.push("composite.assembly_components.min_1");
  }
  if (!Array.isArray(input.assembly_steps) || input.assembly_steps.length < 1) {
    errors.push("composite.assembly_steps.min_1");
  }
  return { ok: errors.length === 0, errors };
}

function getRecipeUserByEmail(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error("ACTOR_REQUIRED");
  }
  const user = db
    .prepare("SELECT id, name, email, role, is_active FROM recipe_users WHERE email = ? LIMIT 1")
    .get(cleanEmail) as RecipeUser | undefined;
  if (!user || user.is_active !== 1) {
    throw new Error("USER_NOT_FOUND");
  }
  return user;
}

function ensureRecipeRole(email: string, allowedRoles: RecipeUserRole[]) {
  const user = getRecipeUserByEmail(email);
  if (!allowedRoles.includes(user.role)) {
    throw new Error("PERMISSION_DENIED");
  }
  return user;
}

function ensureActorRole(email: string, allowedRoles: RecipeUserRole[]) {
  return ensureRecipeRole(email, allowedRoles);
}

function getNextRecipeVersionNo(recipeId: number) {
  const row = db
    .prepare("SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM recipe_versions WHERE recipe_id = ?")
    .get(recipeId) as { next_version: number };
  return row.next_version;
}

function getRecipeVersion(versionId: number) {
  return db
    .prepare(`
      SELECT
        id, recipe_id, version_no, status, servings, instructions, record_json AS recipe_record_json, change_note, created_by,
        submitted_at, approved_at, reviewed_by, review_note, published_at, created_at, updated_at
      FROM recipe_versions
      WHERE id = ?
      LIMIT 1
    `)
    .get(versionId) as Omit<RecipeVersion, "ingredients"> | undefined;
}

function getRecipeIngredients(versionId: number) {
  return db
    .prepare(`
      SELECT id, recipe_version_id, name, quantity, unit, note, sort_order
      FROM recipe_ingredients
      WHERE recipe_version_id = ?
      ORDER BY sort_order ASC, id ASC
    `)
    .all(versionId) as RecipeIngredient[];
}

function getRecipeVersionComponents(versionId: number) {
  return db
    .prepare(`
      SELECT
        id,
        parent_version_id,
        component_kind,
        child_recipe_id,
        child_version_id,
        display_name,
        component_role,
        section,
        quantity,
        unit,
        sort_order,
        is_optional,
        source_ref,
        prep_note
      FROM recipe_version_components
      WHERE parent_version_id = ?
      ORDER BY sort_order ASC, id ASC
    `)
    .all(versionId) as RecipeVersionComponent[];
}

function findRecipeByCode(code: string) {
  return db
    .prepare(`
      SELECT id, code, name, active_version_id
      FROM recipes
      WHERE code = ?
      LIMIT 1
    `)
    .get(code) as { id: number; code: string; name: string; active_version_id: number | null } | undefined;
}

export function getRecipeUsers(includeInactive = false): RecipeUser[] {
  if (includeInactive) {
    return db
      .prepare("SELECT id, name, email, role, is_active FROM recipe_users ORDER BY id ASC")
      .all() as RecipeUser[];
  }
  return db
    .prepare("SELECT id, name, email, role, is_active FROM recipe_users WHERE is_active = 1 ORDER BY id ASC")
    .all() as RecipeUser[];
}

export function listRecipes(): RecipeSummary[] {
  return db
    .prepare(`
      SELECT
        r.id,
        r.code,
        r.name,
        r.description,
        r.entity_kind,
        r.business_type,
        r.technique_family,
        r.recipe_type,
        r.menu_cycle,
        r.active_version_id,
        rv.version_no AS active_version_no,
        rv.status AS active_status,
        r.created_at,
        r.updated_at
      FROM recipes r
      LEFT JOIN recipe_versions rv ON rv.id = r.active_version_id
      ORDER BY r.updated_at DESC, r.id DESC
    `)
    .all() as RecipeSummary[];
}

export function getRecipeDetail(recipeId: number): RecipeDetail | null {
  const recipe = db
    .prepare(`
      SELECT
        r.id,
        r.code,
        r.name,
        r.description,
        r.entity_kind,
        r.business_type,
        r.technique_family,
        r.recipe_type,
        r.menu_cycle,
        r.active_version_id,
        rv.version_no AS active_version_no,
        rv.status AS active_status,
        r.created_at,
        r.updated_at
      FROM recipes r
      LEFT JOIN recipe_versions rv ON rv.id = r.active_version_id
      WHERE r.id = ?
      LIMIT 1
    `)
    .get(recipeId) as RecipeSummary | undefined;

  if (!recipe) return null;

  const versions = db
    .prepare(`
      SELECT
        id, recipe_id, version_no, status, servings, instructions, record_json AS recipe_record_json, change_note, created_by,
        submitted_at, approved_at, reviewed_by, review_note, published_at, created_at, updated_at
      FROM recipe_versions
      WHERE recipe_id = ?
      ORDER BY version_no DESC
    `)
    .all(recipeId) as Array<Omit<RecipeVersion, "ingredients">>;

  return {
    ...recipe,
    versions: versions.map((version) => ({
      ...version,
      ingredients: getRecipeIngredients(version.id),
      components: getRecipeVersionComponents(version.id)
    }))
  };
}

export function createRecipeWithDraft(input: {
  code: string;
  name: string;
  description?: string;
  recipe_type?: "MENU" | "BACKBONE";
  menu_cycle?: string;
  servings?: string;
  instructions: string;
  change_note?: string;
  ingredients: RecipeIngredientInput[];
  created_by: string;
}) {
  const actor = ensureRecipeRole(input.created_by, ["OWNER", "EDITOR"]);
  const code = normalizeRecipeCode(input.code || input.name);
  const name = input.name.trim();
  const recipeType = input.recipe_type === "MENU" ? "MENU" : "BACKBONE";
  const menuCycle = normalizeMenuCycle(input.menu_cycle);
  const instructions = input.instructions.trim();
  if (!code || !name) throw new Error("INVALID_RECIPE_FIELDS");
  if (recipeType === "MENU" && !menuCycle) throw new Error("MENU_CYCLE_REQUIRED");
  if (!instructions) throw new Error("INSTRUCTIONS_REQUIRED");
  if (!Array.isArray(input.ingredients) || input.ingredients.length < 1) {
    throw new Error("INGREDIENTS_REQUIRED");
  }

  const insertRecipe = db.prepare(`
    INSERT INTO recipes(code, name, description, entity_kind, business_type, technique_family, recipe_type, menu_cycle, created_by, updated_at)
    VALUES (?, ?, ?, 'ELEMENT', ?, NULL, ?, ?, ?, datetime('now'))
  `);
  const insertVersion = db.prepare(`
    INSERT INTO recipe_versions(
      recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
    ) VALUES (?, 1, 'DRAFT', ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertIngredient = db.prepare(`
    INSERT INTO recipe_ingredients(recipe_version_id, name, quantity, unit, note, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const setActiveVersion = db.prepare(`
    UPDATE recipes
    SET active_version_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `);

  const tx = db.transaction(() => {
    const record = buildDefaultRecipeRecordV2({
      code,
      name,
      recipe_type: recipeType,
      menu_cycle: recipeType === "MENU" ? menuCycle : null,
      servings: input.servings?.trim() || "",
      ingredients: input.ingredients,
      instructions
    });
    const validation = validateRecipeRecordV2(record);
    if (!validation.ok) throw new Error(`INVALID_RECIPE_RECORD:${validation.errors.join(",")}`);

    const recipeRes = insertRecipe.run(
      code,
      name,
      input.description?.trim() || null,
      recipeType,
      recipeType,
      recipeType === "MENU" ? menuCycle : null,
      actor.email
    );
    const recipeId = Number(recipeRes.lastInsertRowid);
    const versionRes = insertVersion.run(
      recipeId,
      input.servings?.trim() || null,
      instructions,
      JSON.stringify(record),
      input.change_note?.trim() || null,
      actor.email
    );
    const versionId = Number(versionRes.lastInsertRowid);

    input.ingredients.forEach((ingredient, idx) => {
      const ingName = String(ingredient.name || "").trim();
      const quantity = String(ingredient.quantity || "").trim();
      const unit = String(ingredient.unit || "").trim();
      if (!ingName || !quantity || !unit) {
        throw new Error("INVALID_INGREDIENT_FIELDS");
      }
      insertIngredient.run(versionId, ingName, quantity, unit, ingredient.note?.trim() || null, idx + 1);
    });

    setActiveVersion.run(versionId, recipeId);
    return recipeId;
  });

  return getRecipeDetail(tx());
}

export function createRecipeRevision(recipeId: number, createdBy: string) {
  const actor = ensureRecipeRole(createdBy, ["OWNER", "EDITOR"]);
  const existing = getRecipeDetail(recipeId);
  if (!existing) throw new Error("NOT_FOUND");
  const latest = existing.versions[0];
  if (!latest) throw new Error("NOT_FOUND");

  const versionNo = getNextRecipeVersionNo(recipeId);
  const insertVersion = db.prepare(`
    INSERT INTO recipe_versions(
      recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
    ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertIngredient = db.prepare(`
    INSERT INTO recipe_ingredients(recipe_version_id, name, quantity, unit, note, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const versionRes = insertVersion.run(
      recipeId,
      versionNo,
      latest.servings,
      latest.instructions,
      latest.recipe_record_json || "{}",
      `基于 v${latest.version_no} 创建修订`,
      actor.email
    );
    const versionId = Number(versionRes.lastInsertRowid);
    latest.ingredients.forEach((ingredient, idx) => {
      insertIngredient.run(
        versionId,
        ingredient.name,
        ingredient.quantity,
        ingredient.unit,
        ingredient.note,
        idx + 1
      );
    });
    db.prepare("UPDATE recipes SET updated_at = datetime('now') WHERE id = ?").run(recipeId);
    return versionId;
  });

  const version = getRecipeVersion(tx());
  if (!version) throw new Error("NOT_FOUND");
  return { ...version, ingredients: getRecipeIngredients(version.id) };
}

export function createImportedRecipeDrafts(input: {
  actor_email: string;
  recipes: unknown[];
  v3_preview?: any;
}) {
  const actor = ensureRecipeRole(input.actor_email, ["OWNER", "EDITOR"]);
  if (!Array.isArray(input.recipes) || input.recipes.length < 1) throw new Error("RECIPES_REQUIRED");

  const insertRecipe = db.prepare(`
    INSERT INTO recipes(code, name, description, entity_kind, business_type, technique_family, recipe_type, menu_cycle, import_source, created_by, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, datetime('now'))
  `);
  const insertVersion = db.prepare(`
    INSERT INTO recipe_versions(
      recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
    ) VALUES (?, 1, 'DRAFT', ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertIngredient = db.prepare(`
    INSERT INTO recipe_ingredients(recipe_version_id, name, quantity, unit, note, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertComponentLink = db.prepare(`
    INSERT INTO recipe_version_components(
      parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
      component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createElementDraft = (
    normalized: RecipeRecordV2,
    options?: {
      codeSeed?: string;
      business_type?: "MENU" | "BACKBONE";
      technique_family?: string | null;
      import_note?: string;
      entity_kind?: "ELEMENT" | "COMPOSITE";
      record_json?: string;
      instructions_override?: string;
    }
  ) => {
    const recipeType = options?.business_type || (normalized.meta.recipe_type === "MENU" ? "MENU" : "BACKBONE");
    const dishName = String(normalized.meta.dish_name || "").trim();
    if (!dishName) throw new Error("DISH_NAME_REQUIRED");
    const menuCycle = recipeType === "MENU"
      ? (normalized.meta.menu_cycle ? normalizeMenuCycle(normalized.meta.menu_cycle) : null)
      : null;
    const code = ensureUniqueRecipeCode(options?.codeSeed || normalized.meta.dish_code || makeAutoRecipeCode(0));
    const nextRecord: RecipeRecordV2 = {
      ...normalized,
      meta: {
        ...normalized.meta,
        dish_code: code,
        dish_name: dishName,
        recipe_type: recipeType,
        menu_cycle: menuCycle
      },
      production: {
        ...normalized.production,
        servings: String(normalized.production.servings || "1份"),
        net_yield_rate: Number.isFinite(Number(normalized.production.net_yield_rate))
          ? Number(normalized.production.net_yield_rate) || 1
          : 1
      },
      ingredients: normalized.ingredients.filter((item) => item.name && item.quantity && item.unit),
      steps: normalized.steps.length > 0 ? normalized.steps : [{ step_no: 1, action: "待填写", time_sec: 0 }]
    };
    const validation = validateRecipeRecordV2ForDraft(nextRecord);
    if (!validation.ok) throw new Error(`INVALID_RECIPE_RECORD:${validation.errors.join(",")}`);

    const instructions = options?.instructions_override || nextRecord.steps
      .sort((a, b) => Number(a.step_no) - Number(b.step_no))
      .map((step) => `${step.step_no}. ${step.action}`)
      .join("\n");
    const recipeResult = insertRecipe.run(
      code,
      dishName,
      null,
      options?.entity_kind || "ELEMENT",
      recipeType,
      options?.technique_family || null,
      recipeType,
      menuCycle,
      actor.email
    );
    const recipeId = Number(recipeResult.lastInsertRowid);
    const versionResult = insertVersion.run(
      recipeId,
      nextRecord.production.servings || "1份",
      instructions,
      options?.record_json || JSON.stringify(nextRecord),
      options?.import_note || "智能导入创建",
      actor.email
    );
    const versionId = Number(versionResult.lastInsertRowid);
    nextRecord.ingredients.forEach((ingredient, idx) => {
      insertIngredient.run(
        versionId,
        ingredient.name,
        ingredient.quantity,
        ingredient.unit,
        ingredient.note || null,
        idx + 1
      );
    });
    db.prepare("UPDATE recipes SET active_version_id = ?, updated_at = datetime('now') WHERE id = ?").run(versionId, recipeId);
    return {
      recipe_id: recipeId,
      version_id: versionId,
      version: "v1" as const,
      status: "DRAFT" as const,
      dish_name: dishName,
      code,
      recipe_type: recipeType
    };
  };

  const run = db.transaction(() => {
    const created: Array<{ recipe_id: number; version_id: number; version: string; status: string; dish_name: string }> = [];
    const preview = input.v3_preview && typeof input.v3_preview === "object" ? input.v3_preview : null;
    const previewMode = String(preview?.mode || "");
    const previewElements = Array.isArray(preview?.elements) ? preview.elements : [];

    if (preview && previewMode === "COMPOSITE" && preview?.composite) {
      const createdByPreviewCode = new Map<string, ReturnType<typeof createElementDraft>>();
      const createdByIndex = new Map<number, ReturnType<typeof createElementDraft>>();

      for (let i = 0; i < input.recipes.length; i += 1) {
        const raw = input.recipes[i];
        const normalized = normalizeRecipeRecordV2(raw);
        const previewElement = previewElements.find((item: any) => Number(item?.index) === i) || previewElements[i] || null;
        const createdElement = createElementDraft(normalized, {
          codeSeed: previewElement?.dish_code || normalized.meta.dish_code || makeAutoRecipeCode(i),
          business_type: previewElement?.business_type === "BACKBONE" ? "BACKBONE" : "MENU",
          technique_family: previewElement?.technique_family ? String(previewElement.technique_family) : null,
          import_note: "V3-lite 复合菜子配方导入",
          entity_kind: "ELEMENT"
        });
        created.push(createdElement);
        createdByIndex.set(i, createdElement);
        if (previewElement?.dish_code) {
          createdByPreviewCode.set(String(previewElement.dish_code), createdElement);
        }
      }

      const compositeRaw = preview.composite;
      const compositeCode = ensureUniqueRecipeCode(compositeRaw.dish_code || makeAutoRecipeCode(input.recipes.length));
      const compositeRecord = {
        meta: {
          dish_code: compositeCode,
          dish_name: String(compositeRaw.dish_name || "").trim(),
          display_name: String(compositeRaw.display_name || compositeRaw.dish_name || "").trim(),
          aliases: Array.isArray(compositeRaw.aliases) ? compositeRaw.aliases.map((item: any) => String(item)).filter(Boolean) : [],
          entity_kind: "COMPOSITE",
          business_type: "MENU",
          menu_cycle: compositeRaw.menu_cycle ? normalizeMenuCycle(String(compositeRaw.menu_cycle)) : null
        },
        assembly_components: Array.isArray(compositeRaw.assembly_components) ? compositeRaw.assembly_components : [],
        assembly_steps: Array.isArray(compositeRaw.assembly_steps) ? compositeRaw.assembly_steps : []
      };
      const compositeNormalized = normalizeRecipeRecordV2({
        meta: {
          dish_code: compositeCode,
          dish_name: compositeRecord.meta.dish_name,
          recipe_type: "MENU",
          menu_cycle: compositeRecord.meta.menu_cycle,
          plating_image_url: ""
        },
        production: {
          servings: "1道",
          net_yield_rate: 1,
          key_temperature_points: []
        },
        allergens: [],
        ingredients: [{ name: "见 assembly components", quantity: "1", unit: "组", note: "V3-lite composite placeholder" }],
        steps: compositeRecord.assembly_steps.length > 0
          ? compositeRecord.assembly_steps.map((step: any, idx: number) => ({
              step_no: Number(step?.step_no || idx + 1),
              action: String(step?.action || "").trim() || "待填写",
              time_sec: 0
            }))
          : [{ step_no: 1, action: "待填写整道菜 assembly 动作", time_sec: 0 }]
      });
      const compositeCreated = createElementDraft(compositeNormalized, {
        codeSeed: compositeCode,
        business_type: "MENU",
        technique_family: "COMPOSITE",
        import_note: "V3-lite 复合菜导入",
        entity_kind: "COMPOSITE",
        record_json: JSON.stringify(compositeRecord),
        instructions_override: compositeRecord.assembly_steps
          .map((step: any, idx: number) => `${Number(step?.step_no || idx + 1)}. ${String(step?.action || "").trim()}`)
          .filter(Boolean)
          .join("\n")
      });

      const assemblyComponents = Array.isArray(compositeRaw.assembly_components) ? compositeRaw.assembly_components : [];
      assemblyComponents.forEach((component: any, idx: number) => {
        const linked = component?.child_code ? createdByPreviewCode.get(String(component.child_code)) : undefined;
        insertComponentLink.run(
          compositeCreated.version_id,
          linked ? "RECIPE_REF" : (String(component?.component_kind || "REFERENCE_PREP") as "RECIPE_REF" | "REFERENCE_PREP" | "RAW_ITEM" | "FINISH_ITEM"),
          linked?.recipe_id || null,
          linked?.version_id || null,
          String(component?.ref_name || linked?.dish_name || component?.child_code || `component-${idx + 1}`),
          component?.component_role ? String(component.component_role) : null,
          component?.section ? String(component.section) : "ASSEMBLY",
          component?.quantity ? String(component.quantity) : null,
          component?.unit ? String(component.unit) : null,
          Number(component?.sort_order || idx + 1),
          Number(component?.is_optional ? 1 : 0),
          null,
          null
        );
      });

      const unresolvedRefs = Array.isArray(preview?.unresolved_refs) ? preview.unresolved_refs : [];
      unresolvedRefs.forEach((item: any, idx: number) => {
        insertComponentLink.run(
          compositeCreated.version_id,
          "REFERENCE_PREP",
          null,
          null,
          String(item?.ref_name || `ref-${idx + 1}`),
          null,
          "PREP",
          item?.quantity ? String(item.quantity) : null,
          item?.unit ? String(item.unit) : null,
          1000 + idx,
          0,
          item?.source_ref ? String(item.source_ref) : null,
          null
        );
      });

      const finishItems = Array.isArray(preview?.finish_items) ? preview.finish_items : [];
      finishItems.forEach((item: any, idx: number) => {
        insertComponentLink.run(
          compositeCreated.version_id,
          "FINISH_ITEM",
          null,
          null,
          String(item?.ref_name || `finish-${idx + 1}`),
          "PLATING",
          "PLATING",
          item?.quantity ? String(item.quantity) : null,
          item?.unit ? String(item.unit) : null,
          2000 + idx,
          0,
          item?.source_ref ? String(item.source_ref) : null,
          null
        );
      });

      created.unshift(compositeCreated);
      return created;
    }

    for (let i = 0; i < input.recipes.length; i += 1) {
      const raw = input.recipes[i];
      const normalized = normalizeRecipeRecordV2(raw);
      const previewElement = previewElements.find((item: any) => Number(item?.index) === i) || previewElements[i] || null;
      created.push(createElementDraft(normalized, {
        codeSeed: normalized.meta.dish_code || makeAutoRecipeCode(i),
        business_type: previewElement?.business_type === "MENU" ? "MENU" : previewElement?.business_type === "BACKBONE" ? "BACKBONE" : undefined,
        technique_family: previewElement?.technique_family ? String(previewElement.technique_family) : null,
        import_note: "智能导入创建",
        entity_kind: "ELEMENT"
      }));
    }

    return created;
  });

  return run();
}

function cloneRecipeVersionToDraft(versionId: number, actorEmail: string, note: string) {
  const source = getRecipeVersion(versionId);
  if (!source) throw new Error("NOT_FOUND");
  const sourceIngredients = getRecipeIngredients(versionId);
  const nextVersionNo = getNextRecipeVersionNo(source.recipe_id);
  const insertVersion = db.prepare(`
    INSERT INTO recipe_versions(
      recipe_id, version_no, status, servings, instructions, record_json, change_note, created_by, updated_at
    ) VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertIngredient = db.prepare(`
    INSERT INTO recipe_ingredients(recipe_version_id, name, quantity, unit, note, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const versionResult = insertVersion.run(
    source.recipe_id,
    nextVersionNo,
    source.servings,
    source.instructions,
    source.recipe_record_json || "{}",
    note,
    actorEmail
  );
  const newVersionId = Number(versionResult.lastInsertRowid);
  sourceIngredients.forEach((item, idx) => {
    insertIngredient.run(newVersionId, item.name, item.quantity, item.unit, item.note, idx + 1);
  });
  db.prepare("UPDATE recipes SET updated_at = datetime('now') WHERE id = ?").run(source.recipe_id);
  return newVersionId;
}

export function previewSmartEdit(input: {
  recipe_id: number;
  version_id: number;
  instruction: string;
  actor_email: string;
}) {
  ensureRecipeRole(input.actor_email, ["OWNER", "EDITOR"]);
  const version = getRecipeVersion(input.version_id);
  if (!version || version.recipe_id !== input.recipe_id) throw new Error("NOT_FOUND");
  const recipe = getRecipeDetail(input.recipe_id);
  if (!recipe) throw new Error("NOT_FOUND");
  const instruction = String(input.instruction || "").trim();
  if (!instruction) throw new Error("INSTRUCTION_REQUIRED");

  let record: RecipeRecordV2;
  try {
    const parsed = JSON.parse(version.recipe_record_json || "{}");
    record = normalizeRecipeRecordV2(parsed);
  } catch {
    record = buildDefaultRecipeRecordV2({
      code: recipe.code,
      name: recipe.name,
      recipe_type: recipe.recipe_type,
      menu_cycle: recipe.menu_cycle,
      servings: version.servings || "1份",
      ingredients: getRecipeIngredients(version.id).map((it) => ({
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        note: it.note || ""
      })),
      instructions: version.instructions || ""
    });
  }

  const modified: RecipeRecordV2 = JSON.parse(JSON.stringify(record));
  const ingredientDiff: Array<{ action: "modify"; name: string; field: "quantity"; from: string; to: string }> = [];
  const segments = instruction.split(/[，,。；;]/g).map((item) => item.trim()).filter(Boolean);

  for (const segment of segments) {
    const modifyMatch = segment.match(/^(.+?)改成\s*([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z\u4e00-\u9fa5]+)?$/);
    if (modifyMatch) {
      const targetName = modifyMatch[1].trim();
      const amount = modifyMatch[2];
      const unit = (modifyMatch[3] || "").trim();
      const target = modified.ingredients.find((item) => item.name.includes(targetName));
      if (target) {
        const from = target.quantity;
        target.quantity = amount;
        if (unit) target.unit = unit;
        ingredientDiff.push({ action: "modify", name: target.name, field: "quantity", from, to: target.quantity });
      }
      continue;
    }
    const halfMatch = segment.match(/^(.+?)减半$/);
    if (halfMatch) {
      const targetName = halfMatch[1].trim();
      const target = modified.ingredients.find((item) => item.name.includes(targetName));
      if (target) {
        const current = Number(target.quantity);
        if (Number.isFinite(current) && current > 0) {
          const from = target.quantity;
          target.quantity = String(current / 2);
          ingredientDiff.push({ action: "modify", name: target.name, field: "quantity", from, to: target.quantity });
        }
      }
    }
  }

  return {
    diff: {
      ingredients: ingredientDiff,
      steps: [],
      meta: [],
      allergens: [],
      production: []
    },
    modified_record: modified,
    summary: ingredientDiff.length > 0 ? `将修改 ${ingredientDiff.length} 项原料用量` : "未识别到可执行修改"
  };
}

export function confirmSmartEdit(input: {
  recipe_id: number;
  version_id: number;
  modified_record: unknown;
  actor_email: string;
}) {
  const actor = ensureRecipeRole(input.actor_email, ["OWNER", "EDITOR"]);
  const source = getRecipeVersion(input.version_id);
  if (!source || source.recipe_id !== input.recipe_id) throw new Error("NOT_FOUND");
  const normalizedRecord = normalizeRecipeRecordV2(input.modified_record);
  const validation = validateRecipeRecordV2ForDraft(normalizedRecord);
  if (!validation.ok) throw new Error(`INVALID_RECIPE_RECORD:${validation.errors.join(",")}`);

  const tx = db.transaction(() => {
    const newVersionId = cloneRecipeVersionToDraft(input.version_id, actor.email, `智能微调: 基于 v${source.version_no} 创建`);
    const draftIngredients = normalizedRecord.ingredients.map((item) => ({
      name: String(item.name || "").trim(),
      quantity: String(item.quantity || "").trim(),
      unit: String(item.unit || "").trim(),
      note: String(item.note || "").trim()
    }));
    const instructions = normalizedRecord.steps
      .sort((a, b) => Number(a.step_no) - Number(b.step_no))
      .map((step) => `${step.step_no}. ${step.action}`)
      .join("\n");
    updateRecipeDraft(newVersionId, {
      servings: normalizedRecord.production.servings || source.servings || "",
      instructions,
      ingredients: draftIngredients,
      recipe_record_json: normalizedRecord,
      actor: actor.email
    });
    return newVersionId;
  });

  const newVersionId = tx();
  const created = getRecipeVersion(newVersionId);
  if (!created) throw new Error("NOT_FOUND");
  return {
    new_version_id: created.id,
    new_version: `v${created.version_no}`,
    status: created.status
  };
}

export function updateRecipeBase(
  recipeId: number,
  input: {
    code?: string;
    name?: string;
    description?: string;
    recipe_type?: "MENU" | "BACKBONE";
    menu_cycle?: string;
    actor: string;
  }
) {
  ensureRecipeRole(input.actor, ["OWNER", "EDITOR"]);
  const existing = getRecipeDetail(recipeId);
  if (!existing) throw new Error("NOT_FOUND");

  const code = normalizeRecipeCode(input.code ?? existing.code);
  const name = String(input.name ?? existing.name).trim();
  const recipeType = input.recipe_type === "MENU" ? "MENU" : (input.recipe_type === "BACKBONE" ? "BACKBONE" : existing.recipe_type);
  const menuCycleRaw = input.menu_cycle ?? existing.menu_cycle ?? "";
  const menuCycle = normalizeMenuCycle(menuCycleRaw);

  if (!code || !name) throw new Error("INVALID_RECIPE_FIELDS");
  if (recipeType === "MENU" && !menuCycle) throw new Error("MENU_CYCLE_REQUIRED");

  db.prepare(`
    UPDATE recipes
    SET code = ?,
        name = ?,
        description = ?,
        recipe_type = ?,
        menu_cycle = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    code,
    name,
    typeof input.description === "string" ? input.description.trim() : existing.description,
    recipeType,
    recipeType === "MENU" ? menuCycle : null,
    recipeId
  );

  return getRecipeDetail(recipeId);
}

export function updateRecipeDraft(versionId: number, input: {
  servings?: string;
  instructions?: string;
  change_note?: string;
  ingredients?: RecipeIngredientInput[];
  recipe_record_json?: unknown;
  actor: string;
}) {
  const actor = ensureRecipeRole(input.actor, ["OWNER", "EDITOR"]);
  const version = getRecipeVersion(versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (version.status !== "DRAFT" && version.status !== "REJECTED") {
    throw new Error("INVALID_STAGE");
  }

  const updateVersion = db.prepare(`
    UPDATE recipe_versions
    SET servings = ?, instructions = ?, record_json = ?, change_note = ?, created_by = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const deleteIngredients = db.prepare("DELETE FROM recipe_ingredients WHERE recipe_version_id = ?");
  const insertIngredient = db.prepare(`
    INSERT INTO recipe_ingredients(recipe_version_id, name, quantity, unit, note, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const deleteComponents = db.prepare("DELETE FROM recipe_version_components WHERE parent_version_id = ?");
  const insertComponent = db.prepare(`
    INSERT INTO recipe_version_components(
      parent_version_id, component_kind, child_recipe_id, child_version_id, display_name,
      component_role, section, quantity, unit, sort_order, is_optional, source_ref, prep_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const instructions = input.instructions?.trim() || version.instructions;
  if (!instructions) throw new Error("INSTRUCTIONS_REQUIRED");
  const recipeDetail = getRecipeDetail(version.recipe_id);
  if (!recipeDetail) throw new Error("NOT_FOUND");
  const isComposite = recipeDetail.entity_kind === "COMPOSITE";
  const sourceIngredients = Array.isArray(input.ingredients) && input.ingredients.length > 0
    ? input.ingredients
    : getRecipeIngredients(versionId).map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        note: item.note || ""
      }));
  const currentComponents = getRecipeVersionComponents(versionId);

  if (isComposite) {
    let compositeRecord: any;
    if (input.recipe_record_json !== undefined) {
      try {
        compositeRecord = typeof input.recipe_record_json === "string"
          ? JSON.parse(input.recipe_record_json)
          : input.recipe_record_json;
      } catch {
        throw new Error("INVALID_RECIPE_RECORD_JSON");
      }
    } else if (version.recipe_record_json) {
      try {
        compositeRecord = JSON.parse(version.recipe_record_json);
      } catch {
        throw new Error("INVALID_RECIPE_RECORD_JSON");
      }
    }
    if (!isCompositeRecipeRecord(compositeRecord)) {
      throw new Error("INVALID_RECIPE_RECORD:composite.root.invalid");
    }
    compositeRecord.meta.dish_code = recipeDetail.code;
    compositeRecord.meta.dish_name = recipeDetail.name;
    compositeRecord.meta.business_type = recipeDetail.business_type;
    compositeRecord.meta.menu_cycle = recipeDetail.recipe_type === "MENU" ? recipeDetail.menu_cycle : null;
    if (!Array.isArray(compositeRecord.assembly_steps) || compositeRecord.assembly_steps.length < 1) {
      compositeRecord.assembly_steps = [{ step_id: "assembly_001", step_no: 1, action: "待填写整道菜 assembly 动作" }];
    }
    const compositeValidation = validateCompositeRecordV3Lite(compositeRecord);
    if (!compositeValidation.ok) {
      throw new Error(`INVALID_RECIPE_RECORD:${compositeValidation.errors.join(",")}`);
    }
    const nextInstructions = compositeRecord.assembly_steps
      .map((step: any, idx: number) => `${Number(step?.step_no || idx + 1)}. ${String(step?.action || "").trim()}`)
      .filter(Boolean)
      .join("\n");
    const servingsValue = input.servings?.trim() ?? version.servings ?? "1道";

    const tx = db.transaction(() => {
      updateVersion.run(
        servingsValue,
        nextInstructions || "1. 待填写整道菜 assembly 动作",
        JSON.stringify(compositeRecord),
        input.change_note?.trim() ?? version.change_note,
        actor.email,
        versionId
      );
      deleteComponents.run(versionId);
      const assemblyComponents = Array.isArray(compositeRecord.assembly_components) ? compositeRecord.assembly_components : [];
      assemblyComponents.forEach((component: any, idx: number) => {
        const componentKind = String(component?.component_kind || "REFERENCE_PREP");
        let childRecipeId: number | null = null;
        let childVersionId: number | null = null;
        if (componentKind === "RECIPE_REF" && component?.child_code) {
          const linkedRecipe = findRecipeByCode(String(component.child_code));
          childRecipeId = linkedRecipe?.id || null;
          childVersionId = linkedRecipe?.active_version_id || null;
        } else {
          const matchedExisting = currentComponents.find((item) =>
            item.component_kind === componentKind &&
            item.display_name === String(component?.ref_name || "")
          );
          childRecipeId = matchedExisting?.child_recipe_id || null;
          childVersionId = matchedExisting?.child_version_id || null;
        }
        insertComponent.run(
          versionId,
          componentKind,
          childRecipeId,
          childVersionId,
          String(component?.ref_name || component?.child_code || `component-${idx + 1}`),
          component?.component_role ? String(component.component_role) : null,
          component?.section ? String(component.section) : "ASSEMBLY",
          component?.quantity ? String(component.quantity) : null,
          component?.unit ? String(component.unit) : null,
          Number(component?.sort_order || idx + 1),
          Number(component?.is_optional ? 1 : 0),
          null,
          null
        );
      });
      db.prepare("UPDATE recipes SET updated_at = datetime('now') WHERE id = ?").run(version.recipe_id);
    });
    tx();
    const updated = getRecipeVersion(versionId);
    if (!updated) throw new Error("NOT_FOUND");
    return { ...updated, ingredients: getRecipeIngredients(versionId), components: getRecipeVersionComponents(versionId) };
  }

  let recordObject: RecipeRecordV2;
  if (input.recipe_record_json !== undefined) {
    let parsedRaw: unknown;
    try {
      parsedRaw = typeof input.recipe_record_json === "string"
        ? JSON.parse(input.recipe_record_json)
        : input.recipe_record_json;
    } catch {
      throw new Error("INVALID_RECIPE_RECORD_JSON");
    }
    const parsedValidation = validateRecipeRecordV2ForDraft(parsedRaw);
    if (!parsedValidation.ok) {
      throw new Error(`INVALID_RECIPE_RECORD:${parsedValidation.errors.join(",")}`);
    }
    recordObject = normalizeRecipeRecordV2(parsedRaw);
  } else if (version.recipe_record_json) {
    let rawRecord: unknown;
    try {
      rawRecord = JSON.parse(version.recipe_record_json);
    } catch {
      throw new Error("INVALID_RECIPE_RECORD_JSON");
    }
    const rawValidation = validateRecipeRecordV2ForDraft(rawRecord);
    if (rawValidation.ok) {
      recordObject = normalizeRecipeRecordV2(rawRecord);
    } else {
      recordObject = buildDefaultRecipeRecordV2({
        code: recipeDetail.code,
        name: recipeDetail.name,
        recipe_type: recipeDetail.recipe_type,
        menu_cycle: recipeDetail.menu_cycle,
        servings: input.servings?.trim() ?? version.servings,
        ingredients: sourceIngredients,
        instructions
      });
    }
    recordObject.ingredients = sourceIngredients.map((it) => ({
      name: String(it.name || "").trim(),
      quantity: String(it.quantity || "").trim(),
      unit: String(it.unit || "").trim(),
      note: String(it.note || "").trim()
    }));
    const mergedServings = input.servings?.trim() ?? version.servings ?? recordObject.production.servings ?? "";
    recordObject.production.servings = String(mergedServings);
  } else {
    recordObject = buildDefaultRecipeRecordV2({
      code: recipeDetail.code,
      name: recipeDetail.name,
      recipe_type: recipeDetail.recipe_type,
      menu_cycle: recipeDetail.menu_cycle,
      servings: input.servings?.trim() ?? version.servings,
      ingredients: sourceIngredients,
      instructions
    });
  }
  recordObject.meta.dish_code = recipeDetail.code;
  recordObject.meta.dish_name = recipeDetail.name;
  recordObject.meta.recipe_type = recipeDetail.recipe_type;
  recordObject.meta.menu_cycle = recipeDetail.recipe_type === "MENU" ? recipeDetail.menu_cycle : null;

  const validation = validateRecipeRecordV2ForDraft(recordObject);
  if (!validation.ok) {
    throw new Error(`INVALID_RECIPE_RECORD:${validation.errors.join(",")}`);
  }

  const tx = db.transaction(() => {
    updateVersion.run(
      input.servings?.trim() ?? version.servings,
      instructions,
      JSON.stringify(recordObject),
      input.change_note?.trim() ?? version.change_note,
      actor.email,
      versionId
    );

    if (Array.isArray(input.ingredients) && input.ingredients.length > 0) {
      deleteIngredients.run(versionId);
      input.ingredients.forEach((ingredient, idx) => {
        const ingName = String(ingredient.name || "").trim();
        const quantity = String(ingredient.quantity || "").trim();
        const unit = String(ingredient.unit || "").trim();
        if (!ingName || !quantity || !unit) {
          throw new Error("INVALID_INGREDIENT_FIELDS");
        }
        insertIngredient.run(versionId, ingName, quantity, unit, ingredient.note?.trim() || null, idx + 1);
      });
    }
    db.prepare("UPDATE recipes SET updated_at = datetime('now') WHERE id = ?").run(version.recipe_id);
  });

  tx();
  const updated = getRecipeVersion(versionId);
  if (!updated) throw new Error("NOT_FOUND");
  return { ...updated, ingredients: getRecipeIngredients(versionId) };
}

export function submitRecipeForReview(versionId: number, actorEmail: string, changeNote?: string) {
  const actor = ensureRecipeRole(actorEmail, ["OWNER", "EDITOR"]);
  const version = getRecipeVersion(versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (version.status !== "DRAFT" && version.status !== "REJECTED") throw new Error("INVALID_STAGE");
  const recipe = db
    .prepare("SELECT recipe_type, menu_cycle FROM recipes WHERE id = ? LIMIT 1")
    .get(version.recipe_id) as { recipe_type: "MENU" | "BACKBONE"; menu_cycle: string | null } | undefined;
  if (!recipe) throw new Error("NOT_FOUND");
  if (recipe.recipe_type === "MENU" && !normalizeMenuCycle(recipe.menu_cycle || "")) {
    throw new Error("MENU_CYCLE_REQUIRED");
  }

  const ingredients = getRecipeIngredients(versionId);
  if (ingredients.length < 1) throw new Error("INGREDIENTS_REQUIRED");
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(version.recipe_record_json || "{}");
  } catch {
    throw new Error("INVALID_RECIPE_RECORD_JSON");
  }
  if (isCompositeRecipeRecord(parsedRaw)) {
    const compositeValidation = validateCompositeRecordV3Lite(parsedRaw);
    if (!compositeValidation.ok) throw new Error(`INVALID_RECIPE_RECORD:${compositeValidation.errors.join(",")}`);
  } else {
    const validation = validateRecipeRecordV2(parsedRaw);
    if (!validation.ok) throw new Error(`INVALID_RECIPE_RECORD:${validation.errors.join(",")}`);
  }

  db.prepare(`
    UPDATE recipe_versions
    SET status = 'PENDING_REVIEW',
        submitted_at = datetime('now'),
        change_note = COALESCE(?, change_note),
        updated_at = datetime('now'),
        created_by = ?
    WHERE id = ?
  `).run(changeNote?.trim() || null, actor.email, versionId);
  db.prepare("UPDATE recipes SET updated_at = datetime('now') WHERE id = ?").run(version.recipe_id);

  const updated = getRecipeVersion(versionId);
  if (!updated) throw new Error("NOT_FOUND");
  return { ...updated, ingredients };
}

export function reviewRecipeVersion(
  versionId: number,
  reviewerEmail: string,
  decision: "approve" | "reject",
  reviewNote?: string
) {
  const reviewer = ensureRecipeRole(reviewerEmail, ["OWNER", "REVIEWER"]);
  const version = getRecipeVersion(versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (version.status !== "PENDING_REVIEW") throw new Error("INVALID_STAGE");

  const nextStatus = decision === "approve" ? "APPROVED" : "REJECTED";
  db.prepare(`
    UPDATE recipe_versions
    SET status = ?,
        approved_at = CASE WHEN ? = 'APPROVED' THEN datetime('now') ELSE NULL END,
        reviewed_by = ?,
        review_note = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, nextStatus, reviewer.email, reviewNote?.trim() || null, versionId);
  db.prepare("UPDATE recipes SET updated_at = datetime('now') WHERE id = ?").run(version.recipe_id);

  const updated = getRecipeVersion(versionId);
  if (!updated) throw new Error("NOT_FOUND");
  return { ...updated, ingredients: getRecipeIngredients(versionId) };
}

export function publishRecipeVersion(versionId: number, publisherEmail: string) {
  ensureRecipeRole(publisherEmail, ["OWNER", "REVIEWER"]);
  const version = getRecipeVersion(versionId);
  if (!version) throw new Error("NOT_FOUND");
  if (version.status !== "APPROVED") throw new Error("INVALID_STAGE");

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE recipe_versions
      SET status = 'PUBLISHED', published_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(versionId);
    db.prepare(`
      UPDATE recipes
      SET active_version_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(versionId, version.recipe_id);
  });
  tx();

  const updated = getRecipeVersion(versionId);
  if (!updated) throw new Error("NOT_FOUND");
  return { ...updated, ingredients: getRecipeIngredients(versionId) };
}

export function listPendingRecipeVersions() {
  return db
    .prepare(`
      SELECT
        rv.id,
        rv.recipe_id,
        r.code,
        r.name,
        r.entity_kind,
        r.business_type,
        r.technique_family,
        r.recipe_type,
        r.menu_cycle,
        rv.version_no,
        rv.status,
        rv.created_by,
        rv.change_note,
        rv.submitted_at,
        rv.created_at
      FROM recipe_versions rv
      JOIN recipes r ON r.id = rv.recipe_id
      WHERE rv.status = 'PENDING_REVIEW'
      ORDER BY rv.submitted_at ASC, rv.id ASC
    `)
    .all() as Array<{
      id: number;
      recipe_id: number;
      code: string;
      name: string;
      entity_kind: "COMPOSITE" | "ELEMENT";
      business_type: "MENU" | "BACKBONE";
      technique_family: string | null;
      recipe_type: "MENU" | "BACKBONE";
      menu_cycle: string | null;
      version_no: number;
      status: string;
      created_by: string;
      change_note: string | null;
      submitted_at: string | null;
      created_at: string;
    }>;
}

export function listApprovedRecipeVersions() {
  return db
    .prepare(`
      SELECT
        rv.id,
        rv.recipe_id,
        r.code,
        r.name,
        r.entity_kind,
        r.business_type,
        r.technique_family,
        r.recipe_type,
        r.menu_cycle,
        rv.version_no,
        rv.status,
        rv.created_by,
        rv.change_note,
        rv.submitted_at,
        rv.approved_at,
        rv.created_at
      FROM recipe_versions rv
      JOIN recipes r ON r.id = rv.recipe_id
      WHERE rv.status = 'APPROVED'
      ORDER BY rv.approved_at ASC, rv.id ASC
    `)
    .all() as Array<{
      id: number;
      recipe_id: number;
      code: string;
      name: string;
      entity_kind: "COMPOSITE" | "ELEMENT";
      business_type: "MENU" | "BACKBONE";
      technique_family: string | null;
      recipe_type: "MENU" | "BACKBONE";
      menu_cycle: string | null;
      version_no: number;
      status: string;
      created_by: string;
      change_note: string | null;
      submitted_at: string | null;
      approved_at: string | null;
      created_at: string;
    }>;
}

export function logRecipeSync(input: {
  recipe_id: number;
  recipe_version_id: number;
  event: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  endpoint?: string;
  error_message?: string;
}) {
  db.prepare(`
    INSERT INTO recipe_sync_logs(
      recipe_id, recipe_version_id, event, status, endpoint, error_message
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.recipe_id,
    input.recipe_version_id,
    input.event,
    input.status,
    input.endpoint || null,
    input.error_message || null
  );
}

const FOH_DIETARY_RULES: Array<{ key: string; tokens: string[] }> = [
  { key: "花生", tokens: ["花生", "花生碎", "花生酱"] },
  { key: "坚果", tokens: ["杏仁", "榛子", "腰果", "核桃", "松子", "开心果", "夏威夷果", "花生"] },
  { key: "乳制品", tokens: ["牛奶", "奶油", "黄油", "芝士", "奶酪", "酸奶", "炼乳"] },
  { key: "鸡蛋", tokens: ["鸡蛋", "蛋黄", "蛋白", "全蛋液"] },
  { key: "贝类", tokens: ["虾", "蟹", "蛤", "牡蛎", "扇贝", "龙虾", "贝"] },
  { key: "鱼类", tokens: ["鱼", "三文鱼", "鳕鱼", "金枪鱼", "鲈鱼"] },
  { key: "大豆", tokens: ["豆腐", "豆浆", "豆豉", "酱油", "黄豆", "豆瓣"] },
  { key: "麸质", tokens: ["面粉", "小麦", "面包糠", "意面", "面包", "麦芽", "饺子皮"] },
  { key: "香菜", tokens: ["香菜"] },
  { key: "葱", tokens: ["大葱", "小葱", "葱"] },
  { key: "蒜", tokens: ["蒜", "蒜蓉", "大蒜"] },
  { key: "酒精", tokens: ["料酒", "黄酒", "白酒", "红酒", "朗姆", "威士忌", "伏特加"] },
  { key: "猪肉", tokens: ["猪肉", "五花肉", "培根", "猪油"] },
  { key: "牛肉", tokens: ["牛肉", "牛腩", "牛油"] },
  { key: "羊肉", tokens: ["羊肉"] }
];

function splitRestrictions(input: string[] | string) {
  const source = Array.isArray(input) ? input.join(",") : input;
  const parts = String(source || "")
    .split(/[,\n，、;；]/g)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function toMatchTokens(restriction: string) {
  const normalized = restriction.trim().toLowerCase();
  const direct = restriction.trim();
  const tokenSet = new Set<string>();
  if (direct) tokenSet.add(direct);
  for (const rule of FOH_DIETARY_RULES) {
    const key = rule.key.toLowerCase();
    if (normalized.includes(key) || key.includes(normalized)) {
      for (const token of rule.tokens) tokenSet.add(token);
    }
  }
  return Array.from(tokenSet).filter(Boolean);
}

function buildFohCatalog(filter?: { recipe_type?: "MENU" | "BACKBONE"; menu_cycle?: string }) {
  const rows = db
    .prepare(`
      SELECT
        r.id AS recipe_id,
        r.code,
        r.name,
        r.recipe_type,
        r.menu_cycle,
        rv.id AS version_id,
        rv.version_no,
        rv.status,
        rv.instructions
      FROM recipes r
      LEFT JOIN recipe_versions rv ON rv.id = r.active_version_id
      WHERE (? IS NULL OR r.recipe_type = ?)
        AND (? IS NULL OR r.menu_cycle = ?)
      ORDER BY r.recipe_type ASC, r.name ASC
    `)
    .all(
      filter?.recipe_type || null,
      filter?.recipe_type || null,
      filter?.menu_cycle || null,
      filter?.menu_cycle || null
    ) as Array<{
      recipe_id: number;
      code: string;
      name: string;
      recipe_type: "MENU" | "BACKBONE";
      menu_cycle: string | null;
      version_id: number | null;
      version_no: number | null;
      status: string | null;
      instructions: string | null;
    }>;

  const ingredientStmt = db.prepare(`
    SELECT name, note
    FROM recipe_ingredients
    WHERE recipe_version_id = ?
    ORDER BY sort_order ASC, id ASC
  `);

  return rows.map((row) => {
    const ingredients = row.version_id
      ? (ingredientStmt.all(row.version_id) as Array<{ name: string; note: string | null }>)
      : [];
    const ingredientTexts = ingredients.map((it) => `${it.name}${it.note ? ` ${it.note}` : ""}`);
    const haystack = `${ingredientTexts.join(" ")} ${row.instructions || ""}`.toLowerCase();
    return {
      ...row,
      ingredients,
      haystack
    };
  });
}

function buildFohCatalogByRecipeIds(recipeIds: number[]) {
  if (recipeIds.length < 1) return [];
  const placeholders = recipeIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`
      SELECT
        r.id AS recipe_id,
        r.code,
        r.name,
        r.recipe_type,
        r.menu_cycle,
        rv.id AS version_id,
        rv.version_no,
        rv.status,
        rv.instructions
      FROM recipes r
      LEFT JOIN recipe_versions rv ON rv.id = r.active_version_id
      WHERE r.id IN (${placeholders})
      ORDER BY r.name ASC
    `)
    .all(...recipeIds) as Array<{
      recipe_id: number;
      code: string;
      name: string;
      recipe_type: "MENU" | "BACKBONE";
      menu_cycle: string | null;
      version_id: number | null;
      version_no: number | null;
      status: string | null;
      instructions: string | null;
    }>;
  const byId = new Map(rows.map((row) => [row.recipe_id, row]));
  const orderedRows = recipeIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
  const ingredientStmt = db.prepare(`
    SELECT name, note
    FROM recipe_ingredients
    WHERE recipe_version_id = ?
    ORDER BY sort_order ASC, id ASC
  `);

  return orderedRows.map((row) => {
    const ingredients = row.version_id
      ? (ingredientStmt.all(row.version_id) as Array<{ name: string; note: string | null }>)
      : [];
    const ingredientTexts = ingredients.map((it) => `${it.name}${it.note ? ` ${it.note}` : ""}`);
    const haystack = `${ingredientTexts.join(" ")} ${row.instructions || ""}`.toLowerCase();
    return {
      ...row,
      ingredients,
      haystack
    };
  });
}

function ensureFohRole(email: string, allowedRoles: RecipeUserRole[]) {
  return ensureActorRole(email, allowedRoles);
}

function getOrCreateDailyMenu(date: string, actorEmail: string) {
  const existing = db
    .prepare("SELECT id, date, source FROM daily_menus WHERE date = ? LIMIT 1")
    .get(date) as { id: number; date: string; source: string } | undefined;
  if (existing) return existing;
  const created = db
    .prepare("INSERT INTO daily_menus(date, source, created_by, created_at) VALUES (?, 'manual', ?, datetime('now'))")
    .run(date, actorEmail);
  return {
    id: Number(created.lastInsertRowid),
    date,
    source: "manual"
  };
}

function listDailyMenuRecipeIds(date: string) {
  const menu = db.prepare("SELECT id FROM daily_menus WHERE date = ? LIMIT 1").get(date) as { id: number } | undefined;
  if (!menu) return [];
  const rows = db
    .prepare("SELECT recipe_id FROM daily_menu_items WHERE menu_id = ? ORDER BY sort_order ASC, id ASC")
    .all(menu.id) as Array<{ recipe_id: number }>;
  return rows.map((item) => item.recipe_id);
}

export function getFohCheckCatalog(input: { date: string; recipe_ids?: number[] }) {
  const ids = Array.isArray(input.recipe_ids) && input.recipe_ids.length > 0
    ? input.recipe_ids
    : listDailyMenuRecipeIds(input.date);
  const catalog = ids.length > 0 ? buildFohCatalogByRecipeIds(ids) : buildFohCatalog({ recipe_type: "MENU" });
  return catalog.map((item) => ({
    recipe_id: item.recipe_id,
    dish_name: item.name,
    ingredients: item.ingredients.map((ing) => ing.name)
  }));
}

export function getFohMenuByDate(date: string) {
  const menu = db
    .prepare("SELECT id, date, source FROM daily_menus WHERE date = ? LIMIT 1")
    .get(date) as { id: number; date: string; source: string } | undefined;

  const availableRecipes = db
    .prepare(`
      SELECT r.id, r.name AS dish_name, r.recipe_type AS type
      FROM recipes r
      LEFT JOIN recipe_versions rv ON rv.id = r.active_version_id
      WHERE r.recipe_type = 'MENU'
      ORDER BY r.name ASC
    `)
    .all() as Array<{ id: number; dish_name: string; type: "MENU" | "BACKBONE" }>;

  if (!menu) {
    return {
      menu: null,
      available_recipes: availableRecipes
    };
  }

  const items = db
    .prepare(`
      SELECT
        dmi.id AS item_id,
        dmi.recipe_id,
        dmi.sort_order,
        r.name AS dish_name,
        rv.id AS version_id
      FROM daily_menu_items dmi
      JOIN recipes r ON r.id = dmi.recipe_id
      LEFT JOIN recipe_versions rv ON rv.id = r.active_version_id
      WHERE dmi.menu_id = ?
      ORDER BY dmi.sort_order ASC, dmi.id ASC
    `)
    .all(menu.id) as Array<{
      item_id: number;
      recipe_id: number;
      sort_order: number;
      dish_name: string;
      version_id: number | null;
    }>;

  const ingredientStmt = db.prepare(`
    SELECT name, quantity, unit, note
    FROM recipe_ingredients
    WHERE recipe_version_id = ?
    ORDER BY sort_order ASC, id ASC
  `);
  const menuDetail: FohMenuDetail = {
    id: menu.id,
    date: menu.date,
    source: menu.source,
    items: items.map((item) => ({
      item_id: item.item_id,
      recipe_id: item.recipe_id,
      dish_name: item.dish_name,
      sort_order: item.sort_order,
      ingredients: item.version_id
        ? (ingredientStmt.all(item.version_id) as Array<{ name: string; quantity: string; unit: string; note?: string }>)
        : []
    }))
  };

  return {
    menu: menuDetail,
    available_recipes: availableRecipes
  };
}

export function addFohMenuItem(input: {
  date: string;
  recipe_id: number;
  actor_email: string;
}) {
  ensureFohRole(input.actor_email, ["OWNER", "EDITOR", "FOH"]);
  const date = String(input.date || "").trim();
  if (!date) throw new Error("DATE_REQUIRED");
  if (!Number.isInteger(input.recipe_id) || input.recipe_id <= 0) throw new Error("INVALID_RECIPE_ID");
  const recipe = db.prepare("SELECT id FROM recipes WHERE id = ? LIMIT 1").get(input.recipe_id) as { id: number } | undefined;
  if (!recipe) throw new Error("INVALID_RECIPE_ID");

  const menu = getOrCreateDailyMenu(date, input.actor_email);
  const nextSort = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort FROM daily_menu_items WHERE menu_id = ?")
    .get(menu.id) as { next_sort: number };
  db.prepare(`
    INSERT INTO daily_menu_items(menu_id, recipe_id, sort_order, added_by, added_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(menu_id, recipe_id) DO NOTHING
  `).run(menu.id, input.recipe_id, nextSort.next_sort, input.actor_email);
  db.prepare("UPDATE daily_menus SET updated_by = ?, updated_at = datetime('now') WHERE id = ?").run(input.actor_email, menu.id);
  return getFohMenuByDate(date);
}

export function removeFohMenuItem(input: { item_id: number; actor_email: string }) {
  ensureFohRole(input.actor_email, ["OWNER", "EDITOR", "FOH"]);
  const row = db
    .prepare(`
      SELECT dmi.id AS item_id, dm.date
      FROM daily_menu_items dmi
      JOIN daily_menus dm ON dm.id = dmi.menu_id
      WHERE dmi.id = ?
      LIMIT 1
    `)
    .get(input.item_id) as { item_id: number; date: string } | undefined;
  if (!row) throw new Error("NOT_FOUND");
  db.prepare("DELETE FROM daily_menu_items WHERE id = ?").run(input.item_id);
  return getFohMenuByDate(row.date);
}

export function runFohDietaryCheck(input: {
  service_date: string;
  guest_name?: string;
  table_no?: string;
  restrictions: string[] | string;
  recipe_type?: "MENU" | "BACKBONE";
  menu_cycle?: string;
  menu_recipe_ids?: number[];
  created_by?: string;
}): FohCheckResult {
  const serviceDate = String(input.service_date || "").trim();
  if (!serviceDate) {
    throw new Error("SERVICE_DATE_REQUIRED");
  }
  const restrictions = splitRestrictions(input.restrictions);
  if (restrictions.length < 1) {
    throw new Error("RESTRICTIONS_REQUIRED");
  }

  const menuIds = Array.isArray(input.menu_recipe_ids) && input.menu_recipe_ids.length > 0
    ? input.menu_recipe_ids
    : listDailyMenuRecipeIds(serviceDate);
  const catalog = menuIds.length > 0
    ? buildFohCatalogByRecipeIds(menuIds)
    : buildFohCatalog({
        recipe_type: input.recipe_type,
        menu_cycle: input.menu_cycle?.trim() || undefined
      });

  const results: FohCheckResultItem[] = catalog.map((item) => {
    const reasons: FohCheckResultItem["reasons"] = [];

    for (const restriction of restrictions) {
      const tokens = toMatchTokens(restriction);
      for (const token of tokens) {
        if (!token) continue;
        if (!item.haystack.includes(token.toLowerCase())) continue;
        const ingredientEvidence = item.ingredients.find(
          (it) => `${it.name} ${it.note || ""}`.toLowerCase().includes(token.toLowerCase())
        );
        reasons.push({
          restriction,
          matched_token: token,
          evidence: ingredientEvidence ? ingredientEvidence.name : `步骤/备注命中: ${token}`
        });
        break;
      }
    }

    return {
      recipe_id: item.recipe_id,
      code: item.code,
      name: item.name,
      recipe_type: item.recipe_type,
      menu_cycle: item.menu_cycle,
      version_id: item.version_id,
      version_no: item.version_no,
      status: item.status,
      blocked: reasons.length > 0,
      reasons
    };
  });

  const output: FohCheckResult = {
    guest_name: String(input.guest_name || "").trim(),
    table_no: String(input.table_no || "").trim() || null,
    restrictions,
    blocked_items: results.filter((item) => item.blocked),
    safe_items: results.filter((item) => !item.blocked),
    checked_at: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO foh_guest_checks(
      service_date, guest_name, table_no, restrictions_json, result_json, created_by
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    serviceDate,
    output.guest_name || null,
    output.table_no,
    JSON.stringify(output.restrictions),
    JSON.stringify(output),
    input.created_by?.trim() || null
  );

  return output;
}

export function getFohChecksByDate(serviceDate: string) {
  const rows = db
    .prepare(`
      SELECT id, service_date, guest_name, table_no, restrictions_json, result_json, created_by, created_at
      FROM foh_guest_checks
      WHERE service_date = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `)
    .all(serviceDate) as Array<{
      id: number;
      service_date: string;
      guest_name: string | null;
      table_no: string | null;
      restrictions_json: string;
      result_json: string;
      created_by: string | null;
      created_at: string;
    }>;

  return rows.map((row) => {
    let restrictions: string[] = [];
    let result: unknown = {};
    try {
      restrictions = JSON.parse(row.restrictions_json);
    } catch {
      restrictions = [];
    }
    try {
      result = JSON.parse(row.result_json);
    } catch {
      result = {};
    }
    return {
      id: row.id,
      service_date: row.service_date,
      guest_name: row.guest_name,
      table_no: row.table_no,
      restrictions,
      result,
      created_by: row.created_by,
      created_at: row.created_at
    };
  });
}

export function saveFohCheckRecord(input: {
  service_date: string;
  guest_name?: string;
  table_no?: string;
  restrictions: string[];
  result: unknown;
  created_by?: string;
}) {
  db.prepare(`
    INSERT INTO foh_guest_checks(
      service_date, guest_name, table_no, restrictions_json, result_json, created_by
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.service_date,
    input.guest_name?.trim() || null,
    input.table_no?.trim() || null,
    JSON.stringify(input.restrictions || []),
    JSON.stringify(input.result || {}),
    input.created_by?.trim() || null
  );
}
