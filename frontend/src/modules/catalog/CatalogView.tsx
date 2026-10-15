import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Archive, ArchiveRestore, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/modules/auth/useAuth'
import { fetchProducts, fetchCategories, createProduct, archiveProduct, unarchiveProduct } from './api'
import { ProductModal } from './ProductModal'

export function CatalogView() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const canManage = user?.can_manage_stock || user?.role === 'ADMIN' || user?.role === 'MANAGER'

  // Fetch categories for filtering and modal
  const { data: categories = [] } = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: fetchCategories,
  })

  // Fetch products query
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['catalog', 'products', { search, category: selectedCategory, includeArchived, page }],
    queryFn: () =>
      fetchProducts({
        search: search.trim() || undefined,
        category: selectedCategory || undefined,
        includeArchived,
        page,
      }),
  })

  // Mutations
  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] })
      queryClient.invalidateQueries({ queryKey: ['catalog', 'categories'] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: archiveProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] })
    },
  })

  const unarchiveMutation = useMutation({
    mutationFn: unarchiveProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'products'] })
    },
  })

  const products = productsData?.results || []
  const totalCount = productsData?.count || 0

  return (
    <div className="space-y-6">
      {/* Page Title & Add Product Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Product Catalog</h2>
          <p className="text-sm text-slate-500">
            Maintain inventory SKU definitions, classifications, and retail pricing.
          </p>
        </div>

        {canManage && (
          <Button onClick={() => setIsModalOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span>Add Product</span>
          </Button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
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

            <div className="flex items-center gap-3 w-full md:w-auto">
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

              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none whitespace-nowrap">
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

      {/* Products Table Card */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Products <span className="text-xs font-normal text-slate-500">({totalCount} items)</span>
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mb-2" />
              <p className="text-sm">Loading catalog items...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <Package className="h-6 w-6" />
              </div>
              <p className="text-base font-semibold text-slate-800">No products found</p>
              <p className="text-sm text-slate-500 max-w-sm mt-1">
                {search || selectedCategory
                  ? 'No products match your active search filters.'
                  : 'Start by adding your first product to the inventory catalog.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50/75 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 font-semibold">SKU</th>
                    <th className="px-6 py-3.5 font-semibold">Product Name</th>
                    <th className="px-6 py-3.5 font-semibold">Category</th>
                    <th className="px-6 py-3.5 font-semibold text-right">Cost Price</th>
                    <th className="px-6 py-3.5 font-semibold text-right">Selling Price</th>
                    <th className="px-6 py-3.5 font-semibold text-center">Status</th>
                    {canManage && <th className="px-6 py-3.5 font-semibold text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono font-medium text-slate-900">{p.sku}</td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        {p.barcode && <div className="text-xs text-slate-400 font-mono">Barcode: {p.barcode}</div>}
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
                      <td className="px-6 py-4 text-center">
                        {p.is_archived ? (
                          <Badge variant="secondary">Archived</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      {canManage && (
                        <td className="px-6 py-4 text-right">
                          {p.is_archived ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-blue-600 hover:text-blue-800 gap-1"
                              onClick={() => unarchiveMutation.mutate(p.id)}
                              disabled={unarchiveMutation.isPending}
                            >
                              <ArchiveRestore className="h-3.5 w-3.5" />
                              <span>Restore</span>
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-500 hover:text-amber-700 gap-1"
                              onClick={() => archiveMutation.mutate(p.id)}
                              disabled={archiveMutation.isPending}
                            >
                              <Archive className="h-3.5 w-3.5" />
                              <span>Archive</span>
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
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
                  disabled={!productsData?.next}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Creation Modal */}
      {isModalOpen && (
        <ProductModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={async (payload) => {
            await createMutation.mutateAsync(payload)
          }}
          categories={categories}
        />
      )}
    </div>
  )
}
