export interface Location {
  id: string
  code: string
  name: string
  is_active: boolean
  created_at: string
}

export interface StockBalance {
  id: string
  product: string
  product_sku: string
  product_name: string
  product_is_active?: boolean
  category_name: string | null
  unit_of_measure: string
  location: string
  location_code: string
  location_name: string
  current_quantity: string
  reorder_threshold: string
  is_low_stock: boolean
  updated_at: string
}

export interface StockMovement {
  id: string
  movement_reference: string
  product: string
  product_sku: string
  product_name: string
  location: string
  location_code: string
  location_name: string
  movement_type: string
  movement_type_display: string
  quantity: string
  unit_cost: string
  reason: string
  actor: string
  actor_name: string
  effective_at: string
  created_at: string
}

export interface StockAdjustmentPayload {
  product: string
  location: string
  counted_quantity: string
  reason: string
}
