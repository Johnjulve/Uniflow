export interface RecentMovement {
  id: string
  movement_reference: string
  movement_type: string
  movement_type_display: string
  quantity: string
  product_name: string
  product_sku: string
  location_name: string
  location_code: string
  actor_username: string
  created_at: string
}

export interface RecentPurchaseOrder {
  id: string
  order_reference: string
  supplier_name: string
  status: string
  status_display: string
  total_amount: string
  order_date: string
  created_at: string
}

export interface LocationValuationBreakdown {
  location_id: string
  location_code: string
  location_name: string
  quantity: string
  valuation: string
  share_percentage: string
}

export interface CategoryValuationBreakdown {
  category_id: string | null
  category_name: string
  quantity: string
  valuation: string
  share_percentage: string
}

export interface DashboardSummary {
  total_active_products: number
  total_inventory_quantity: string
  total_inventory_valuation: string
  potential_revenue: string
  projected_margin: string
  margin_percentage: string
  incoming_cost: string
  incoming_quantity: string
  valuation_by_location: LocationValuationBreakdown[]
  valuation_by_category: CategoryValuationBreakdown[]
  low_stock_count: number
  out_of_stock_count: number
  recent_movements: RecentMovement[]
  recent_purchase_orders: RecentPurchaseOrder[]
  server_timestamp: string
}
