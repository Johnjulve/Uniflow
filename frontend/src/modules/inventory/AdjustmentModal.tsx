import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { Location, StockAdjustmentPayload, StockBalance } from './types'
import { AlertCircle, X, Scale } from 'lucide-react'

interface AdjustmentModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (payload: StockAdjustmentPayload) => Promise<void>
  selectedBalance: StockBalance | null
  locations: Location[]
}

export function AdjustmentModal({
  isOpen,
  onClose,
  onSave,
  selectedBalance,
  locations,
}: AdjustmentModalProps) {
  const [countedQty, setCountedQty] = useState(selectedBalance?.current_quantity || '0.00')
  const [reason, setReason] = useState('')
  const [locationId, setLocationId] = useState(selectedBalance?.location || locations[0]?.id || '')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen || !selectedBalance) return null

  const currentVal = parseFloat(selectedBalance.current_quantity) || 0
  const countedVal = parseFloat(countedQty) || 0
  const delta = countedVal - currentVal

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (delta === 0) {
      setError('Counted quantity equals current balance. No adjustment required.')
      return
    }

    if (!reason.trim()) {
      setError('Please provide a justification reason for this stock adjustment.')
      return
    }

    setIsSubmitting(true)
    try {
      await onSave({
        product: selectedBalance.product,
        location: locationId,
        counted_quantity: countedQty,
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
              <CardTitle className="text-lg">Adjust Stock Level</CardTitle>
              <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedBalance.product_sku}</p>
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
                <Input
                  id="adj-qty"
                  type="number"
                  step="0.01"
                  min="0"
                  value={countedQty}
                  onChange={(e) => setCountedQty(e.target.value)}
                  required
                />
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
              <label className="text-xs font-semibold text-slate-700" htmlFor="adj-reason">
                Justification Reason *
              </label>
              <Input
                id="adj-reason"
                placeholder="e.g. Cycle count audit discrepancy, damaged units removed"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || delta === 0}>
              {isSubmitting ? 'Posting Ledger...' : 'Commit Adjustment'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
