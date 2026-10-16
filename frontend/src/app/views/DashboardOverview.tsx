import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Boxes,
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  Database,
  Activity,
  Loader2,
} from 'lucide-react'
import { useSync } from '@/offline/useSync'
import { cn } from '@/lib/utils'
import { fetchProducts } from '@/modules/catalog/api'
import { fetchStockBalances } from '@/modules/inventory/api'
import { fetchPurchaseOrders } from '@/modules/purchasing/api'

export function DashboardOverview() {
  const navigate = useNavigate()
  const { isOnline, pendingCount, isSyncing, rejectedCount } = useSync()

  // Live queries for dashboard metrics
  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['dashboard', 'products'],
    queryFn: () => fetchProducts({ page: 1 }),
    staleTime: 30000,
  })

  const { data: balancesData, isLoading: loadingBalances } = useQuery({
    queryKey: ['dashboard', 'balances'],
    queryFn: () => fetchStockBalances({}),
    staleTime: 30000,
  })

  const { data: poData, isLoading: loadingPOs } = useQuery({
    queryKey: ['dashboard', 'purchase-orders'],
    queryFn: () => fetchPurchaseOrders({}),
    staleTime: 30000,
  })

  const totalProducts = productsData?.count ?? 0

  const activeStockUnits = (balancesData?.results || []).reduce(
    (sum, b) => sum + (parseFloat(b.current_quantity) || 0),
    0
  )

  const lowStockCount = (balancesData?.results || []).filter((b) => b.is_low_stock).length

  const openPOs = (poData?.results || []).filter(
    (po) =>
      po.status === 'DRAFT' ||
      po.status === 'SUBMITTED' ||
      po.status === 'PARTIALLY_RECEIVED'
  ).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">System Overview</h2>
        <p className="text-sm text-slate-500">
          Uniflow Inventory Management platform status and operational metrics.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          className="cursor-pointer hover:border-slate-300 transition-colors"
          onClick={() => navigate('/catalog')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Products</CardTitle>
            <Package className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            {loadingProducts ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">{totalProducts}</div>
            )}
            <p className="text-xs text-slate-500 mt-1">Catalog active definitions</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-slate-300 transition-colors"
          onClick={() => navigate('/inventory')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Stock Units</CardTitle>
            <Boxes className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            {loadingBalances ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">{activeStockUnits.toLocaleString()}</div>
            )}
            <p className="text-xs text-slate-500 mt-1">Across all storage locations</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-slate-300 transition-colors"
          onClick={() => navigate('/purchasing')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Open Purchase Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            {loadingPOs ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">{openPOs}</div>
            )}
            <p className="text-xs text-slate-500 mt-1">Awaiting delivery / receiving</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-slate-300 transition-colors"
          onClick={() => navigate('/inventory')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Low Stock Alerts</CardTitle>
            <AlertTriangle className={cn('h-4 w-4', lowStockCount > 0 ? 'text-amber-500' : 'text-slate-400')} />
          </CardHeader>
          <CardContent>
            {loadingBalances ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className={cn('text-2xl font-bold', lowStockCount > 0 ? 'text-amber-600' : 'text-slate-900')}>
                {lowStockCount}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">Items at or below reorder threshold</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Launch & Architecture Status */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Architecture Status</CardTitle>
              <Badge variant="success">Phase 1 Foundation</Badge>
            </div>
            <CardDescription>
              Modular Monolith Core (DRF + React 19 + IndexedDB Outbox)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center gap-3">
                <Activity
                  className={cn(
                    'h-5 w-5',
                    isOnline ? 'text-emerald-600' : 'text-amber-500'
                  )}
                />
                <div>
                  <p className="text-sm font-medium text-slate-900">REST API Gateway</p>
                  <p className="text-xs text-slate-500">Django REST Framework /api/v1/</p>
                </div>
              </div>
              <Badge
                variant={isOnline ? 'success' : 'warning'}
                className={
                  isOnline
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }
              >
                {isOnline ? 'Connected' : 'Offline'}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Offline Outbox Engine</p>
                  <p className="text-xs text-slate-500">Dexie IndexedDB Client Storage</p>
                </div>
              </div>
              {isSyncing ? (
                <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
                  Syncing...
                </Badge>
              ) : rejectedCount > 0 ? (
                <Badge variant="destructive" className="border-rose-200 bg-rose-50 text-rose-700">
                  {rejectedCount} Error{rejectedCount === 1 ? '' : 's'}
                </Badge>
              ) : pendingCount > 0 ? (
                <Badge variant="warning" className="border-amber-200 bg-amber-50 text-amber-700">
                  {pendingCount} Queued
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Synced
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Shortcuts to primary inventory operations</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="default"
              className="justify-between"
              onClick={() => navigate('/catalog')}
            >
              <span>View Product Catalog</span>
              <ArrowUpRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="justify-between"
              onClick={() => navigate('/inventory')}
            >
              <span>Record Stock Adjustment</span>
              <Boxes className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="justify-between text-slate-700"
              onClick={() => navigate('/reports')}
            >
              <span>Generate Inventory Valuation Report</span>
              <TrendingUp className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
