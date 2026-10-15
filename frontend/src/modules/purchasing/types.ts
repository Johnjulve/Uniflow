export interface Supplier {
  id: string
  name: string
  contact_name: string
  email: string
  phone: string
  address: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SupplierCreatePayload {
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  is_active?: boolean
}

export interface PurchaseOrderItem {
  id: string
  product: string
  product_sku: string
  product_name: string
  unit_of_measure: string
  ordered_quantity: string
  received_quantity: string
  unit_cost: string
  line_total: string
}

export interface PurchaseOrderCreateItem {
  product_id: string
  ordered_quantity: string
  unit_cost: string
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PARTIALLY_RECEIVED'
  | 'FULLY_RECEIVED'
  | 'CANCELLED'

export interface PurchaseOrder {
  id: string
  order_reference: string
  supplier: string
  supplier_name: string
  status: PurchaseOrderStatus
  status_display: string
  order_date: string
  expected_date: string | null
  notes: string
  created_by: string
  created_by_name: string
  total_cost: string
  total_ordered_quantity: string
  total_received_quantity: string
  can_cancel: boolean
  items: PurchaseOrderItem[]
  created_at: string
  updated_at: string
}

export interface PurchaseOrderCreatePayload {
  supplier_id: string
  expected_date?: string | null
  notes?: string
  items: PurchaseOrderCreateItem[]
}

export interface ReceiptItem {
  id: string
  po_item: string
  product_sku: string
  product_name: string
  accepted_quantity: string
  rejected_quantity: string
  notes: string
}

export interface Receipt {
  id: string
  receipt_reference: string
  purchase_order: string
  order_reference: string
  supplier_name: string
  location: string
  location_code: string
  location_name: string
  status: string
  status_display: string
  supplier_delivery_ref: string
  received_by: string
  received_by_name: string
  received_at: string
  items: ReceiptItem[]
  created_at: string
}

export interface ReceiptCreateItemPayload {
  po_item_id: string
  accepted_quantity: string
  rejected_quantity?: string
  notes?: string
}

export interface ReceiptCreatePayload {
  purchase_order_id: string
  location_id: string
  supplier_delivery_ref?: string
  receipt_reference?: string
  items: ReceiptCreateItemPayload[]
}
