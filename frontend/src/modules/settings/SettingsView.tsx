import React, { useState } from 'react'
import {
  Activity,
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Users,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { UserProfile } from '@/modules/auth/types'
import { useAuth } from '@/modules/auth/useAuth'
import { createLocation, fetchLocations, updateLocation } from '@/modules/inventory/api'
import type { Location } from '@/modules/inventory/types'
import { useSync } from '@/offline/useSync'
import {
  createUser,
  fetchAuditLogs,
  fetchUsers,
  updateUser,
  type AuditLogItem,
  type UserCreatePayload,
  type UserRoleCode,
  type UserUpdatePayload,
} from './api'

const APP_VERSION = '0.1.0'

const ROLE_OPTIONS: { value: UserRoleCode; label: string; description: string }[] = [
  { value: 'ADMIN', label: 'Administrator', description: 'Full configuration & user management' },
  { value: 'MANAGER', label: 'Inventory Manager', description: 'Catalog, purchasing & stock control' },
  { value: 'STAFF', label: 'Inventory Staff', description: 'Stock adjustments & delivery receipts' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only inventory & report access' },
]

function getActionBadge(action: string) {
  switch (action) {
    case 'LOGIN':
      return <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">LOGIN</Badge>
    case 'LOGOUT':
      return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">LOGOUT</Badge>
    case 'LOGIN_FAILED':
      return <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">LOGIN_FAILED</Badge>
    case 'CREATED':
      return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">CREATED</Badge>
    case 'STATUS_CHANGED':
      return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">STATUS_CHANGED</Badge>
    case 'DELETED':
      return <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">DELETED</Badge>
    default:
      return <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">{action}</Badge>
  }
}

interface AuditLogRowProps {
  log: AuditLogItem
  isExpanded: boolean
  onToggleExpand: (id: string) => void
}

function AuditLogRow({ log, isExpanded, onToggleExpand }: AuditLogRowProps) {
  const hasChanges = Boolean(log.changes && typeof log.changes === 'object' && Object.keys(log.changes).length > 0)

  return (
    <React.Fragment>
      <tr className="hover:bg-slate-50/75 transition-colors">
        <td className="px-6 py-3.5 whitespace-nowrap">
          <div className="text-slate-900 font-medium">{new Date(log.created_at).toLocaleString()}</div>
          <Badge
            variant="secondary"
            className={
              log.source === 'DJANGO_ADMIN'
                ? 'bg-purple-100 text-purple-800 text-[10px]'
                : 'bg-slate-100 text-slate-700 text-[10px]'
            }
          >
            {log.source === 'DJANGO_ADMIN' ? 'DJANGO /admin/' : 'REST API'}
          </Badge>
        </td>
        <td className="px-6 py-3.5">
          <div className="font-semibold text-slate-900">{log.actor_username}</div>
          <div className="text-[11px] text-slate-400">{log.ip_address || 'internal'}</div>
        </td>
        <td className="px-6 py-3.5">{getActionBadge(log.action)}</td>
        <td className="px-6 py-3.5">
          <span className="font-medium text-slate-800">{log.entity_type}</span>
          <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{log.entity_id}</div>
        </td>
        <td className="px-6 py-3.5 font-sans">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-700 text-xs font-normal">{log.summary}</span>
            {hasChanges && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] gap-1 text-blue-600 hover:text-blue-800"
                onClick={() => onToggleExpand(log.id)}
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Diff
              </Button>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && hasChanges && (
        <tr className="bg-slate-50/90">
          <td colSpan={5} className="px-8 py-3">
            <div className="rounded-md border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800 shadow-xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Captured Field Modifications / Snapshot:
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(log.changes, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  )
}

interface AuditLogSectionProps {
  logs: AuditLogItem[]
  totalCount: number
  page: number
  setPage: (p: number) => void
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  search: string
  setSearch: (v: string) => void
  actionFilter: string
  setActionFilter: (v: string) => void
  sourceFilter: string
  setSourceFilter: (v: string) => void
}

function AuditLogSection({
  logs,
  totalCount,
  page,
  setPage,
  isLoading,
  error,
  onRetry,
  search,
  setSearch,
  actionFilter,
  setActionFilter,
  sourceFilter,
  setSourceFilter,
}: AuditLogSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const maxPages = Math.max(1, Math.ceil(totalCount / 25))

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search audit trail by actor, entity ID, or summary..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setPage(1)
              }}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
            >
              <option value="">All Actions</option>
              <option value="LOGIN">User Login</option>
              <option value="LOGOUT">User Logout</option>
              <option value="LOGIN_FAILED">Login Failed</option>
              <option value="CREATED">Record Created</option>
              <option value="UPDATED">Record Updated</option>
              <option value="STATUS_CHANGED">Status / Role Changed</option>
              <option value="DELETED">Record Deleted</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value)
                setPage(1)
              }}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
            >
              <option value="">All Sources</option>
              <option value="API">API Gateway</option>
              <option value="DJANGO_ADMIN">Django /admin/</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error.message}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-3">Timestamp & Source</th>
                  <th className="px-6 py-3">Actor & IP</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Target Entity</th>
                  <th className="px-6 py-3">Summary & Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-xs">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-sans text-sm">
                      Loading audit events...
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center font-sans">
                      <Activity className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-900">No matching audit events recorded</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <AuditLogRow
                      key={log.id}
                      log={log}
                      isExpanded={expandedId === log.id}
                      onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalCount > 25 && (
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 text-xs text-slate-600 font-sans">
              <span>
                Page {page} of {maxPages} ({totalCount} total events)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={page >= maxPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}


function SystemDiagnosticsGrid({ currentUser }: { currentUser: UserProfile | null }) {
  const { isOnline, pendingCount, rejectedCount, isSyncing, lastSyncTime, syncNow } = useSync()

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>Active Session & Role</span>
            <Shield className="h-4 w-4 text-blue-600" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Operator:</span>
            <span className="font-semibold text-slate-900">{currentUser?.username ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Assigned Role:</span>
            <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
              {currentUser?.role_display ?? currentUser?.role ?? 'Unknown'}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1 pt-1">
            {currentUser?.can_manage_users && <Badge variant="secondary">Manage Users</Badge>}
            {currentUser?.can_manage_purchasing && <Badge variant="secondary">Purchasing</Badge>}
            {currentUser?.can_manage_stock && <Badge variant="secondary">Stock Control</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>Offline Sync & Outbox</span>
            {isOnline ? (
              <Wifi className="h-4 w-4 text-emerald-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-amber-600" />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">API Gateway:</span>
            <Badge
              variant="outline"
              className={
                isOnline
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-amber-300 bg-amber-50 text-amber-700'
              }
            >
              {isOnline ? 'Connected' : 'Offline Mode'}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Queued / Rejected:</span>
            <span className="font-semibold text-slate-900">
              {pendingCount} pending · {rejectedCount} rejected
            </span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-slate-400 truncate">
              {lastSyncTime ? `Last sync: ${new Date(lastSyncTime).toLocaleTimeString()}` : 'No push recorded'}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void syncNow()}
              disabled={!isOnline || isSyncing}
            >
              <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-700">
            <span>Platform Profile</span>
            <Database className="h-4 w-4 text-slate-600" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Release Version:</span>
            <Badge variant="outline" className="font-mono text-slate-800">
              v{APP_VERSION}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Architecture:</span>
            <span className="font-medium text-slate-800">Modular Monolith (IMS)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Local Persistence:</span>
            <span className="font-medium text-slate-800">Dexie IndexedDB + PostgreSQL</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface UserDirectoryTableProps {
  users: UserProfile[]
  currentUserId?: string
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  onEdit: (user: UserProfile) => void
}

function UserDirectoryTable({
  users,
  currentUserId,
  isLoading,
  error,
  onRetry,
  onEdit,
}: UserDirectoryTableProps) {
  if (error) {
    return (
      <div className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error.message}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="px-6 py-3">Username & Identity</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Capabilities</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Loading user accounts...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center">
                  <Users className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-900">No matching users found</p>
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/75 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <span>{u.username}</span>
                      {u.id === currentUserId && (
                        <Badge variant="secondary" className="text-[10px]">
                          You
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {[u.first_name, u.last_name].filter(Boolean).join(' ') || 'No full name'}{' '}
                      {u.email ? `· ${u.email}` : ''}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="border-slate-300 bg-white text-slate-800">
                      {u.role_display || u.role}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-600">
                    {[
                      u.can_manage_users && 'Admin',
                      u.can_manage_purchasing && 'Purchasing',
                      u.can_manage_stock && 'Inventory',
                      'Read',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                  <td className="px-6 py-4">
                    {u.is_active ? (
                      <Badge
                        variant="outline"
                        className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 text-slate-500">
                        <XCircle className="h-3 w-3" />
                        Disabled
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-slate-600 hover:text-blue-700"
                      onClick={() => onEdit(u)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

interface LocationFormModalProps {
  editingLocation: Location | null
  isSaving: boolean
  formError: string | null
  onClose: () => void
  onSubmitCreate: (payload: { code: string; name: string; is_active: boolean }) => void
  onSubmitUpdate: (id: string, payload: { code: string; name: string; is_active: boolean }) => void
}

function LocationFormModal({
  editingLocation,
  isSaving,
  formError,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}: LocationFormModalProps) {
  const [code, setCode] = useState(editingLocation?.code ?? '')
  const [name, setName] = useState(editingLocation?.name ?? '')
  const [isActive, setIsActive] = useState(editingLocation?.is_active ?? true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = { code: code.trim().toUpperCase(), name: name.trim(), is_active: isActive }
    if (editingLocation) {
      onSubmitUpdate(editingLocation.id, payload)
      return
    }
    onSubmitCreate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
          <CardTitle className="text-lg font-bold text-slate-900">
            {editingLocation ? `Edit Warehouse: ${editingLocation.code}` : 'Add Warehouse Location'}
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {formError && (
              <div className="rounded-md bg-rose-50 p-3 text-xs font-medium text-rose-700">
                {formError}
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Location Code *</label>
              <Input
                placeholder="e.g. MAIN-WH or BAY-02"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Warehouse Name *</label>
              <Input
                placeholder="e.g. Primary Storage Facility"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="location_is_active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              <label htmlFor="location_is_active" className="text-xs font-medium text-slate-700">
                Active warehouse location
              </label>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingLocation ? 'Save Changes' : 'Create Location'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

interface LocationDirectoryTableProps {
  locations: Location[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  onEdit: (loc: Location) => void
}

function LocationDirectoryTable({
  locations,
  isLoading,
  error,
  onRetry,
  onEdit,
}: LocationDirectoryTableProps) {
  if (error) {
    return (
      <div className="flex items-center justify-between rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error.message}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="px-6 py-3">Location Code</th>
              <th className="px-6 py-3">Warehouse Name</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Created</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Loading warehouse locations...
                </td>
              </tr>
            ) : locations.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center">
                  <Building2 className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                  <p className="text-sm font-semibold text-slate-900">No warehouse locations configured</p>
                </td>
              </tr>
            ) : (
              locations.map((loc) => (
                <tr key={loc.id} className="hover:bg-slate-50/75 transition-colors">
                  <td className="px-6 py-4 font-mono font-semibold text-slate-900">{loc.code}</td>
                  <td className="px-6 py-4 font-medium text-slate-800">{loc.name}</td>
                  <td className="px-6 py-4">
                    {loc.is_active ? (
                      <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1 text-slate-500">
                        <XCircle className="h-3 w-3" />
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    {new Date(loc.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-slate-600 hover:text-blue-700"
                      onClick={() => onEdit(loc)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

interface UserFormModalProps {
  editingUser: UserProfile | null
  currentUserId?: string
  isSaving: boolean
  formError: string | null
  onClose: () => void
  onSubmitCreate: (payload: UserCreatePayload) => void
  onSubmitUpdate: (id: string, payload: UserUpdatePayload) => void
}

function UserFormModal({
  editingUser,
  currentUserId,
  isSaving,
  formError,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
}: UserFormModalProps) {
  const [username, setUsername] = useState(editingUser?.username ?? '')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState(editingUser?.email ?? '')
  const [firstName, setFirstName] = useState(editingUser?.first_name ?? '')
  const [lastName, setLastName] = useState(editingUser?.last_name ?? '')
  const [role, setRole] = useState<UserRoleCode>(editingUser?.role ?? 'STAFF')
  const [isActive, setIsActive] = useState(editingUser?.is_active ?? true)

  const isSelf = Boolean(editingUser && editingUser.id === currentUserId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const baseFields = {
      email: email.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role,
      is_active: isActive,
    }
    if (editingUser) {
      onSubmitUpdate(editingUser.id, {
        ...baseFields,
        ...(password ? { password } : {}),
      })
      return
    }
    onSubmitCreate({ username: username.trim(), password, ...baseFields })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
          <CardTitle className="text-lg font-bold text-slate-900">
            {editingUser ? `Edit User: ${editingUser.username}` : 'Provision User Account'}
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {formError && (
              <div className="rounded-md bg-rose-50 p-3 text-xs font-medium text-rose-700">
                {formError}
              </div>
            )}
            {!editingUser && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Username *</label>
                <Input
                  placeholder="e.g. warehouse_lead"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">First Name</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Last Name</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Email Address</label>
              <Input
                type="email"
                placeholder="operator@uniflow.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Assigned Role *</label>
                <select
                  value={role}
                  disabled={isSelf}
                  onChange={(e) => setRole(e.target.value as UserRoleCode)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  {editingUser ? 'New Password (optional)' : 'Initial Password *'}
                </label>
                <Input
                  type="password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required={!editingUser}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="user_is_active"
                checked={isActive}
                disabled={isSelf}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 disabled:opacity-50"
              />
              <label htmlFor="user_is_active" className="text-xs font-medium text-slate-700">
                Active account (uncheck to immediately revoke session tokens)
              </label>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

export function SettingsView() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'users' | 'locations' | 'audit'>('users')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditActionFilter, setAuditActionFilter] = useState('')
  const [auditSourceFilter, setAuditSourceFilter] = useState('')
  const [auditPage, setAuditPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  // Location modal & state
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [locationFormError, setLocationFormError] = useState<string | null>(null)

  const canManageUsers = Boolean(user?.can_manage_users)

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingUser(null)
    setFormError(null)
  }

  const closeLocationModal = () => {
    setIsLocationModalOpen(false)
    setEditingLocation(null)
    setLocationFormError(null)
  }

  const handleMutationSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['users'] })
    void queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
    closeModal()
  }

  const handleLocationSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'locations'] })
    void queryClient.invalidateQueries({ queryKey: ['audit-logs'] })
    closeLocationModal()
  }

  const usersQuery = useQuery({
    queryKey: ['users', { search, roleFilter }],
    queryFn: () =>
      fetchUsers({
        search: search.trim() || undefined,
        role: roleFilter || undefined,
      }),
    enabled: canManageUsers && activeTab === 'users',
  })

  const locationsQuery = useQuery({
    queryKey: ['inventory', 'locations'],
    queryFn: fetchLocations,
    enabled: canManageUsers && activeTab === 'locations',
  })

  const auditQuery = useQuery({
    queryKey: ['audit-logs', { auditSearch, auditActionFilter, auditSourceFilter, auditPage }],
    queryFn: () =>
      fetchAuditLogs({
        search: auditSearch.trim() || undefined,
        action: auditActionFilter || undefined,
        source: auditSourceFilter || undefined,
        page: auditPage,
      }),
    enabled: canManageUsers && activeTab === 'audit',
  })

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: handleMutationSuccess,
    onError: (err: Error) => setFormError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserUpdatePayload }) =>
      updateUser(id, payload),
    onSuccess: handleMutationSuccess,
    onError: (err: Error) => setFormError(err.message),
  })

  const createLocationMutation = useMutation({
    mutationFn: createLocation,
    onSuccess: handleLocationSuccess,
    onError: (err: Error) => setLocationFormError(err.message),
  })

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { code?: string; name?: string; is_active?: boolean } }) =>
      updateLocation(id, payload),
    onSuccess: handleLocationSuccess,
    onError: (err: Error) => setLocationFormError(err.message),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            System Settings & Access Control
          </h2>
          <p className="text-sm text-slate-500">
            Platform diagnostics, offline synchronization state, user administration, and system audit logs.
          </p>
        </div>
        {canManageUsers && activeTab === 'users' && (
          <Button
            onClick={() => {
              setEditingUser(null)
              setFormError(null)
              setIsModalOpen(true)
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            New User Account
          </Button>
        )}
        {canManageUsers && activeTab === 'locations' && (
          <Button
            onClick={() => {
              setEditingLocation(null)
              setLocationFormError(null)
              setIsLocationModalOpen(true)
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Warehouse Location
          </Button>
        )}
      </div>

      <SystemDiagnosticsGrid currentUser={user} />

      {canManageUsers ? (
        <div className="space-y-4">
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'users'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>User Directory</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('locations')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'locations'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Warehouses & Locations</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === 'audit'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>Security & Admin Audit Trail</span>
            </button>
          </div>

          {activeTab === 'users' && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="Search users by username, name, or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <select
                      value={roleFilter}
                      onChange={(e) => setRoleFilter(e.target.value)}
                      className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
                    >
                      <option value="">All Roles</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              <UserDirectoryTable
                users={usersQuery.data?.results ?? []}
                currentUserId={user?.id}
                isLoading={usersQuery.isLoading}
                error={usersQuery.error instanceof Error ? usersQuery.error : null}
                onRetry={() => void usersQuery.refetch()}
                onEdit={(targetUser) => {
                  setEditingUser(targetUser)
                  setFormError(null)
                  setIsModalOpen(true)
                }}
              />
            </div>
          )}

          {activeTab === 'locations' && (
            <LocationDirectoryTable
              locations={locationsQuery.data ?? []}
              isLoading={locationsQuery.isLoading}
              error={locationsQuery.error instanceof Error ? locationsQuery.error : null}
              onRetry={() => void locationsQuery.refetch()}
              onEdit={(targetLoc) => {
                setEditingLocation(targetLoc)
                setLocationFormError(null)
                setIsLocationModalOpen(true)
              }}
            />
          )}

          {activeTab === 'audit' && (
            <AuditLogSection
              logs={auditQuery.data?.results ?? []}
              totalCount={auditQuery.data?.count ?? 0}
              page={auditPage}
              setPage={setAuditPage}
              isLoading={auditQuery.isLoading}
              error={auditQuery.error instanceof Error ? auditQuery.error : null}
              onRetry={() => void auditQuery.refetch()}
              search={auditSearch}
              setSearch={setAuditSearch}
              actionFilter={auditActionFilter}
              setActionFilter={setAuditActionFilter}
              sourceFilter={auditSourceFilter}
              setSourceFilter={setAuditSourceFilter}
            />
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-sm text-slate-600">
            User account provisioning, warehouse management, and audit trail inspection are restricted to{' '}
            <span className="font-semibold text-slate-900">Administrator</span> accounts.
          </CardContent>
        </Card>
      )}

      {isModalOpen && (
        <UserFormModal
          key={editingUser?.id ?? 'create'}
          editingUser={editingUser}
          currentUserId={user?.id}
          isSaving={createMutation.isPending || updateMutation.isPending}
          formError={formError}
          onClose={closeModal}
          onSubmitCreate={(payload) => createMutation.mutate(payload)}
          onSubmitUpdate={(id, payload) => updateMutation.mutate({ id, payload })}
        />
      )}

      {isLocationModalOpen && (
        <LocationFormModal
          key={editingLocation?.id ?? 'create-loc'}
          editingLocation={editingLocation}
          isSaving={createLocationMutation.isPending || updateLocationMutation.isPending}
          formError={locationFormError}
          onClose={closeLocationModal}
          onSubmitCreate={(payload) => createLocationMutation.mutate(payload)}
          onSubmitUpdate={(id, payload) => updateLocationMutation.mutate({ id, payload })}
        />
      )}
    </div>
  )
}
