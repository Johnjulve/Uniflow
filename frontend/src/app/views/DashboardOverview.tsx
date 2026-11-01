import { useState } from 'react'
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
  Truck,
  Building2,
  Layers,
  ArrowRight,
  Percent,
} from 'lucide-react'
import { useSync } from '@/offline/useSync'
import { cn, formatCurrency } from '@/lib/utils'
import { fetchProducts } from '@/modules/catalog/api'
import { fetchStockBalances } from '@/modules/inventory/api'
import { fetchPurchaseOrders } from '@/modules/purchasing/api'
import { fetchDashboardSummary } from '@/modules/reports/api'

export function DashboardOverview() {
  const navigate = useNavigate()
  const { isOnline, pendingCount, isSyncing, rejectedCount } = useSync()
  const [distributionTab, setDistributionTab] = useState<'locations' | 'categories'>('locations')

  // Live queries for dashboard metrics
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 15000,
  })

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

  const totalProducts = productsData?.count ?? summary?.total_active_products ?? 0

  const activeStockUnits = summary?.total_inventory_quantity
    ? parseFloat(summary.total_inventory_quantity)
    : (balancesData?.results || []).reduce(
        (sum, b) => sum + (parseFloat(b.current_quantity) || 0),
        0
      )

  const lowStockCount = summary?.low_stock_count ?? (balancesData?.results || []).filter((b) => b.is_low_stock).length

  const openPOs = (poData?.results || []).filter(
    (po) =>
      po.status === 'DRAFT' ||
      po.status === 'SUBMITTED' ||
      po.status === 'PARTIALLY_RECEIVED'
  ).length

  // Financial metrics
  const inStockValuation = parseFloat(summary?.total_inventory_valuation || '0')
  const potentialRevenue = parseFloat(summary?.potential_revenue || '0')
  const projectedMargin = parseFloat(summary?.projected_margin || '0')
  const marginPercentage = summary?.margin_percentage || '0.0'
  const incomingCost = parseFloat(summary?.incoming_cost || '0')
  const incomingQty = parseFloat(summary?.incoming_quantity || '0')
  const monthlyRealizedRevenue = parseFloat(summary?.monthly_realized_revenue || '0')
  const weeklyRealizedRevenue = parseFloat(summary?.weekly_realized_revenue || '0')
  const monthlyRealizedProfit = parseFloat(summary?.monthly_realized_profit || '0')

  // Graph proportional calculation (max of revenue or in-stock+incoming)
  const maxFinancialValue = Math.max(potentialRevenue, inStockValuation + incomingCost, 1)
  const inStockCostPercent = Math.min(100, Math.round((inStockValuation / maxFinancialValue) * 100))
  const potentialRevenuePercent = Math.min(100, Math.round((potentialRevenue / maxFinancialValue) * 100))
  const incomingCostPercent = Math.min(100, Math.round((incomingCost / maxFinancialValue) * 100))

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">System & Financial Overview</h2>
          <p className="text-sm text-slate-500">
            Real-time inventory valuation, revenue forecasts, procurement pipeline, and operational status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/reports')}
            className="text-xs gap-1.5"
          >
            <span>Full Reports Center</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Financial Analytics Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Total Cost of In-Stock */}
        <Card
          className="cursor-pointer border-slate-200 hover:border-blue-400 hover:shadow-xs transition-all"
          onClick={() => navigate('/inventory')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total In-Stock Cost</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 font-bold font-mono text-sm">
              ₱
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(inStockValuation)}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Current asset value at purchase cost
            </p>
          </CardContent>
        </Card>

        {/* Potential Retail Revenue */}
        <Card
          className="cursor-pointer border-slate-200 hover:border-emerald-400 hover:shadow-xs transition-all"
          onClick={() => navigate('/catalog')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Potential Revenue</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-emerald-700">
                {formatCurrency(potentialRevenue)}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Inventory value at catalog selling price
            </p>
          </CardContent>
        </Card>

        {/* Monthly Realized Revenue */}
        <Card
          className="cursor-pointer border-slate-200 hover:border-emerald-500 hover:shadow-xs transition-all"
          onClick={() => navigate('/inventory')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Monthly Realized Revenue</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {formatCurrency(monthlyRealizedRevenue)}
                  </span>
                  {weeklyRealizedRevenue > 0 && (
                    <Badge
                      variant="outline"
                      className="text-2xs text-emerald-700 border-emerald-200 bg-emerald-50/70"
                    >
                      +{formatCurrency(weeklyRealizedRevenue)} wk
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {monthlyRealizedProfit !== 0
                    ? `${monthlyRealizedProfit > 0 ? '+' : '-'}${formatCurrency(Math.abs(monthlyRealizedProfit))} MTD profit`
                    : 'Realized sales this month'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projected Gross Margin */}
        <Card
          className="cursor-pointer border-slate-200 hover:border-indigo-400 hover:shadow-xs transition-all"
          onClick={() => navigate('/reports')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Projected Margin</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Percent className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-2xl font-bold',
                    projectedMargin >= 0 ? 'text-indigo-700' : 'text-rose-600'
                  )}
                >
                  {projectedMargin < 0 ? '-' : '+'}
                  {formatCurrency(Math.abs(projectedMargin))}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-2xs',
                    projectedMargin >= 0
                      ? 'text-indigo-700 border-indigo-200 bg-indigo-50/50'
                      : 'text-rose-700 border-rose-200 bg-rose-50/50'
                  )}
                >
                  {projectedMargin > 0 ? `+${marginPercentage}%` : `${marginPercentage}%`}
                </Badge>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Estimated profit upon complete sell-through
            </p>
          </CardContent>
        </Card>

        {/* Incoming Procurement Pipeline */}
        <Card
          className="cursor-pointer border-slate-200 hover:border-amber-400 hover:shadow-xs transition-all"
          onClick={() => navigate('/purchasing')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Incoming Inbound Value</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Truck className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(incomingCost)}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              {incomingQty.toLocaleString()} units committed in open POs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics & Graphs Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Graph 1: Financial Pipeline Spread Graph */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-900">
                Inventory Financial Spread
              </CardTitle>
              <Badge variant="outline" className="text-xs text-slate-600">
                Live Valuation Model
              </Badge>
            </div>
            <CardDescription>
              Comparison between physical acquisition costs, incoming pipeline, and retail potential.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-5">
            {loadingSummary ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-xs">Computing financial models...</span>
              </div>
            ) : (
              <>
                {/* Visual Bar 1: In-Stock Valuation */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-600 inline-block" />
                      In-Stock Inventory Cost
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatCurrency(inStockValuation)}
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(inStockValuation > 0 ? 5 : 0, inStockCostPercent)}%` }}
                    />
                  </div>
                </div>

                {/* Visual Bar 2: Potential Revenue */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" />
                      Potential Retail Revenue
                    </span>
                    <span className="font-mono font-bold text-emerald-700">
                      {formatCurrency(potentialRevenue)}
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(potentialRevenue > 0 ? 5 : 0, potentialRevenuePercent)}%` }}
                    />
                  </div>
                </div>

                {/* Visual Bar 3: Incoming Inbound Pipeline */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                      Incoming PO Commitments
                    </span>
                    <span className="font-mono font-bold text-amber-700">
                      {formatCurrency(incomingCost)}
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(incomingCost > 0 ? 5 : 0, incomingCostPercent)}%` }}
                    />
                  </div>
                </div>

                {/* Summary Flow Stats Footnote */}
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500 block">Total Active Units:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {parseFloat(summary?.total_inventory_quantity || '0').toLocaleString()} units
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Incoming Units in Transit:</span>
                    <span className="font-mono font-semibold text-amber-700">
                      {incomingQty.toLocaleString()} units
                    </span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Graph 2: Asset Distribution by Location & Category */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-slate-900">
                Asset Valuation Distribution
              </CardTitle>
              {/* Tab Switcher */}
              <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setDistributionTab('locations')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer',
                    distributionTab === 'locations'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Building2 className="h-3 w-3" />
                  <span>Warehouses</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDistributionTab('categories')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer',
                    distributionTab === 'categories'
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <Layers className="h-3 w-3" />
                  <span>Categories</span>
                </button>
              </div>
            </div>
            <CardDescription>
              {distributionTab === 'locations'
                ? 'On-hand inventory valuation partitioned across facility locations.'
                : 'Capital allocation across product categories.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {loadingSummary ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-xs">Loading breakdown...</span>
              </div>
            ) : distributionTab === 'locations' ? (
              (summary?.valuation_by_location || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No active stock stored in locations yet.
                </div>
              ) : (
                <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
                  {(summary?.valuation_by_location || []).map((loc) => {
                    const shareNum = parseFloat(loc.share_percentage) || 0
                    return (
                      <div key={loc.location_id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800">
                            {loc.location_code} — {loc.location_name}
                          </span>
                          <span className="font-mono font-medium text-slate-900">
                            {formatCurrency(loc.valuation)}{' '}
                            <span className="text-slate-400 font-sans text-2xs">({loc.share_percentage}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(2, Math.min(100, shareNum))}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {parseFloat(loc.quantity).toLocaleString()} units on hand
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              (summary?.valuation_by_category || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No categorized items in inventory yet.
                </div>
              ) : (
                <div className="space-y-3.5 max-h-64 overflow-y-auto pr-1">
                  {(summary?.valuation_by_category || []).map((cat, idx) => {
                    const shareNum = parseFloat(cat.share_percentage) || 0
                    const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500']
                    const barColor = colors[idx % colors.length]
                    return (
                      <div key={cat.category_id || `cat-${idx}`} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800">{cat.category_name}</span>
                          <span className="font-mono font-medium text-slate-900">
                            {formatCurrency(cat.valuation)}{' '}
                            <span className="text-slate-400 font-sans text-2xs">({cat.share_percentage}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all duration-500', barColor)}
                            style={{ width: `${Math.max(2, Math.min(100, shareNum))}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {parseFloat(cat.quantity).toLocaleString()} units in catalog
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>

      {/* Operational Counts Row */}
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
            {loadingSummary && loadingBalances ? (
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
            {loadingSummary && loadingBalances ? (
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
