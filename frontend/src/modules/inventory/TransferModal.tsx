import React, { useState } from 'react'
import { AlertCircle, ArrowRightLeft, Minus, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Location, StockBalance, StockTransferPayload } from './types'

interface TransferModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (payload: StockTransferPayload) => Promise<void>
  locations: Location[]
  availableProducts?: Array<{
    id: string
    sku: string
    name: string
    unit_of_measure: string
  }>
  existingBalances?: StockBalance[]
  defaultProduct?: { id: string; sku: string; name: string; unit_of_measure: string } | null
  defaultSourceLocationId?: string
}

export function TransferModal({
  isOpen,
  onClose,
  onSave,
  locations,
  availableProducts = [],
  existingBalances = [],
  defaultProduct = null,
  defaultSourceLocationId = '',
}: TransferModalProps) {
  const [selectedProductId, setSelectedProductId] = useState(
    defaultProduct?.id || availableProducts[0]?.id || ''
  )
  const [sourceLocId, setSourceLocId] = useState(
    defaultSourceLocationId || locations[0]?.id || ''
  )
  const [destLocId, setDestLocId] = useState(
    locations.find((l) => l.id !== (defaultSourceLocationId || locations[0]?.id))?.id || ''
  )
  const [quantity, setQuantity] = useState('1.00')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const activeProduct = defaultProduct || availableProducts.find((p) => p.id === selectedProductId) || availableProducts[0]
  const sourceBalance = existingBalances.find(
    (b) => b.product === (activeProduct?.id || selectedProductId) && b.location === sourceLocId
  )
  const knownSourceQty = sourceBalance ? parseFloat(sourceBalance.current_quantity) || 0 : null
  const unitName = activeProduct?.unit_of_measure || 'units'
  const transferQtyVal = parseFloat(quantity) || 0

  const handleDecrement = () => {
    const curr = parseFloat(quantity) || 1
    const next = curr > 1 ? curr - 1 : Math.max(0.01, curr - 0.1)
    setQuantity(next.toFixed(2))
  }

  const handleIncrement = () => {
    const curr = parseFloat(quantity) || 0
    const next = knownSourceQty !== null ? Math.min(knownSourceQty, curr + 1) : curr + 1
    setQuantity(next.toFixed(2))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedProductId) {
      setError('Please select an active product from the catalog.')
      return
    }

    if (!sourceLocId || !destLocId) {
      setError('Please select both a source and destination location.')
      return
    }

    if (sourceLocId === destLocId) {
      setError('Source location and destination location must be different.')
      return
    }

    if (transferQtyVal <= 0) {
      setError('Transfer quantity must be greater than zero.')
      return
    }

    if (knownSourceQty !== null && transferQtyVal > knownSourceQty) {
      setError(
        `Insufficient stock at source location. Available: ${knownSourceQty.toFixed(2)} ${unitName}, requested: ${transferQtyVal.toFixed(2)} ${unitName}.`
      )
      return
    }

    setIsSubmitting(true)
    try {
      await onSave({
        product: selectedProductId,
        source_location: sourceLocId,
        destination_location: destLocId,
        quantity,
        reason: reason.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute stock transfer')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <Card className="w-full max-w-lg bg-white shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-lg">Inter-Warehouse Transfer</CardTitle>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Move stock between locations with zero net valuation impact
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

            {/* Product selection */}
            {defaultProduct ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Product:</span>
                  <span className="font-semibold text-slate-800">{defaultProduct.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">SKU / Unit:</span>
                  <span className="font-mono text-slate-700">
                    {defaultProduct.sku} ({defaultProduct.unit_of_measure})
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="transfer-product">
                  Catalog Product *
                </label>
                <select
                  id="transfer-product"
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  required
                >
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name} ({p.unit_of_measure})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Source and Destination Locations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="source-loc">
                  Source Warehouse (From) *
                </label>
                <select
                  id="source-loc"
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  value={sourceLocId}
                  onChange={(e) => {
                    const newSource = e.target.value
                    setSourceLocId(newSource)
                    if (newSource === destLocId) {
                      setDestLocId('')
                    }
                  }}
                  required
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} - {loc.name}
                    </option>
                  ))}
                </select>
                <div className="text-[11px] text-slate-500 mt-1">
                  On-hand:{' '}
                  {knownSourceQty !== null ? (
                    <span className={`font-mono font-semibold ${knownSourceQty > 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                      {knownSourceQty.toFixed(2)} {unitName}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">
                      Not loaded in active view (verified on transfer)
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="dest-loc">
                  Destination Warehouse (To) *
                </label>
                <select
                  id="dest-loc"
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  value={destLocId}
                  onChange={(e) => setDestLocId(e.target.value)}
                  required
                >
                  <option value="">Select destination...</option>
                  {locations
                    .filter((loc) => loc.id !== sourceLocId)
                    .map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.code} - {loc.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Quantity Stepper & Cost Neutrality Badge */}
            <div className="grid grid-cols-2 gap-3 items-center">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="transfer-qty">
                  Transfer Quantity *
                </label>
                <div className="flex items-center rounded-lg border border-slate-300 bg-white overflow-hidden focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20">
                  <button
                    type="button"
                    aria-label="Decrease quantity"
                    onClick={handleDecrement}
                    disabled={transferQtyVal <= 0.01 || isSubmitting}
                    className="flex h-10 w-9 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    id="transfer-qty"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={knownSourceQty !== null && knownSourceQty > 0 ? knownSourceQty : undefined}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="h-10 w-full min-w-0 border-x border-slate-200 text-center font-mono font-semibold text-sm text-slate-800 focus:outline-hidden [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    required
                  />
                  <button
                    type="button"
                    aria-label="Increase quantity"
                    onClick={handleIncrement}
                    disabled={(knownSourceQty !== null && transferQtyVal >= knownSourceQty) || isSubmitting}
                    className="flex h-10 w-9 items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-center">
                <div className="text-xs text-emerald-800 font-medium">Valuation Impact</div>
                <div className="text-lg font-bold font-mono text-emerald-700">₱0.00</div>
                <div className="text-[10px] text-emerald-600">Cost Neutral Transfer</div>
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="transfer-reason">
                Transfer Reason / Waybill Note
              </label>
              <Input
                id="transfer-reason"
                placeholder="e.g. Stock replenishment, inter-branch balance rebalancing"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                transferQtyVal <= 0 ||
                (knownSourceQty !== null && transferQtyVal > knownSourceQty) ||
                sourceLocId === destLocId ||
                !destLocId
              }
            >
              {isSubmitting ? 'Transferring...' : 'Execute Transfer'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
