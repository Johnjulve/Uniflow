import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/offline/db'
import { SyncService } from '@/offline/syncService'
import type { OutboxOperation } from '@/offline/types'
import { useSync } from '@/offline/useSync'

interface OutboxModalProps {
  isOpen: boolean
  onClose: () => void
}

export function OutboxModal({ isOpen, onClose }: OutboxModalProps) {
  const { isOnline, isSyncing, syncNow, refreshCounts } = useSync()
  const [operations, setOperations] = useState<OutboxOperation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  const loadOperations = useCallback(async () => {
    try {
      const items = await db.outbox.orderBy('created_at').reverse().toArray()
      setOperations(items)
    } catch {
      // IndexedDB query fallback
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const fetchOps = async () => {
      await loadOperations()
    }
    void fetchOps()
  }, [isOpen, loadOperations, isSyncing])

  if (!isOpen) return null

  const handleManualSync = async () => {
    setActionMessage(null)
    try {
      await syncNow()
      await loadOperations()
      setActionMessage('Sync dispatch completed.')
    } catch {
      setActionMessage('Sync push failed. Local changes remain queued.')
    }
  }

  const handlePurgeCommitted = async () => {
    setIsLoading(true)
    try {
      const count = await SyncService.purgeCommitted(0)
      await loadOperations()
      await refreshCounts()
      setActionMessage(`Purged ${count} acknowledged operation(s).`)
    } catch {
      setActionMessage('Failed to purge committed operations.')
    } finally {
      setIsLoading(false)
    }
  }

  const pendingCount = operations.filter((op) => op.status === 'PENDING').length
  const syncingCount = operations.filter((op) => op.status === 'SYNCING').length
  const rejectedCount = operations.filter((op) => op.status === 'REJECTED').length
  const committedCount = operations.filter((op) => op.status === 'COMMITTED').length

  const getStatusBadge = (status: OutboxOperation['status']) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge variant="warning" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
            <Clock className="h-3 w-3" />
            <span>Pending</span>
          </Badge>
        )
      case 'SYNCING':
        return (
          <Badge variant="outline" className="gap-1 bg-blue-50 text-blue-700 border-blue-200">
            <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
            <span>Syncing</span>
          </Badge>
        )
      case 'COMMITTED':
        return (
          <Badge variant="success" className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>Committed</span>
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge variant="destructive" className="gap-1 bg-rose-50 text-rose-700 border-rose-200">
            <AlertCircle className="h-3 w-3 text-rose-600" />
            <span>Rejected</span>
          </Badge>
        )
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <Card className="w-full max-w-3xl bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Offline Outbox & Sync Inspector</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                {isOnline ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                    <Wifi className="h-3 w-3" /> Online Mode
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                    <WifiOff className="h-3 w-3" /> Offline Mode (Local Mutations Queued)
                  </span>
                )}
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-mono">
                  {operations.length} Total Record{operations.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        {/* Action Message */}
        {actionMessage && (
          <div className="px-6 pt-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
              <span>{actionMessage}</span>
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        {/* Controls Summary Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Breakdown:</span>
            {pendingCount > 0 && (
              <Badge variant="warning" className="text-xs">
                {pendingCount} Pending
              </Badge>
            )}
            {syncingCount > 0 && (
              <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                {syncingCount} Syncing
              </Badge>
            )}
            {committedCount > 0 && (
              <Badge variant="success" className="text-xs">
                {committedCount} Committed
              </Badge>
            )}
            {rejectedCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {rejectedCount} Rejected
              </Badge>
            )}
            {operations.length === 0 && (
              <span className="text-xs text-slate-400 italic">No operations queued</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {committedCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePurgeCommitted}
                disabled={isLoading}
                className="h-8 text-xs text-slate-600 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                Purge Committed
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={handleManualSync}
              disabled={!isOnline || isSyncing}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          </div>
        </div>

        {/* Operations List */}
        <CardContent className="flex-1 overflow-y-auto p-0">
          {operations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-800">Local Outbox is Clear</h4>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                All business transactions and offline operations have been synchronized with the central server.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {operations.map((op) => (
                <div key={op.client_operation_id} className="p-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(op.status)}
                        <Badge variant="outline" className="font-mono text-xs font-semibold bg-white">
                          {op.operation_type}
                        </Badge>
                        <span className="font-mono text-2xs text-slate-400">
                          ID: {op.client_operation_id.slice(0, 8)}...
                        </span>
                      </div>

                      {/* Error Banner for Rejected Items */}
                      {op.status === 'REJECTED' && op.error_message && (
                        <div className="mt-2 rounded-md bg-rose-50 border border-rose-200 p-2 text-xs text-rose-700">
                          <span className="font-semibold">Server Rejection:</span> {op.error_message}
                        </div>
                      )}

                      {/* Payload snippet */}
                      <div className="mt-1 text-2xs font-mono text-slate-500 bg-slate-50 rounded p-1.5 overflow-x-auto max-w-xl">
                        {JSON.stringify(op.payload)}
                      </div>
                    </div>

                    <div className="text-right text-2xs text-slate-400 shrink-0">
                      <div>{new Date(op.created_at).toLocaleTimeString()}</div>
                      <div>{new Date(op.created_at).toLocaleDateString()}</div>
                      {op.retry_count > 0 && (
                        <div className="text-amber-600 font-medium mt-1">
                          Retries: {op.retry_count}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <CardFooter className="border-t border-slate-100 p-4 flex justify-between items-center bg-slate-50/30">
          <span className="text-2xs text-slate-400 font-mono">
            IndexedDB Outbox Engine • Client-Side Idempotent Queue
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Close Inspector
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
