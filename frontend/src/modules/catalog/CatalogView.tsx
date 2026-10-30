import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  FolderTree,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/modules/auth/useAuth'
import {
  archiveProduct,
  createCategory,
  createProduct,
  deleteCategory,
  fetchCategories,
  fetchProducts,
  unarchiveProduct,
  updateProduct,
} from './api'
import { ProductModal } from './ProductModal'
import type { Category, Product } from './types'

interface CategoryManagerModalProps {
  categories: Category[]
  onClose: () => void
  onCreateCategory: (payload: { name: string; description?: string }) => Promise<Category>
  onDeleteCategory: (id: string) => Promise<void>
}

function CategoryManagerModal({
  categories,
  onClose,
  onCreateCategory,
  onDeleteCategory,
}: CategoryManagerModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const runAction = async (fn: () => Promise<void>, fallback: string) => {
    setIsBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : fallback)
    } finally {
      setIsBusy(false)
    }
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    void runAction(async () => {
      await onCreateCategory({ name: name.trim(), description: description.trim() || undefined })
      setName('')
      setDescription('')
    }, 'Failed to create category')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <Card className="w-full max-w-md bg-white shadow-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
          <CardTitle className="text-lg">Manage Categories</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleAdd} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label className="block text-xs font-semibold text-slate-700">Add New Category</label>
            <div className="flex gap-2">
              <Input
                placeholder="Category name (e.g. Fasteners)..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Button type="submit" disabled={isBusy || !name.trim()}>
                Add
              </Button>
            </div>
            <Input
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-xs"
            />
          </form>

          <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {categories.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">
                No categories created yet. Add one above to classify products.
              </p>
            ) : (
              categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                  <div>
                    <div className="font-medium text-slate-900">{c.name}</div>
                    {c.description && <div className="text-xs text-slate-400">{c.description}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {c.products_count} {c.products_count === 1 ? 'item' : 'items'}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isBusy || c.products_count > 0}
                      onClick={() =>
                        void runAction(() => onDeleteCategory(c.id), 'Failed to delete category')
                      }
                      title={
                        c.products_count > 0
                          ? 'Cannot delete category while products are assigned to it'
                          : 'Delete unused category'
                      }
                      className="h-7 w-7 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>

        <CardFooter className="flex justify-end border-t border-slate-100 pt-3">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

interface CatalogTableProps {
  products: Product[]
  isLoading: boolean
  error: Error | null
  hasActiveFilters: boolean
  canManage: boolean
  isArchiving: boolean
  onRetry: () => void
  onEdit: (product: Product) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
}

function CatalogTable({
  products,
  isLoading,
  error,
  hasActiveFilters,
  canManage,
  isArchiving,
  onRetry,
  onEdit,
  onArchive,
  onUnarchive,
}: CatalogTableProps) {
  if (error) {
    return (
      <div className="flex items-center justify-between p-6 text-sm text-rose-700">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{error.message}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <div className="mb-2 h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        <p className="text-sm">Loading catalog items...</p>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Package className="h-6 w-6" />
        </div>
        <p className="text-base font-semibold text-slate-800">No products found</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          {hasActiveFilters
            ? 'No products match your active search filters.'
            : 'Start by adding your first product to the inventory catalog.'}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-slate-600">
        <thead className="border-b border-slate-200 bg-slate-50/75 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-6 py-3.5 font-semibold">SKU</th>
            <th className="px-6 py-3.5 font-semibold">Product Name</th>
            <th className="px-6 py-3.5 font-semibold">Category</th>
            <th className="px-6 py-3.5 text-right font-semibold">Cost Price</th>
            <th className="px-6 py-3.5 text-right font-semibold">Selling Price</th>
            <th className="px-6 py-3.5 text-right font-semibold">On-Hand Stock</th>
            <th className="px-6 py-3.5 text-center font-semibold">Status</th>
            {canManage && <th className="px-6 py-3.5 text-right font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-slate-50/50">
              <td className="px-6 py-4 font-mono font-medium text-slate-900">{p.sku}</td>
              <td className="px-6 py-4">
                <div className="font-semibold text-slate-900">{p.name}</div>
                {p.barcode && <div className="font-mono text-xs text-slate-400">Barcode: {p.barcode}</div>}
              </td>
              <td className="px-6 py-4">
                <Badge variant="outline">{p.category_name || 'Uncategorized'}</Badge>
              </td>
              <td className="px-6 py-4 text-right font-mono text-slate-600">
                ${parseFloat(p.purchase_cost).toFixed(2)}
              </td>
              <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900">
                ${parseFloat(p.selling_price).toFixed(2)}
              </td>
              <td className="px-6 py-4 text-right font-mono">
                {p.total_on_hand && parseFloat(p.total_on_hand) > 0 ? (
                  <span className="font-bold text-emerald-700">
                    {parseFloat(p.total_on_hand).toFixed(2)}{' '}
                    <span className="text-xs font-normal text-slate-500">{p.unit_of_measure}</span>
                  </span>
                ) : (
                  <span className="text-slate-400">
                    0.00 <span className="text-xs font-normal">{p.unit_of_measure}</span>
                  </span>
                )}
              </td>
              <td className="px-6 py-4 text-center">
                {p.is_archived ? (
                  <Badge variant="secondary">Archived</Badge>
                ) : (
                  <Badge variant="success">Active</Badge>
                )}
              </td>
              {canManage && (
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-slate-600 hover:text-blue-700"
                      onClick={() => onEdit(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </Button>
                    {p.is_archived ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-blue-600 hover:text-blue-800"
                        onClick={() => onUnarchive(p.id)}
                        disabled={isArchiving}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        <span>Restore</span>
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-slate-500 hover:text-amber-700"
                        onClick={() => onArchive(p.id)}
                        disabled={isArchiving}
                      >
                        <Archive className="h-3.5 w-3.5" />
                        <span>Archive</span>
                      </Button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CatalogView() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const canManage = Boolean(
    user?.can_manage_purchasing || user?.role === 'ADMIN' || user?.role === 'MANAGER'
  )

  const invalidateCatalog = () => {
    setActionError(null)
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] })
  }

  const { data: categories = [] } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: fetchCategories,
  })

  const productsQuery = useQuery({
    queryKey: ['catalog', 'products', { search, category: selectedCategory, includeArchived, page }],
    queryFn: () =>
      fetchProducts({
        search: search.trim() || undefined,
        category: selectedCategory || undefined,
        includeArchived,
        page,
      }),
  })

  const createCategoryMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: invalidateCatalog,
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: (_, deletedId) => {
      if (selectedCategory === deletedId) setSelectedCategory('')
      invalidateCatalog()
    },
  })

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      invalidateCatalog()
      setIsModalOpen(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateProduct>[1] }) =>
      updateProduct(id, payload),
    onSuccess: () => {
      invalidateCatalog()
      setEditingProduct(null)
      setIsModalOpen(false)
    },
  })

  const archiveMutation = useMutation({
    mutationFn: archiveProduct,
    onSuccess: invalidateCatalog,
    onError: (err: Error) => setActionError(err.message),
  })

  const unarchiveMutation = useMutation({
    mutationFn: unarchiveProduct,
    onSuccess: invalidateCatalog,
    onError: (err: Error) => setActionError(err.message),
  })

  const products = productsQuery.data?.results || []
  const totalCount = productsQuery.data?.count || 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Product Catalog</h2>
          <p className="text-sm text-slate-500">
            Maintain inventory SKU definitions, classifications, and retail pricing.
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setIsCategoryModalOpen(true)}
              className="gap-2"
            >
              <FolderTree className="h-4 w-4" />
              <span>Categories ({categories.length})</span>
            </Button>
            <Button
              onClick={() => {
                setEditingProduct(null)
                setIsModalOpen(true)
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Product</span>
            </Button>
          </div>
        )}
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{actionError}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <div className="relative w-full flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by SKU, product name, or barcode..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-9"
              />
            </div>

            <div className="flex w-full items-center gap-3 md:w-auto">
              <select
                aria-label="Filter by Category"
                className="flex h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value)
                  setPage(1)
                }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.products_count})
                  </option>
                ))}
              </select>

              <label className="flex cursor-pointer select-none items-center gap-2 whitespace-nowrap text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => {
                    setIncludeArchived(e.target.checked)
                    setPage(1)
                  }}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Show Archived
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Products <span className="text-xs font-normal text-slate-500">({totalCount} items)</span>
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <CatalogTable
            products={products}
            isLoading={productsQuery.isLoading}
            error={productsQuery.error instanceof Error ? productsQuery.error : null}
            hasActiveFilters={Boolean(search || selectedCategory)}
            canManage={canManage}
            isArchiving={archiveMutation.isPending || unarchiveMutation.isPending}
            onRetry={() => void productsQuery.refetch()}
            onEdit={(p) => {
              setEditingProduct(p)
              setIsModalOpen(true)
            }}
            onArchive={(id) => archiveMutation.mutate(id)}
            onUnarchive={(id) => unarchiveMutation.mutate(id)}
          />

          {totalCount > 25 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3">
              <span className="text-xs text-slate-500">
                Showing {products.length} of {totalCount} items
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => prev + 1)}
                  disabled={!productsQuery.data?.next}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isCategoryModalOpen && (
        <CategoryManagerModal
          categories={categories}
          onClose={() => setIsCategoryModalOpen(false)}
          onCreateCategory={(payload) => createCategoryMutation.mutateAsync(payload)}
          onDeleteCategory={(id) => deleteCategoryMutation.mutateAsync(id)}
        />
      )}

      {isModalOpen && (
        <ProductModal
          key={editingProduct ? editingProduct.id : 'new'}
          isOpen={isModalOpen}
          product={editingProduct}
          onClose={() => {
            setIsModalOpen(false)
            setEditingProduct(null)
          }}
          onSave={async (payload) => {
            if (editingProduct) {
              await updateMutation.mutateAsync({ id: editingProduct.id, payload })
            } else {
              await createMutation.mutateAsync(payload)
            }
          }}
          categories={categories}
          onCreateCategory={(payload) => createCategoryMutation.mutateAsync(payload)}
          onDeleteCategory={(id) => deleteCategoryMutation.mutateAsync(id)}
        />
      )}
    </div>
  )
}
