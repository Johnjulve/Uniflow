import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Boxes, History, Search, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/modules/auth/useAuth'
import {
  fetchLocations,
  fetchStockBalances,
  fetchStockMovements,
  recordStockAdjustment,
} from './api'
import { fetchProducts } from '@/modules/catalog/api'
import { AdjustmentModal } from './AdjustmentModal'
import type { StockBalance, StockMovement } from './types'

export function InventoryView() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'balances' | 'movements'>('balances')
  const [search, setSearch] = useState('')
  const [selectedLocation, setSelectedLocation] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [selectedBalance, setSelectedBalance] = useState<StockBalance | null>(null)
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false)

  const canManage = user?.can_manage_stock || user?.role === 'ADMIN' || user?.role === 'MANAGER'

  // Fetch locations
  const { data: locations = [] } = useQuery({
    queryKey: ['inventory', 'locations'],
    queryFn: fetchLocations,
  })

  // Fetch active products from catalog for opening balances
  const { data: catalogData } = useQuery({
    queryKey: ['catalog', 'products', { includeArchived: false }],
    queryFn: () => fetchProducts({ includeArchived: false }),
  })

  const availableProducts = (catalogData?.results || []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    unit_of_measure: p.unit_of_measure,
  }))

  // Fetch stock balances
  const { data: balancesData, isLoading: isBalancesLoading } = useQuery({
    queryKey: ['inventory', 'balances', { search, location: selectedLocation, lowStock: lowStockOnly }],
    queryFn: () =>
      fetchStockBalances({
        search: search.trim() || undefined,
        location: selectedLocation || undefined,
        lowStock: lowStockOnly,
      }),
  })

  // Fetch stock movements
  const { data: movementsData, isLoading: isMovementsLoading } = useQuery({
    queryKey: ['inventory', 'movements', { location: selectedLocation }],
    queryFn: () =>
      fetchStockMovements({
        location: selectedLocation || undefined,
      }),
    enabled: activeTab === 'movements',
  })

  // Adjustment mutation
  const adjustMutation = useMutation({
    mutationFn: recordStockAdjustment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'balances'] })
      queryClient.invalidateQueries({ queryKey: ['inventory', 'movements'] })
      queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })

  const balances = balancesData?.results || []
  const movements = movementsData?.results || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Inventory Operations</h2>
          <p className="text-sm text-slate-500">
            Real-time multi-location on-hand inventory levels and immutable transaction ledger.
          </p>
        </div>

        {/* Actions & Tab Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          {canManage && (
            <Button
              onClick={() => {
                setSelectedBalance(null)
                setIsAdjustModalOpen(true)
              }}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs"
              size="sm"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>+ Record Opening / Adjust Stock</span>
            </Button>
          )}

          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-2xs">
            <button
              onClick={() => setActiveTab('balances')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'balances'
                  ? 'bg-blue-50 text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="h-4 w-4" />
              <span>On-Hand Balances</span>
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'movements'
                  ? 'bg-blue-50 text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="h-4 w-4" />
              <span>Movement Ledger</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search products by SKU or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <select
                aria-label="Filter by Location"
                className="flex h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} - {loc.name}
                  </option>
                ))}
              </select>

              {activeTab === 'balances' && (
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={lowStockOnly}
                    onChange={(e) => setLowStockOnly(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Low Stock Only</span>
                </label>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Balances Tab Content */}
      {activeTab === 'balances' && (
        <Card>
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-base font-semibold">
              Current Stock Projections{' '}
              <span className="text-xs font-normal text-slate-500">({balances.length} records)</span>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {isBalancesLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
                <p className="text-sm">Calculating stock balances...</p>
              </div>
            ) : balances.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <Boxes className="h-6 w-6" />
                </div>
                <p className="text-base font-semibold text-slate-800">No stock balances found</p>
                <p className="text-sm text-slate-500 max-w-sm mt-1">
                  Balances will appear here once initial stock movements or purchase orders are received.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50/75 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5 font-semibold">Product SKU</th>
                      <th className="px-6 py-3.5 font-semibold">Product Name</th>
                      <th className="px-6 py-3.5 font-semibold">Location</th>
                      <th className="px-6 py-3.5 font-semibold text-right">On-Hand Balance</th>
                      <th className="px-6 py-3.5 font-semibold text-right">Reorder Point</th>
                      <th className="px-6 py-3.5 font-semibold text-center">Status</th>
                      {canManage && <th className="px-6 py-3.5 font-semibold text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {balances.map((b: StockBalance) => (
                      <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium text-slate-900">{b.product_sku}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{b.product_name}</span>
                            {b.product_is_active === false && (
                              <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-2xs py-0 px-1.5">
                                Archived
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-slate-400">{b.category_name || 'General'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline">{b.location_code}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-900">
                          {b.current_quantity}{' '}
                          <span className="text-xs font-normal text-slate-500">{b.unit_of_measure}</span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-slate-500">
                          {b.reorder_threshold}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {b.is_low_stock ? (
                            <Badge variant="warning" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              <span>Low Stock</span>
                            </Badge>
                          ) : (
                            <Badge variant="success">Optimal</Badge>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-6 py-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              onClick={() => {
                                setSelectedBalance(b)
                                setIsAdjustModalOpen(true)
                              }}
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                              <span>Adjust</span>
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Movements Ledger Tab Content */}
      {activeTab === 'movements' && (
        <Card>
          <CardHeader className="border-b border-slate-100 pb-3">
            <CardTitle className="text-base font-semibold">
              Immutable Movement Ledger{' '}
              <span className="text-xs font-normal text-slate-500">({movements.length} transactions)</span>
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {isMovementsLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
                <p className="text-sm">Retrieving transaction ledger...</p>
              </div>
            ) : movements.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                  <History className="h-6 w-6" />
                </div>
                <p className="text-base font-semibold text-slate-800">No ledger movements recorded</p>
                <p className="text-sm text-slate-500 max-w-sm mt-1">
                  All adjustments, receipts, and inventory issues will create permanent audit entries here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50/75 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5 font-semibold">Reference</th>
                      <th className="px-6 py-3.5 font-semibold">Timestamp</th>
                      <th className="px-6 py-3.5 font-semibold">Product</th>
                      <th className="px-6 py-3.5 font-semibold">Location</th>
                      <th className="px-6 py-3.5 font-semibold">Movement Type</th>
                      <th className="px-6 py-3.5 font-semibold text-right">Quantity Delta</th>
                      <th className="px-6 py-3.5 font-semibold">Actor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movements.map((m: StockMovement) => {
                      const qty = parseFloat(m.quantity) || 0
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-mono font-medium text-slate-900">
                            {m.movement_reference}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                            {new Date(m.effective_at).toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{m.product_name}</div>
                            <div className="text-xs font-mono text-slate-400">{m.product_sku}</div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="outline">{m.location_code}</Badge>
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant={
                                m.movement_type.includes('POSITIVE') || m.movement_type === 'RECEIPT'
                                  ? 'success'
                                  : m.movement_type.includes('NEGATIVE') || m.movement_type === 'ISSUE'
                                    ? 'warning'
                                    : 'secondary'
                              }
                            >
                              {m.movement_type_display}
                            </Badge>
                          </td>
                          <td
                            className={`px-6 py-4 text-right font-mono font-bold ${
                              qty > 0 ? 'text-emerald-600' : 'text-rose-600'
                            }`}
                          >
                            {qty > 0 ? `+${m.quantity}` : m.quantity}
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-700">{m.actor_name}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cycle Count / Opening Stock Adjustment Modal */}
      {isAdjustModalOpen && (
        <AdjustmentModal
          key={selectedBalance ? selectedBalance.id : `new-${isAdjustModalOpen}`}
          isOpen={isAdjustModalOpen}
          onClose={() => {
            setIsAdjustModalOpen(false)
            setSelectedBalance(null)
          }}
          onSave={async (payload) => {
            await adjustMutation.mutateAsync(payload)
          }}
          selectedBalance={selectedBalance}
          locations={locations}
          availableProducts={availableProducts}
          existingBalances={balances}
        />
      )}
    </div>
  )
}
