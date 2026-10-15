import * as React from 'react'
import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface SyncIndicatorProps {
  pendingCount?: number
  isSyncing?: boolean
}

export function SyncIndicator({ pendingCount = 0, isSyncing = false }: SyncIndicatorProps) {
  const [isOnline, setIsOnline] = React.useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  React.useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
    }
    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isSyncing) {
    return (
      <Badge variant="outline" className="gap-1.5 border-blue-300 bg-blue-50 text-blue-700">
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
        <span>Syncing changes...</span>
      </Badge>
    )
  }

  if (!isOnline) {
    return (
      <Badge variant="warning" className="gap-1.5 bg-amber-50 text-amber-800 border border-amber-200">
        <CloudOff className="h-3.5 w-3.5 text-amber-600" />
        <span>Offline ({pendingCount} queued)</span>
      </Badge>
    )
  }

  if (pendingCount > 0) {
    return (
      <Badge variant="outline" className="gap-1.5 border-amber-300 bg-amber-50 text-amber-800">
        <Cloud className="h-3.5 w-3.5 text-amber-600" />
        <span>{pendingCount} Pending Sync</span>
      </Badge>
    )
  }

  return (
    <Badge variant="success" className="gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      <span className="font-medium">Online</span>
    </Badge>
  )
}
