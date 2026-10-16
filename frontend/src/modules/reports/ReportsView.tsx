import { useState } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  Boxes,
  Calendar,
  CheckCircle2,
  DollarSign,
  History,
  Layers,
  Loader2,
  Package,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { fetchStockBalances } from '@/modules/inventory/api'
import { downloadReportCsv, fetchDashboardSummary } from './api'

type ReportTab = 'valuation' | 'low_stock' | 'movements'

export function ReportsView() {
  const [activeTab, setActiveTab] = useState<ReportTab>('valuation')
  const [isExporting, setIsExporting] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

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

  // Filtered lists
  const lowStockBalances = balances.filter(
    (b) =>
      b.is_low_stock ||
      parseFloat(b.current_quantity) <= parseFloat(b.reorder_threshold || '0')
  )

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
            Audit stock valuation, inspect reorder warnings, review ledger transactions, and export CSVs.
          </p>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Active Items</CardTitle>
            <Package className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">
                {summary?.total_active_products ?? 0}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">Catalog SKU definitions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Physical Stock Units</CardTitle>
            <Boxes className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-slate-900">
                {parseFloat(summary?.total_inventory_quantity || '0').toLocaleString()}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">Across all active locations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Stock Valuation</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div className="text-2xl font-bold text-emerald-700 font-mono">
                ${parseFloat(summary?.total_inventory_valuation || '0').toFixed(2)}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">Based on baseline purchase costs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Reorder Discrepancies</CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${(summary?.low_stock_count ?? 0) > 0 ? 'text-amber-500' : 'text-slate-400'}`}
            />
          </CardHeader>
          <CardContent>
            {loadingSummary ? (
              <Loader2 className="h-6 w-6 animate-spin text-slate-400 my-1" />
            ) : (
              <div
                className={`text-2xl font-bold ${(summary?.low_stock_count ?? 0) > 0 ? 'text-amber-600' : 'text-slate-900'}`}
              >
                {(summary?.low_stock_count ?? 0) + (summary?.out_of_stock_count ?? 0)}
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              {summary?.low_stock_count ?? 0} Low • {summary?.out_of_stock_count ?? 0} Out of Stock
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('valuation')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'valuation'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>Stock Valuation & Balances</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('low_stock')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'low_stock'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>Low Stock Alerts ({lowStockBalances.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('movements')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition-colors ${
            activeTab === 'movements'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Movements Ledger Feed</span>
        </button>
      </div>

      {/* TAB 1: Stock Valuation & Balances */}
      {activeTab === 'valuation' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Inventory Valuation by Storage Location
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                On-hand physical stock multiplied by baseline purchase cost.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('balances')}
              disabled={isExporting === 'balances'}
              className="gap-2 shrink-0 text-xs"
            >
              {isExporting === 'balances' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowDownToLine className="h-3.5 w-3.5" />
              )}
              <span>Export Balances CSV</span>
            </Button>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="px-6 py-3">Product / SKU</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Location</th>
                  <th className="px-6 py-3 text-right">On Hand</th>
                  <th className="px-6 py-3 text-center">Status</th>
                  <th className="px-6 py-3 text-right">Last Movement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loadingBalances ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      Loading stock balances...
                    </td>
                  </tr>
                ) : balances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No stock balances recorded in system.
                    </td>
                  </tr>
                ) : (
                  balances.map((b) => {
                    const qty = parseFloat(b.current_quantity) || 0
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{b.product_name}</div>
                          <div className="text-xs font-mono text-slate-400">{b.product_sku}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">{b.category_name || 'Uncategorized'}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-800">{b.location_name}</div>
                          <div className="text-xs font-mono text-slate-400">{b.location_code}</div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                          {qty.toLocaleString()} {b.unit_of_measure}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {b.is_low_stock ? (
                            <Badge variant="warning" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Low Stock
                            </Badge>
                          ) : (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Optimal
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-xs text-slate-400 font-mono">
                          {new Date(b.updated_at).toLocaleDateString()}
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

      {/* TAB 2: Low Stock Warnings */}
      {activeTab === 'low_stock' && (
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Low Stock & Reorder Requirements
              </CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Items currently at or below their configured minimum threshold level.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('low_stock')}
              disabled={isExporting === 'low_stock'}
              className="gap-2 shrink-0 text-xs"
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
        <Card>
          <CardHeader className="flex flex-col gap-3 pb-4 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">
                  Stock Movement Audit Ledger
                </CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Immutable chronological audit log of inventory changes.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport('movements')}
                disabled={isExporting === 'movements'}
                className="gap-2 shrink-0 text-xs"
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
                <span>Date Range:</span>
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
                  className="h-8 text-xs text-slate-500"
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
