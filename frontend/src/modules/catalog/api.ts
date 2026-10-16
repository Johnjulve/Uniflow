import type { Category, PaginatedResponse, Product } from './types'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('uniflow_auth_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  }
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await fetch('/api/v1/catalog/categories/', {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load categories')
  const data = await res.json()
  return data.results || data
}

export async function fetchProducts(params: {
  search?: string
  category?: string
  includeArchived?: boolean
  page?: number
}): Promise<PaginatedResponse<Product>> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.category) query.set('category', params.category)
  if (params.includeArchived) query.set('include_archived', 'true')
  if (params.page) query.set('page', params.page.toString())

  const res = await fetch(`/api/v1/catalog/products/?${query.toString()}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load products')
  return res.json()
}

export async function createProduct(payload: {
  sku: string
  name: string
  barcode?: string
  description?: string
  category: string
  unit_of_measure: string
  purchase_cost: string
  selling_price: string
  reorder_threshold: string
}): Promise<Product> {
  const res = await fetch('/api/v1/catalog/products/', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const msg = errorData.detail || errorData.error?.message || 'Failed to create product'
    throw new Error(msg)
  }
  return res.json()
}

export async function updateProduct(
  id: string,
  payload: {
    sku?: string
    name?: string
    barcode?: string
    description?: string
    category?: string
    unit_of_measure?: string
    purchase_cost?: string
    selling_price?: string
    reorder_threshold?: string
  }
): Promise<Product> {
  const res = await fetch(`/api/v1/catalog/products/${id}/`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const msg = errorData.detail || errorData.error?.message || 'Failed to update product'
    throw new Error(msg)
  }
  return res.json()
}

export async function archiveProduct(id: string): Promise<Product> {
  const res = await fetch(`/api/v1/catalog/products/${id}/archive/`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to archive product')
  return res.json()
}

export async function unarchiveProduct(id: string): Promise<Product> {
  const res = await fetch(`/api/v1/catalog/products/${id}/unarchive/`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to unarchive product')
  return res.json()
}
