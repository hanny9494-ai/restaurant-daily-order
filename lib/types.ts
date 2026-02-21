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
