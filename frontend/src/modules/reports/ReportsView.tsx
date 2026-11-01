import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  History,
  Info,
  Layers,
  Loader2,
  Percent,
  Search,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn, formatCurrency } from '@/lib/utils'
import { fetchStockBalances } from '@/modules/inventory/api'
import { downloadReportCsv, fetchDashboardSummary } from './api'

type ReportTab = 'valuation' | 'low_stock' | 'movements'

export function ReportsView() {
  const [activeTab, setActiveTab] = useState<ReportTab>('valuation')
  const [isExporting, setIsExporting] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Live summary KPIs
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: fetchDashboardSummary,
    staleTime: 15000,
  })

  // Stock balances for valuation and low-stock table
  const { data: balancesData, isLoading: loadingBalances } = useQuery({
    queryKey: ['inventory', 'balances'],
    queryFn: () => fetchStockBalances({}),
    staleTime: 15000,
  })

  const balances = balancesData?.results || []

  // Metrics extraction
  const inStockValuation = parseFloat(summary?.total_inventory_valuation || '0')
  const potentialRevenue = parseFloat(summary?.potential_revenue || '0')
  const projectedMargin = parseFloat(summary?.projected_margin || '0')
  const grossMarginPercentage = summary?.gross_margin_percentage || summary?.margin_percentage || '0.0'
  const markupPercentage = summary?.markup_percentage || '0.0'
  const monthlyRealizedRevenue = parseFloat(summary?.monthly_realized_revenue || '0')
  const weeklyRealizedRevenue = parseFloat(summary?.weekly_realized_revenue || '0')
  const monthlyRealizedProfit = parseFloat(summary?.monthly_realized_profit || '0')
  const incomingCost = parseFloat(summary?.incoming_cost || '0')
  const incomingQty = parseFloat(summary?.incoming_quantity || '0')
  const totalInventoryUnits = parseFloat(summary?.total_inventory_quantity || '0')

  // Realized revenue realization percentage vs potential
  const revenueRealizedPercent =
    potentialRevenue > 0
      ? Math.min(100, Math.round((monthlyRealizedRevenue / potentialRevenue) * 100))
      : 0

  // Filtered lists
  const filteredBalances = balances.filter((b) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      b.product_name.toLowerCase().includes(q) ||
      b.product_sku.toLowerCase().includes(q) ||
      (b.category_name && b.category_name.toLowerCase().includes(q)) ||
      b.location_name.toLowerCase().includes(q) ||
      b.location_code.toLowerCase().includes(q)
    )
  })

  const lowStockBalances = balances.filter(
    (b) =>
      b.is_low_stock ||
      parseFloat(b.current_quantity) <= parseFloat(b.reorder_threshold || '0')
  )

  // Portfolio aggregates for table footer
  const tableTotals = filteredBalances.reduce(
    (acc, b) => {
      const qty = parseFloat(b.current_quantity) || 0
      const cost = parseFloat(b.purchase_cost || '0') || 0
      const price = parseFloat(b.selling_price || '0') || 0
      acc.units += qty
      acc.valuation += qty * cost
      acc.revenue += qty * price
      return acc
    },
    { units: 0, valuation: 0, revenue: 0 }
  )
  const tableMarginPct =
    tableTotals.revenue > 0
      ? (((tableTotals.revenue - tableTotals.valuation) / tableTotals.revenue) * 100).toFixed(1)
      : '0.0'

  const handleExport = async (type: 'balances' | 'low_stock' | 'movements') => {
    setIsExporting(type)
    try {
      await downloadReportCsv(
        type,
        type === 'movements' ? startDate || undefined : undefined,
        type === 'movements' ? endDate || undefined : undefined
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Reports & Analytics Center
          </h2>
          <p className="text-sm text-slate-500">
            Comprehensive financial valuation audits, revenue realization, warehouse asset distributions, and inventory ledger logs.
          </p>
        </div>
      </div>

      {/* 1. Executive Financial KPI Overview Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Total In-Stock Cost Valuation */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-slate-600">Total Stock Valuation</CardTitle>
              <span title="Formula: sum(on-hand units × purchase cost). Represents physical capital tied up in stock.">
                <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 font-bold font-mono text-sm">
              ₱
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {formatCurrency(inStockValuation)}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Physical inventory at unit purchase cost
            </p>
          </CardContent>
        </Card>

        {/* Potential Retail Revenue */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-slate-600">Potential Revenue</CardTitle>
              <span title="Formula: sum(on-hand units × catalog selling price). Estimated gross turnover upon full inventory liquidation.">
                <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-emerald-700 font-mono">
                {formatCurrency(potentialRevenue)}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Portfolio valuation at catalog retail price
            </p>
          </CardContent>
        </Card>

        {/* Projected Gross Margin */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-slate-600">Projected Margin</CardTitle>
              <span title="Gross Margin % = (Margin ÷ Potential Revenue) × 100. Cost Markup % = (Margin ÷ In-Stock Cost) × 100.">
                <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Percent className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={cn(
                      'text-2xl font-bold font-mono',
                      projectedMargin >= 0 ? 'text-indigo-700' : 'text-rose-600'
                    )}
                  >
                    {projectedMargin < 0 ? '-' : '+'}
                    {formatCurrency(Math.abs(projectedMargin))}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-2xs font-semibold',
                      projectedMargin >= 0
                        ? 'text-indigo-700 border-indigo-200 bg-indigo-50/70'
                        : 'text-rose-700 border-rose-200 bg-rose-50/70'
                    )}
                  >
                    {projectedMargin > 0 ? `+${grossMarginPercentage}%` : `${grossMarginPercentage}%`} margin
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {parseFloat(markupPercentage) > 0
                    ? `+${markupPercentage}% markup on cost`
                    : parseFloat(markupPercentage) < 0
                    ? `${markupPercentage}% markup on cost`
                    : 'Complete sell-through profit'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Realized Revenue & Gross Profit */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-slate-600">Monthly Realized Sales</CardTitle>
              <span title="Recognized actual sales from customer sale (SOLD) dispatches this month. Gross Profit = Sales Revenue − COGS.">
                <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900 font-mono">
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
                <p className="text-xs mt-1">
                  {monthlyRealizedProfit > 0 ? (
                    <span className="font-semibold text-emerald-700">
                      +{formatCurrency(monthlyRealizedProfit)} MTD profit
                    </span>
                  ) : monthlyRealizedProfit < 0 ? (
                    <span className="font-semibold text-rose-600">
                      -{formatCurrency(Math.abs(monthlyRealizedProfit))} MTD net loss
                    </span>
                  ) : (
                    <span className="text-slate-500">Realized sales recorded this month</span>
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Physical Inventory Units & Supply Pipeline */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium text-slate-600">Physical Stock Units</CardTitle>
              <span title="Total physical unit count across all warehouses plus units committed in open purchase orders.">
                <Info className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 cursor-help" />
              </span>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Boxes className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900 font-mono">
                {totalInventoryUnits.toLocaleString()}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              {incomingQty > 0
                ? `+${incomingQty.toLocaleString()} units in POs (${formatCurrency(incomingCost)})`
                : `${summary?.total_active_products ?? 0} active catalog items`}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 2. Visual Comparative Analytics & Distribution Graphs */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Graph 1: Warehouse Valuation & Asset Concentration */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Warehouse Asset Distribution
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Capital allocation and physical on-hand units partitioned across facilities
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-2xs text-blue-700 bg-blue-50/70">
                {(summary?.valuation_by_location || []).length} Facilities
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {loadingSummary ? (
              <div className="py-10 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-xs">Loading warehouse distributions...</span>
              </div>
            ) : (summary?.valuation_by_location || []).length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No active warehouse allocations found.
              </div>
            ) : (
              (summary?.valuation_by_location || []).map((loc) => {
                const shareNum = parseFloat(loc.share_percentage) || 0
                return (
                  <div key={loc.location_code} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{loc.location_name}</span>
                        <span className="font-mono text-2xs text-slate-400">({loc.location_code})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 font-mono">
                          {parseFloat(loc.quantity).toLocaleString()} units
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(loc.valuation)}
                        </span>
                        <Badge
                          variant="outline"
                          className="font-mono text-2xs bg-blue-50/60 text-blue-700 border-blue-200"
                        >
                          {loc.share_percentage}%
                        </Badge>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500"
                        style={{ width: `${Math.max(2, Math.min(100, shareNum))}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Graph 2: Category Profitability & Spread */}
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-slate-900">
                    Category Valuation & Portfolio Share
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Inventory valuation and stock density by catalog domain category
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-2xs text-emerald-700 bg-emerald-50/70">
                {(summary?.valuation_by_category || []).length} Categories
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {loadingSummary ? (
              <div className="py-10 flex flex-col items-center justify-center text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-xs">Loading category distributions...</span>
              </div>
            ) : (summary?.valuation_by_category || []).length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No inventory category balances found.
              </div>
            ) : (
              (summary?.valuation_by_category || []).map((cat) => {
                const shareNum = parseFloat(cat.share_percentage) || 0
                return (
                  <div key={cat.category_id || cat.category_name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{cat.category_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 font-mono">
                          {parseFloat(cat.quantity).toLocaleString()} units
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatCurrency(cat.valuation)}
                        </span>
                        <Badge
                          variant="outline"
                          className="font-mono text-2xs bg-emerald-50/60 text-emerald-700 border-emerald-200"
                        >
                          {cat.share_percentage}%
                        </Badge>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-500"
                        style={{ width: `${Math.max(2, Math.min(100, shareNum))}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}

            {/* MTD Sales Realization Progress Meter */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-slate-700 flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-emerald-600" />
                  Monthly Realized Turnover vs Portfolio Potential
                </span>
                <span className="font-mono text-xs font-bold text-emerald-700">
                  {formatCurrency(monthlyRealizedRevenue)} / {formatCurrency(potentialRevenue)} ({revenueRealizedPercent}%)
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${Math.max(1, revenueRealizedPercent)}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. Tabs Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('valuation')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'valuation'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Stock Valuation & Unit Profitability ({filteredBalances.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('low_stock')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'low_stock'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>Low Stock & Reorder Warnings ({lowStockBalances.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === 'movements'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Movements Ledger Feed</span>
        </button>
      </div>

      {/* TAB 1: Stock Valuation & Unit Profitability Detailed Precision Ledger */}
      {activeTab === 'valuation' && (
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-col gap-3 pb-4 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Comprehensive Inventory Valuation & Unit Profitability
              </CardTitle>
              <CardDescription className="text-xs">
                Audited stock positions multiplied by baseline purchase cost and catalog selling price.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-48 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Filter product, SKU, location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('balances')}
                disabled={isExporting === 'balances'}
                className="gap-2 shrink-0 text-xs cursor-pointer"
              >
                {isExporting === 'balances' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                )}
                <span>Export Balances CSV</span>
              </Button>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-5 py-3">Product / SKU</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-right">On Hand</th>
                  <th className="px-4 py-3 text-right">Unit Cost</th>
                  <th className="px-4 py-3 text-right">Selling Price</th>
                  <th className="px-5 py-3 text-right">Valuation (Cost)</th>
                  <th className="px-5 py-3 text-right">Potential Revenue</th>
                  <th className="px-4 py-3 text-right">Unit Margin</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loadingBalances ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        <span>Loading audited stock balances...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      {searchQuery
                        ? 'No inventory items match the search query.'
                        : 'No stock balances recorded in system.'}
                    </td>
                  </tr>
                ) : (
                  filteredBalances.map((b) => {
                    const qty = parseFloat(b.current_quantity) || 0
                    const unitCost = parseFloat(b.purchase_cost || '0') || 0
                    const unitPrice = parseFloat(b.selling_price || '0') || 0
                    const rowValuation = qty * unitCost
                    const rowRevenue = qty * unitPrice
                    const unitMarginPct =
                      unitPrice > 0
                        ? (((unitPrice - unitCost) / unitPrice) * 100).toFixed(1)
                        : '0.0'
                    const isPositiveMargin = unitPrice >= unitCost

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-900">{b.product_name}</div>
                          <div className="text-xs font-mono text-slate-400">{b.product_sku}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant="outline" className="text-2xs font-normal">
                            {b.category_name || 'Uncategorized'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-slate-800 text-xs">{b.location_name}</div>
                          <div className="text-2xs font-mono text-slate-400">{b.location_code}</div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                          {qty.toLocaleString()} {b.unit_of_measure}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-700">
                          {formatCurrency(unitCost)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-slate-900 font-medium">
                          {formatCurrency(unitPrice)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-blue-700">
                          {formatCurrency(rowValuation)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-700">
                          {formatCurrency(rowRevenue)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-xs">
                          <span
                            className={cn(
                              'font-semibold',
                              isPositiveMargin ? 'text-emerald-700' : 'text-rose-600'
                            )}
                          >
                            {isPositiveMargin ? `+${unitMarginPct}%` : `${unitMarginPct}%`}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {b.is_low_stock ? (
                            <Badge variant="warning" className="gap-1 text-2xs">
                              <AlertTriangle className="h-3 w-3" />
                              Low Stock
                            </Badge>
                          ) : (
                            <Badge variant="success" className="gap-1 text-2xs">
                              <CheckCircle2 className="h-3 w-3" />
                              Optimal
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {/* Aggregated Totals Footer Row */}
              {filteredBalances.length > 0 && (
                <tfoot className="border-t-2 border-slate-300 bg-slate-50/80 font-semibold text-slate-900">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 text-xs uppercase tracking-wider text-slate-600">
                      Portfolio Totals ({filteredBalances.length} items)
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      {tableTotals.units.toLocaleString()} units
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-right text-xs text-slate-500">
                      Combined Valuation:
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-blue-800">
                      {formatCurrency(tableTotals.valuation)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-emerald-800">
                      {formatCurrency(tableTotals.revenue)}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right font-mono font-bold text-xs',
                        parseFloat(tableMarginPct) >= 0 ? 'text-indigo-700' : 'text-rose-600'
                      )}
                    >
                      {parseFloat(tableMarginPct) > 0 ? `+${tableMarginPct}%` : `${tableMarginPct}%`}
                    </td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* TAB 2: Low Stock Warnings */}
      {activeTab === 'low_stock' && (
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Low Stock & Reorder Requirements
              </CardTitle>
              <CardDescription className="text-xs">
                Items currently at or below their configured minimum threshold level.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('low_stock')}
              disabled={isExporting === 'low_stock'}
              className="gap-2 shrink-0 text-xs cursor-pointer"
            >
              {isExporting === 'low_stock' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-3.5 w-3.5" />
              )}
              <span>Export Low Stock CSV</span>
            </Button>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-3">Product / SKU</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3 text-right">Current On Hand</th>
                  <th className="px-6 py-3 text-right">Reorder Threshold</th>
                  <th className="px-6 py-3 text-center">Urgency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lowStockBalances.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mx-auto mb-2">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">All Stock Levels Optimal</p>
                      <p className="text-xs text-slate-500 mt-1">
                        No products are currently at or below minimum reorder thresholds.
                      </p>
                    </td>
                  </tr>
                ) : (
                  lowStockBalances.map((b) => {
                    const qty = parseFloat(b.current_quantity) || 0
                    const threshold = parseFloat(b.reorder_threshold || '0') || 0
                    const isOut = qty <= 0
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{b.product_name}</div>
                          <div className="text-xs font-mono text-slate-400">{b.product_sku}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">{b.location_code}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-rose-600">
                          {qty.toLocaleString()} {b.unit_of_measure}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-slate-600">
                          {threshold.toLocaleString()} {b.unit_of_measure}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {isOut ? (
                            <Badge variant="destructive">OUT OF STOCK</Badge>
                          ) : (
                            <Badge variant="warning">REORDER REQUIRED</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 3: Stock Movements Audit Trail */}
      {activeTab === 'movements' && (
        <Card className="border-slate-200 shadow-2xs">
          <CardHeader className="flex flex-col gap-3 pb-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Stock Movement Audit Ledger
                </CardTitle>
                <CardDescription className="text-xs">
                  Immutable chronological audit log of inventory changes.
                </CardDescription>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('movements')}
                disabled={isExporting === 'movements'}
                className="gap-2 shrink-0 text-xs cursor-pointer"
              >
                {isExporting === 'movements' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                )}
                <span>Export Ledger CSV</span>
              </Button>
            </div>

            {/* Date Filtering Controls */}
            <div className="flex flex-wrap items-center gap-3 pt-2 bg-slate-50/60 p-3 rounded-lg border border-slate-100">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                <span>Export Filter (CSV):</span>
              </div>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 text-xs w-36"
                aria-label="Start Date"
              />
              <span className="text-xs text-slate-400">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 text-xs w-36"
                aria-label="End Date"
              />
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStartDate('')
                    setEndDate('')
                  }}
                  className="h-8 text-xs text-slate-500 cursor-pointer"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-3">Reference / Type</th>
                  <th className="px-6 py-3">Product</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3 text-right">Delta Quantity</th>
                  <th className="px-6 py-3">Actor</th>
                  <th className="px-6 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(summary?.recent_movements || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No stock movements recorded in the selected period.
                    </td>
                  </tr>
                ) : (
                  (summary?.recent_movements || []).map((m) => {
                    const delta = parseFloat(m.quantity) || 0
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{m.movement_reference}</div>
                          <Badge variant="outline" className="text-2xs font-mono mt-0.5">
                            {m.movement_type_display || m.movement_type}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{m.product_name}</div>
                          <div className="text-xs font-mono text-slate-400">{m.product_sku}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">{m.location_code || m.location_name}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold">
                          <span className={delta > 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600">
                          {m.actor_username || 'System'}
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400">
                          {new Date(m.created_at).toLocaleString()}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
