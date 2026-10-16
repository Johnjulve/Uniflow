import Dexie, { type Table } from 'dexie'
import type {
  CachedBalance,
  CachedCategory,
  CachedLocation,
  CachedProduct,
  CachedSupplier,
  OutboxOperation,
  SyncState,
} from './types'

export class UniflowDatabase extends Dexie {
  outbox!: Table<OutboxOperation, string>
  cached_products!: Table<CachedProduct, string>
  cached_categories!: Table<CachedCategory, string>
  cached_locations!: Table<CachedLocation, string>
  cached_suppliers!: Table<CachedSupplier, string>
  cached_balances!: Table<CachedBalance, string>
  sync_state!: Table<SyncState, string>

  constructor() {
    super('uniflow_db')

    this.version(1).stores({
      outbox: '&client_operation_id, status, created_at, operation_type',
      cached_products: '&id, sku, name, is_active',
      cached_categories: '&id, slug',
      cached_locations: '&id, code, is_active',
      cached_suppliers: '&id, name, is_active',
      cached_balances: '&id, product_id, location_id',
      sync_state: '&key',
    })
  }
}

export const db = new UniflowDatabase()
