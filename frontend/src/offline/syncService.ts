/**
 * Offline synchronization service: manages the durable local outbox,
 * batch push dispatching with idempotency, and incremental delta pulls.
 */
import { db } from './db'
import type { OperationType, OutboxOperation } from './types'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('uniflow_auth_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  }
}

export class SyncService {
  /**
   * Enqueue a new business mutation into the durable IndexedDB outbox.
   * Generates an authoritative client_operation_id (UUIDv4) immediately.
   */
  static async enqueue(
    type: OperationType,
    payload: Record<string, unknown>
  ): Promise<OutboxOperation> {
    const op: OutboxOperation = {
      client_operation_id: crypto.randomUUID(),
      operation_type: type,
      payload,
      status: 'PENDING',
      created_at: new Date().toISOString(),
      retry_count: 0,
    }

    await db.outbox.add(op)

    // Attempt immediate push if online
    if (navigator.onLine) {
      void this.pushOutbox().catch(() => {
        // Will retry on next reconnect or background trigger
      })
    }

    return op
  }

  /**
   * Dispatch all pending outbox operations to the server in a batch push.
   */
  static async pushOutbox(): Promise<{
    processed: number
    committed: number
    rejected: number
  }> {
    const pendingOps = await db.outbox
      .where('status')
      .equals('PENDING')
      .sortBy('created_at')

    if (pendingOps.length === 0) {
      return { processed: 0, committed: 0, rejected: 0 }
    }

    // Mark as SYNCING
    const opIds = pendingOps.map((op) => op.client_operation_id)
    await db.outbox.where('client_operation_id').anyOf(opIds).modify({ status: 'SYNCING' })

    try {
      const response = await fetch('/api/v1/sync/push/', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          operations: pendingOps.map((op) => ({
            client_operation_id: op.client_operation_id,
            operation_type: op.operation_type,
            payload: op.payload,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(`Sync push HTTP error: ${response.status}`)
      }

      const data = await response.json()
      const results: Array<{
        client_operation_id: string
        status: 'COMMITTED' | 'REJECTED'
        result?: Record<string, unknown>
        error?: string
      }> = data.results || []

      let committed = 0
      let rejected = 0

      for (const res of results) {
        if (res.status === 'COMMITTED') {
          committed++
          await db.outbox.update(res.client_operation_id, {
            status: 'COMMITTED',
            response_payload: res.result,
            error_message: undefined,
          })
        } else {
          rejected++
          await db.outbox.update(res.client_operation_id, {
            status: 'REJECTED',
            error_message: res.error || 'Operation rejected by server.',
          })
        }
      }

      // Record sync timestamp
      await db.sync_state.put({
        key: 'sync_state',
        last_pull_at: (await db.sync_state.get('sync_state'))?.last_pull_at || null,
        last_push_at: new Date().toISOString(),
        is_online: true,
      })

      return { processed: results.length, committed, rejected }
    } catch (err) {
      // Revert to PENDING with incremented retry count on network failure
      for (const op of pendingOps) {
        await db.outbox.update(op.client_operation_id, {
          status: 'PENDING',
          retry_count: op.retry_count + 1,
        })
      }
      throw err
    }
  }

  /**
   * Pull delta changes from the server since the last synchronization cursor.
   */
  static async pullDelta(): Promise<void> {
    const state = await db.sync_state.get('sync_state')
    const sinceParam = state?.last_pull_at ? `?since=${encodeURIComponent(state.last_pull_at)}` : ''

    const response = await fetch(`/api/v1/sync/pull/${sinceParam}`, {
      headers: getAuthHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Sync pull HTTP error: ${response.status}`)
    }

    const data = await response.json()

    await db.transaction(
      'rw',
      [
        db.cached_categories,
        db.cached_products,
        db.cached_locations,
        db.cached_suppliers,
        db.cached_balances,
        db.sync_state,
      ],
      async () => {
        if (data.categories?.length) await db.cached_categories.bulkPut(data.categories)
        if (data.products?.length) await db.cached_products.bulkPut(data.products)
        if (data.locations?.length) await db.cached_locations.bulkPut(data.locations)
        if (data.suppliers?.length) await db.cached_suppliers.bulkPut(data.suppliers)
        if (data.balances?.length) await db.cached_balances.bulkPut(data.balances)

        await db.sync_state.put({
          key: 'sync_state',
          last_pull_at: data.server_timestamp,
          last_push_at: state?.last_push_at || null,
          is_online: true,
        })
      }
    )
  }

  /**
   * Remove acknowledged committed operations older than the specified retention days.
   */
  static async purgeCommitted(retentionDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()
    const oldOps = await db.outbox
      .where('status')
      .equals('COMMITTED')
      .filter((op) => op.created_at < cutoff)
      .primaryKeys()

    await db.outbox.bulkDelete(oldOps)
    return oldOps.length
  }
}
