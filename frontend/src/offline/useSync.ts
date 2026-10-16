import { useCallback, useEffect, useState } from 'react'
import { db } from './db'
import { SyncService } from './syncService'
import type { OperationType, OutboxOperation } from './types'

export function useSync() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [rejectedCount, setRejectedCount] = useState<number>(0)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)

  const refreshCounts = useCallback(async () => {
    try {
      const [pending, syncing, rejected, state] = await Promise.all([
        db.outbox.where('status').equals('PENDING').count(),
        db.outbox.where('status').equals('SYNCING').count(),
        db.outbox.where('status').equals('REJECTED').count(),
        db.sync_state.get('sync_state'),
      ])
      setPendingCount(pending + syncing)
      setRejectedCount(rejected)
      if (state?.last_push_at) {
        setLastSyncTime(state.last_push_at)
      }
    } catch {
      // IndexedDB may be opening
    }
  }, [])

  const checkHealth = useCallback(async () => {
    if (!navigator.onLine) {
      setIsOnline(false)
      return false
    }
    try {
      const res = await fetch('/api/v1/health/', { method: 'GET', cache: 'no-store' })
      const healthy = res.ok
      setIsOnline(healthy)
      return healthy
    } catch {
      setIsOnline(false)
      return false
    }
  }, [])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return
    setIsSyncing(true)
    try {
      await SyncService.pushOutbox()
      await SyncService.pullDelta()
      setIsOnline(true)
    } catch (err) {
      console.warn('Sync attempt failed:', err)
      setIsOnline(false)
    } finally {
      setIsSyncing(false)
      await refreshCounts()
    }
  }, [isSyncing, refreshCounts])

  useEffect(() => {
    const handleOnline = async () => {
      const healthy = await checkHealth()
      if (healthy) {
        void syncNow()
      }
    }
    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Initial check & counts
    const init = async () => {
      await Promise.all([refreshCounts(), checkHealth()])
    }
    void init()

    // Periodic count & health refresh every 5 seconds
    const interval = setInterval(() => {
      void refreshCounts()
      void checkHealth()
    }, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [syncNow, refreshCounts, checkHealth])

  const enqueue = useCallback(
    async (type: OperationType, payload: Record<string, unknown>): Promise<OutboxOperation> => {
      const op = await SyncService.enqueue(type, payload)
      await refreshCounts()
      return op
    },
    [refreshCounts]
  )

  return {
    isOnline,
    pendingCount,
    rejectedCount,
    isSyncing,
    lastSyncTime,
    syncNow,
    enqueue,
    refreshCounts,
  }
}
