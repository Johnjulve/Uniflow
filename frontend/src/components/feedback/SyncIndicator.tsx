import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useSync } from '@/offline/useSync'

export interface SyncIndicatorProps {
  pendingCount?: number
  isSyncing?: boolean
  isOnline?: boolean
  onClick?: () => void
}

export function SyncIndicator(props: SyncIndicatorProps) {
  const sync = useSync()

  const isOnline = props.isOnline !== undefined ? props.isOnline : sync.isOnline
  const pendingCount = props.pendingCount !== undefined ? props.pendingCount : sync.pendingCount
  const rejectedCount = sync.rejectedCount
  const isSyncing = props.isSyncing !== undefined ? props.isSyncing : sync.isSyncing
  const onClick = props.onClick

  const cursorClass = onClick ? 'cursor-pointer hover:opacity-85 transition-opacity' : ''

  if (isSyncing) {
    return (
      <Badge
        variant="outline"
        onClick={onClick}
        className={`gap-1.5 border-blue-300 bg-blue-50 text-blue-700 ${cursorClass}`}
        title="Synchronizing outbox with server... Click to open Outbox Inspector"
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
        <span>Syncing...</span>
      </Badge>
    )
  }

  if (!isOnline) {
    return (
      <Badge
        variant="warning"
        onClick={onClick}
        className={`gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 ${cursorClass}`}
        title="Working offline. Local changes queued in IndexedDB. Click to inspect."
      >
        <CloudOff className="h-3.5 w-3.5 text-amber-600" />
        <span>Offline ({pendingCount} queued)</span>
      </Badge>
    )
  }

  if (rejectedCount > 0) {
    return (
      <Badge
        variant="destructive"
        onClick={onClick}
        className={`gap-1.5 bg-rose-50 text-rose-700 border border-rose-200 ${cursorClass}`}
        title={`${rejectedCount} operation(s) rejected by server. Click to inspect errors.`}
      >
        <CloudOff className="h-3.5 w-3.5 text-rose-600" />
        <span>{rejectedCount} Sync Error{rejectedCount === 1 ? '' : 's'}</span>
      </Badge>
    )
  }

  if (pendingCount > 0) {
    return (
      <Badge
        variant="outline"
        onClick={onClick}
        className={`gap-1.5 border-amber-300 bg-amber-50 text-amber-800 ${cursorClass}`}
        title={`${pendingCount} operation(s) pending upload. Click to inspect.`}
      >
        <Cloud className="h-3.5 w-3.5 text-amber-600" />
        <span>{pendingCount} Pending Sync</span>
      </Badge>
    )
  }

  return (
    <Badge
      variant="success"
      onClick={onClick}
      className={`gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 ${cursorClass}`}
      title="System is online and synchronized. Click to inspect outbox."
    >
      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      <span className="font-medium">Online</span>
    </Badge>
  )
}
