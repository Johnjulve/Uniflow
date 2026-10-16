/**
 * TypeScript types and interfaces for the client-side Dexie IndexedDB
 * outbox queue and local replica caches.
 */

export type OutboxStatus = 'PENDING' | 'SYNCING' | 'COMMITTED' | 'REJECTED'

export type OperationType = 'STOCK_ADJUSTMENT' | 'CREATE_SUPPLIER' | 'POST_RECEIPT'

export interface OutboxOperation {
  client_operation_id: string
  operation_type: OperationType
  payload: Record<string, unknown>
  status: OutboxStatus
  created_at: string
  retry_count: number
  error_message?: string
  response_payload?: Record<string, unknown>
}

export interface SyncState {
  key: string
  last_pull_at: string | null
  last_push_at: string | null
  is_online: boolean
}

export interface CachedCategory {
  id: string
  name: string
  slug: string
  updated_at: string
}

export interface CachedProduct {
  id: string
  sku: string
  name: string
  barcode?: string
  purchase_cost: string
  selling_price: string
  unit_of_measure: string
  is_active: boolean
  updated_at: string
}

export interface CachedLocation {
  id: string
  code: string
  name: string
  is_active: boolean
  updated_at: string
}

export interface CachedSupplier {
  id: string
  name: string
  contact_name: string
  email: string
  phone: string
  is_active: boolean
  updated_at: string
}

export interface CachedBalance {
  id: string
  product_id: string
  location_id: string
  current_quantity: string
  updated_at: string
}
