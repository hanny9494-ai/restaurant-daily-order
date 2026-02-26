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
