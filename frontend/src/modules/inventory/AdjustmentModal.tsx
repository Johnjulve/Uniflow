import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdjustmentCategory, Location, StockAdjustmentPayload, StockBalance } from './types'
import { AlertCircle, X, Scale, Minus, Plus } from 'lucide-react'

const ADJUSTMENT_CATEGORIES: Array<{
  value: AdjustmentCategory
  label: string
  description: string
}> = [
  { value: 'SOLD', label: 'Sold / Customer Sale', description: 'Recognized as realized sales revenue' },
  { value: 'AUDIT', label: 'Cycle Count Audit Discrepancy', description: 'Variance from physical cycle count' },
  { value: 'DAMAGED', label: 'Damaged / Broken Units', description: 'Stock written off due to damage' },
  { value: 'INTERNAL_USE', label: 'Internal Operational Use', description: 'Used internally for company operations' },
  { value: 'EXPIRED', label: 'Expired / Shelf Life Spoilage', description: 'Removed due to expiration date' },
  { value: 'OPENING', label: 'Initial Opening Inventory Balance', description: 'Setting initial stock count' },
  { value: 'OTHER', label: 'Other Reason', description: 'Requires custom justification note' },
]

interface AdjustmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (payload: StockAdjustmentPayload) => Promise<void>
  selectedBalance: StockBalance | null
  locations: Location[]
  availableProducts?: Array<{
    id: string
    sku: string
    name: string
    unit_of_measure: string
  }>
  existingBalances?: StockBalance[]
}

export function AdjustmentModal({
  isOpen,
  onClose,
  onSave,
  selectedBalance,
  locations,
  availableProducts = [],
  existingBalances = [],
}: AdjustmentModalProps) {
  const [selectedProductId, setSelectedProductId] = useState(
    selectedBalance?.product || availableProducts[0]?.id || ''
  )
  const [locationId, setLocationId] = useState(selectedBalance?.location || locations[0]?.id || '')

  // Find active product and balance
  const activeProduct = selectedBalance
    ? {
        id: selectedBalance.product,
        sku: selectedBalance.product_sku,
        name: selectedBalance.product_name,
        unit_of_measure: selectedBalance.unit_of_measure,
      }
    : availableProducts.find((p) => p.id === selectedProductId) || availableProducts[0]

  const matchedBalance = selectedBalance
    ? selectedBalance
    : existingBalances.find(
        (b) => b.product === selectedProductId && b.location === locationId
      )

  const currentVal = matchedBalance ? parseFloat(matchedBalance.current_quantity) || 0 : 0
  const currentUnit = activeProduct?.unit_of_measure || 'units'

  const [countedQty, setCountedQty] = useState(
    selectedBalance?.current_quantity || (matchedBalance ? matchedBalance.current_quantity : '0.00')
  )
  const [reasonCategory, setReasonCategory] = useState<AdjustmentCategory>(
    currentVal === 0 ? 'OPENING' : 'AUDIT'
  )
  const [reason, setReason] = useState(
    currentVal === 0 ? 'Initial opening inventory balance' : ''
  )
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const countedVal = parseFloat(countedQty) || 0
  const delta = countedVal - currentVal

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const targetProductId = selectedBalance ? selectedBalance.product : selectedProductId
    if (!targetProductId) {
      setError('Please select a product from the catalog.')
      return
    }

    if (delta === 0) {
      setError('Counted quantity equals current balance. No adjustment required.')
      return
    }

    if (reasonCategory === 'SOLD' && delta > 0) {
      setError("Adjustment reason 'Sold' cannot increase stock balance. Counted quantity must be less than current on-hand balance.")
      return
    }

    if (reasonCategory === 'OTHER' && !reason.trim()) {
      setError("Please provide a custom justification reason when category is 'Other'.")
      return
    }

    setIsSubmitting(true)
    try {
      await onSave({
        product: targetProductId,
        location: locationId,
        counted_quantity: countedQty,
        reason_category: reasonCategory,
        reason: reason.trim(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record adjustment')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <Card className="w-full max-w-lg bg-white shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Scale className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {selectedBalance ? 'Adjust Stock Level' : 'Record Stock / Opening Count'}
              </CardTitle>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {selectedBalance
                  ? selectedBalance.product_sku
                  : 'Select an active catalog item to stock in warehouse'}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {selectedBalance ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Product:</span>
                  <span className="font-semibold text-slate-800">{selectedBalance.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Balance:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedBalance.current_quantity} {selectedBalance.unit_of_measure}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700" htmlFor="adj-product">
                    Catalog Product *
                  </label>
                  <select
                    id="adj-product"
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    value={selectedProductId}
                    onChange={(e) => {
                      const newProdId = e.target.value
                      setSelectedProductId(newProdId)
                      const existing = existingBalances.find(
                        (b) => b.product === newProdId && b.location === locationId
                      )
                      const newCurrent = existing ? parseFloat(existing.current_quantity) || 0 : 0
                      if (newCurrent === 0) {
                        setReason('Initial opening inventory balance')
                      }
                    }}
                    required
                  >
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name} ({p.unit_of_measure})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current On-Hand in Selected Location:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {currentVal.toFixed(2)} {currentUnit}
                      {currentVal === 0 && (
                        <span className="ml-2 font-normal text-amber-600">(New Opening Count)</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="adj-loc">
                Warehouse Location
              </label>
              <select
                id="adj-loc"
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                required
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} - {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="adj-qty">
                  Physical Count Quantity *
                </label>
                <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={() => {
                      const curr = parseFloat(countedQty) || 0
                      const next = Math.max(0, curr - 1)
                      setCountedQty(next.toFixed(2))
                    }}
                    disabled={(parseFloat(countedQty) || 0) <= 0 || isSubmitting}
                    className="flex h-10 w-9 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    id="adj-qty"
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={isSubmitting}
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                    className="h-10 w-full min-w-0 border-x border-slate-200 text-center font-mono font-semibold text-sm text-slate-800 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    required
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={() => {
                      const curr = parseFloat(countedQty) || 0
                      const next = curr + 1
                      setCountedQty(next.toFixed(2))
                    }}
                    disabled={isSubmitting}
                    className="flex h-10 w-9 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 bg-white text-center">
                <div className="text-xs text-slate-500">Adjustment Delta</div>
                <div
                  className={`text-lg font-bold font-mono ${
                    delta > 0
                      ? 'text-emerald-600'
                      : delta < 0
                        ? 'text-rose-600'
                        : 'text-slate-400'
                  }`}
                >
                  {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="adj-category">
                Adjustment Reason Category *
              </label>
              <select
                id="adj-category"
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                value={reasonCategory}
                onChange={(e) => setReasonCategory(e.target.value as AdjustmentCategory)}
                required
              >
                {ADJUSTMENT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Contextual Guidance Banner for Customer Sale adjustments */}
            {reasonCategory === 'SOLD' && (
              <div
                className={`rounded-lg p-2.5 text-xs flex items-center gap-2 border ${
                  delta < 0
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50/70 border-rose-200 text-rose-800'
                }`}
              >
                {delta < 0 ? (
                  <span>
                    📈 <strong>Sales Recognition:</strong> Outgoing {Math.abs(delta).toFixed(2)} {currentUnit} will be recorded as a customer sales issue and added to Monthly Realized Revenue.
                  </span>
                ) : (
                  <span>
                    ⚠️ <strong>Invalid Delta:</strong> Sales adjustments must decrease inventory. Count must be lower than {currentVal.toFixed(2)} {currentUnit}.
                  </span>
                )}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="adj-reason">
                {reasonCategory === 'OTHER' ? 'Justification Reason *' : 'Justification Reason (Optional)'}
              </label>
              <Input
                id="adj-reason"
                disabled={isSubmitting}
                placeholder={
                  reasonCategory === 'OTHER'
                    ? 'Please specify the exact operational justification for this adjustment...'
                    : 'e.g. Audit variance, retail cash transaction, damaged batch note...'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required={reasonCategory === 'OTHER'}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || delta === 0 || (reasonCategory === 'SOLD' && delta > 0)}
            >
              {isSubmitting ? 'Posting Ledger...' : 'Commit Adjustment'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
