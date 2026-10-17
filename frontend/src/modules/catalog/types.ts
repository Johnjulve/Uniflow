export interface Category {
  id: string
  name: string
  slug: string
  parent: string | null
  parent_name: string | null
  description: string
  is_active: boolean
  products_count: number
  created_at: string
}

export interface Product {
  id: string
  sku: string
  barcode: string | null
  name: string
  description: string
  category: string
  category_name: string
  unit_of_measure: string
  purchase_cost: string
  selling_price: string
  reorder_threshold: string
  total_on_hand?: string
  is_active: boolean
  is_archived: boolean
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
