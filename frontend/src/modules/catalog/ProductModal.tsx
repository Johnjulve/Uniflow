import React, { useState } from 'react'
import { AlertCircle, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Category, Product } from './types'

const CUSTOM_UNITS_STORAGE_KEY = 'uniflow_custom_units'
const DEFAULT_UNITS = [
  'unit',
  'pcs',
  'box',
  'pack',
  'set',
  'pair',
  'kg',
  'g',
  'liter',
  'ml',
  'meter',
  'roll',
]

function loadCustomUnits(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_UNITS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : []
  } catch {
    return []
  }
}

function saveCustomUnits(units: string[]): void {
  try {
    localStorage.setItem(CUSTOM_UNITS_STORAGE_KEY, JSON.stringify(units))
  } catch {
    // Ignore storage quota or private-browsing restrictions; in-memory state still updates
  }
}

interface CategoryFieldSelectorProps {
  categories: Category[]
  categoryId: string
  onSelectCategory: (id: string) => void
  onCreateCategory: (payload: { name: string }) => Promise<Category>
  onDeleteCategory: (id: string) => Promise<void>
  onError: (msg: string | null) => void
}

function CategoryFieldSelector({
  categories,
  categoryId,
  onSelectCategory,
  onCreateCategory,
  onDeleteCategory,
  onError,
}: CategoryFieldSelectorProps) {
  const [isAdding, setIsAdding] = useState(categories.length === 0)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const selectedCategory = categories.find((c) => c.id === categoryId)
  const canDeleteSelected = Boolean(selectedCategory && selectedCategory.products_count === 0)

  const runCategoryAction = async (action: () => Promise<void>, fallbackMsg: string) => {
    setIsBusy(true)
    onError(null)
    try {
      await action()
    } catch (err) {
      onError(err instanceof Error ? err.message : fallbackMsg)
    } finally {
      setIsBusy(false)
    }
  }

  const handleCreate = () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return
    void runCategoryAction(async () => {
      const created = await onCreateCategory({ name: trimmed })
      onSelectCategory(created.id)
      setNewCategoryName('')
      setIsAdding(false)
    }, 'Failed to create category')
  }

  const handleDeleteSelected = () => {
    if (!selectedCategory || selectedCategory.products_count > 0) return
    void runCategoryAction(async () => {
      await onDeleteCategory(selectedCategory.id)
      const remaining = categories.filter((c) => c.id !== selectedCategory.id)
      onSelectCategory(remaining[0]?.id || '')
    }, 'Failed to delete category')
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700" htmlFor="prod-cat">
          Category *
        </label>
        <button
          type="button"
          onClick={() => setIsAdding((prev) => !prev)}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          <Plus className="h-3 w-3" />
          <span>{isAdding ? 'Cancel' : 'New'}</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <select
          id="prod-cat"
          className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          value={categoryId}
          onChange={(e) => onSelectCategory(e.target.value)}
          required
        >
          <option value="" disabled>
            {categories.length === 0 ? 'Create a category below first...' : 'Select a category...'}
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.products_count})
            </option>
          ))}
        </select>

        {canDeleteSelected && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeleteSelected}
            disabled={isBusy}
            title={`Delete unused category "${selectedCategory?.name}"`}
            className="h-10 px-2.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isAdding && (
        <div className="flex items-center gap-1.5 pt-1">
          <Input
            placeholder="New category name..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCreate()
              }
            }}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleCreate}
            disabled={isBusy || !newCategoryName.trim()}
            className="h-8 px-3 text-xs"
          >
            Add
          </Button>
        </div>
      )}
    </div>
  )
}

interface UnitFieldSelectorProps {
  unitOfMeasure: string
  onChangeUnit: (unit: string) => void
}

function UnitFieldSelector({ unitOfMeasure, onChangeUnit }: UnitFieldSelectorProps) {
  const [customUnits, setCustomUnits] = useState<string[]>(() => loadCustomUnits())
  const [isAddingUnit, setIsAddingUnit] = useState(false)
  const [newUnitInput, setNewUnitInput] = useState('')

  const allUnits = Array.from(
    new Set([...DEFAULT_UNITS, ...customUnits, ...(unitOfMeasure ? [unitOfMeasure] : [])])
  )
  const isCustomSelected = customUnits.includes(unitOfMeasure) && !DEFAULT_UNITS.includes(unitOfMeasure)

  const handleAddUnit = () => {
    const clean = newUnitInput.trim().toLowerCase().slice(0, 32)
    if (!clean) return
    if (!DEFAULT_UNITS.includes(clean) && !customUnits.includes(clean)) {
      const next = [...customUnits, clean]
      setCustomUnits(next)
      saveCustomUnits(next)
    }
    onChangeUnit(clean)
    setNewUnitInput('')
    setIsAddingUnit(false)
  }

  const handleDeleteCustomUnit = () => {
    const next = customUnits.filter((u) => u !== unitOfMeasure)
    setCustomUnits(next)
    saveCustomUnits(next)
    onChangeUnit('unit')
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700" htmlFor="prod-uom">
          Unit of Measure
        </label>
        <button
          type="button"
          onClick={() => setIsAddingUnit((prev) => !prev)}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          <Plus className="h-3 w-3" />
          <span>{isAddingUnit ? 'Cancel' : 'Custom'}</span>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <select
          id="prod-uom"
          className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          value={unitOfMeasure}
          onChange={(e) => onChangeUnit(e.target.value)}
        >
          {allUnits.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        {isCustomSelected && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeleteCustomUnit}
            title={`Remove custom unit "${unitOfMeasure}"`}
            className="h-10 px-2.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isAddingUnit && (
        <div className="flex items-center gap-1.5 pt-1">
          <Input
            placeholder="e.g. carton, pallet, bag..."
            maxLength={32}
            value={newUnitInput}
            onChange={(e) => setNewUnitInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddUnit()
              }
            }}
            className="h-8 text-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleAddUnit}
            disabled={!newUnitInput.trim()}
            className="h-8 px-3 text-xs"
          >
            Add
          </Button>
        </div>
      )}
    </div>
  )
}

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
  onCreateCategory: (payload: { name: string; description?: string }) => Promise<Category>
  onDeleteCategory: (id: string) => Promise<void>
}

export function ProductModal({
  isOpen,
  onClose,
  product,
  onSave,
  categories,
  onCreateCategory,
  onDeleteCategory,
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

  const activeCategoryId = categories.some((c) => c.id === categoryId)
    ? categoryId
    : categories[0]?.id || ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!sku.trim() || !name.trim() || !activeCategoryId) {
      setError('Please provide SKU, Product Name, and select or create a Category.')
      return
    }
    setIsSubmitting(true)
    try {
      await onSave({
        sku: sku.trim(),
        name: name.trim(),
        barcode: barcode.trim() || undefined,
        description: description.trim() || undefined,
        category: activeCategoryId,
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
          <CardTitle className="text-lg">{isEdit ? 'Edit Product' : 'Add New Product'}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="max-h-[75vh] space-y-4 overflow-y-auto pt-4">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CategoryFieldSelector
                categories={categories}
                categoryId={activeCategoryId}
                onSelectCategory={setCategoryId}
                onCreateCategory={onCreateCategory}
                onDeleteCategory={onDeleteCategory}
                onError={setError}
              />

              <UnitFieldSelector
                unitOfMeasure={unitOfMeasure}
                onChangeUnit={setUnitOfMeasure}
              />
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
