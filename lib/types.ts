export type Station = {
  id: number;
  name: string;
  is_active: number;
};

export type Supplier = {
  id: number;
  name: string;
  is_active: number;
};

export type UnitOption = {
  id: number;
  name: string;
  is_active: number;
};

export type DailyListItem = {
  id: number;
  daily_list_id: number;
  date: string;
  supplier_id: number;
  supplier_name: string;
  item_name: string;
  unit: string;
  total_quantity: string;
  source_count: number;
  quality_ok: number | null;
  unit_price: number | null;
  input_unit_price: number | null;
  price_unit: string | null;
  scan_file_id: number | null;
  receive_note: string | null;
  received_at: string | null;
};

export type DailyListMeta = {
  date: string;
  is_locked: boolean;
  receiving_locked_at: string | null;
};

export type OrderItem = {
  id: number;
  date: string;
  station_id: number;
  station_name: string;
  supplier_id: number;
  supplier_name: string;
  item_name: string;
  quantity: string;
  unit: string;
  note: string | null;
  status: string;
  created_at: string;
};

export type CreateOrderPayload = {
  date?: string;
  station_id: number;
  supplier_id: number;
  item_name: string;
  quantity: string;
  unit: string;
  note?: string;
};

export type RecipeUserRole = "OWNER" | "EDITOR" | "REVIEWER" | "VIEWER" | "FOH" | "RECEIVER";

export type RecipeUser = {
  id: number;
  name: string;
  email: string;
  role: RecipeUserRole;
  is_active: number;
};

export type RecipeSummary = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  entity_kind: "COMPOSITE" | "ELEMENT";
  business_type: "MENU" | "BACKBONE";
  technique_family: string | null;
  recipe_type: "MENU" | "BACKBONE";
  menu_cycle: string | null;
  active_version_id: number | null;
  active_version_no: number | null;
  active_status: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeIngredientInput = {
  name: string;
  quantity: string;
  unit: string;
  note?: string;
};

export type RecipeIngredient = {
  id: number;
  recipe_version_id: number;
  name: string;
  quantity: string;
  unit: string;
  note: string | null;
  sort_order: number;
};

export type RecipeVersionStatus = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "PUBLISHED";

export type RecipeVersionComponent = {
  id: number;
  parent_version_id: number;
  component_kind: "RECIPE_REF" | "REFERENCE_PREP" | "RAW_ITEM" | "FINISH_ITEM";
  child_recipe_id: number | null;
  child_version_id: number | null;
  display_name: string;
  component_role: string | null;
  section: string;
  quantity: string | null;
  unit: string | null;
  sort_order: number;
  is_optional: number;
  source_ref: string | null;
  prep_note: string | null;
};

export type RecipeVersion = {
  id: number;
  recipe_id: number;
  version_no: number;
  status: RecipeVersionStatus;
  servings: string | null;
  instructions: string;
  change_note: string | null;
  recipe_record_json: string | null;
  created_by: string;
  submitted_at: string | null;
  approved_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  ingredients: RecipeIngredient[];
  components?: RecipeVersionComponent[];
};

export type RecipeDetail = RecipeSummary & {
  versions: RecipeVersion[];
};

export type FohCheckResultItem = {
  recipe_id: number;
  code: string;
  name: string;
  recipe_type: "MENU" | "BACKBONE";
  menu_cycle: string | null;
  version_id: number | null;
  version_no: number | null;
  status: string | null;
  blocked: boolean;
  reasons: Array<{
    restriction: string;
    matched_token: string;
    evidence: string;
  }>;
};

export type FohCheckResult = {
  guest_name: string;
  table_no: string | null;
  restrictions: string[];
  blocked_items: FohCheckResultItem[];
  safe_items: FohCheckResultItem[];
  checked_at: string;
};

export type FohMenuItem = {
  item_id: number;
  recipe_id: number;
  dish_name: string;
  ingredients: Array<{
    name: string;
    quantity: string;
    unit: string;
    note?: string;
  }>;
  sort_order: number;
};

export type FohMenuDetail = {
  id: number;
  date: string;
  source: string;
  items: FohMenuItem[];
};

export type ReceivingScanFile = {
  id: number;
  service_date: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  storage_path: string;
  file_url: string;
  created_by: string | null;
  created_at: string;
};
