import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { Category, Product } from './types'
import { AlertCircle, X } from 'lucide-react'

interface ProductModalProps {
  isOpen: boolean
  onClose: () => void
  product?: Product | null
  onSave: (payload: {
    sku: string
    name: string
    barcode?: string
    description?: string
    category: string
    unit_of_measure: string
    purchase_cost: string
    selling_price: string
    reorder_threshold: string
  }) => Promise<void>
  categories: Category[]
}

export function ProductModal({
  isOpen,
  onClose,
  product,
  onSave,
  categories,
}: ProductModalProps) {
  const isEdit = Boolean(product)

  const [sku, setSku] = useState(product?.sku || '')
  const [name, setName] = useState(product?.name || '')
  const [barcode, setBarcode] = useState(product?.barcode || '')
  const [description, setDescription] = useState(product?.description || '')
  const [categoryId, setCategoryId] = useState(product?.category || categories[0]?.id || '')
  const [unitOfMeasure, setUnitOfMeasure] = useState(product?.unit_of_measure || 'unit')
  const [purchaseCost, setPurchaseCost] = useState(
    product ? parseFloat(product.purchase_cost || '0').toFixed(2) : '0.00'
  )
  const [sellingPrice, setSellingPrice] = useState(
    product ? parseFloat(product.selling_price || '0').toFixed(2) : '0.00'
  )
  const [reorderThreshold, setReorderThreshold] = useState(
    product ? parseFloat(product.reorder_threshold || '0').toString() : '0'
  )
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!sku.trim() || !name.trim() || !categoryId) {
      setError('Please provide SKU, Product Name, and Category.')
      return
    }

    setIsSubmitting(true)
    try {
      await onSave({
        sku: sku.trim(),
        name: name.trim(),
        barcode: barcode.trim() || undefined,
        description: description.trim() || undefined,
        category: categoryId,
        unit_of_measure: unitOfMeasure.trim() || 'unit',
        purchase_cost: purchaseCost,
        selling_price: sellingPrice,
        reorder_threshold: reorderThreshold,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <Card className="w-full max-w-lg bg-white shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4">
          <CardTitle className="text-lg">
            {isEdit ? 'Edit Product' : 'Add New Product'}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4 max-h-[75vh] overflow-y-auto">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="prod-sku">
                  SKU *
                </label>
                <Input
                  id="prod-sku"
                  placeholder="e.g. SKU-TOOL-01"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="prod-barcode">
                  Barcode (Optional)
                </label>
                <Input
                  id="prod-barcode"
                  placeholder="e.g. 123456789012"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="prod-name">
                Product Name *
              </label>
              <Input
                id="prod-name"
                placeholder="e.g. Cordless Impact Driver 18V"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="prod-cat">
                  Category *
                </label>
                <select
                  id="prod-cat"
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="prod-uom">
                  Unit of Measure
                </label>
                <Input
                  id="prod-uom"
                  placeholder="e.g. unit, box, kg"
                  value={unitOfMeasure}
                  onChange={(e) => setUnitOfMeasure(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="prod-cost">
                  Cost Price
                </label>
                <Input
                  id="prod-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="prod-price">
                  Selling Price
                </label>
                <Input
                  id="prod-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700" htmlFor="prod-threshold">
                  Reorder Alert
                </label>
                <Input
                  id="prod-threshold"
                  type="number"
                  step="1"
                  min="0"
                  value={reorderThreshold}
                  onChange={(e) => setReorderThreshold(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700" htmlFor="prod-desc">
                Description
              </label>
              <textarea
                id="prod-desc"
                rows={2}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                placeholder="Product specifications or notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEdit ? 'Update Product' : 'Create Product'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
