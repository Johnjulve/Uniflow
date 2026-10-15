import type {
  PurchaseOrder,
  PurchaseOrderCreatePayload,
  Receipt,
  ReceiptCreatePayload,
  Supplier,
  SupplierCreatePayload,
} from './types'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('uniflow_auth_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  }
}

export async function fetchSuppliers(params?: {
  search?: string
  is_active?: boolean
}): Promise<{ count: number; results: Supplier[] }> {
  const query = new URLSearchParams()
  if (params?.search) query.set('search', params.search)
  if (params?.is_active !== undefined) query.set('is_active', String(params.is_active))

  const res = await fetch(`/api/v1/suppliers/?${query.toString()}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load suppliers')
  const data = await res.json()
  return Array.isArray(data) ? { count: data.length, results: data } : data
}

export async function createSupplier(payload: SupplierCreatePayload): Promise<Supplier> {
  const res = await fetch('/api/v1/suppliers/', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || err.detail || 'Failed to create supplier')
  }
  return res.json()
}

export async function fetchPurchaseOrders(params?: {
  search?: string
  status?: string
  supplier?: string
}): Promise<{ count: number; results: PurchaseOrder[] }> {
  const query = new URLSearchParams()
  if (params?.search) query.set('search', params.search)
  if (params?.status) query.set('status', params.status)
  if (params?.supplier) query.set('supplier', params.supplier)

  const res = await fetch(`/api/v1/purchase-orders/?${query.toString()}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load purchase orders')
  const data = await res.json()
  return Array.isArray(data) ? { count: data.length, results: data } : data
}

export async function createPurchaseOrder(
  payload: PurchaseOrderCreatePayload
): Promise<PurchaseOrder> {
  const res = await fetch('/api/v1/purchase-orders/', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || err.detail || 'Failed to create purchase order')
  }
  return res.json()
}

export async function submitPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const res = await fetch(`/api/v1/purchase-orders/${id}/submit/`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || err.detail || 'Failed to submit purchase order')
  }
  return res.json()
}

export async function cancelPurchaseOrder(id: string, reason?: string): Promise<PurchaseOrder> {
  const res = await fetch(`/api/v1/purchase-orders/${id}/cancel/`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ reason: reason || '' }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || err.detail || 'Failed to cancel purchase order')
  }
  return res.json()
}

export async function fetchReceipts(params?: {
  purchase_order?: string
  location?: string
}): Promise<{ count: number; results: Receipt[] }> {
  const query = new URLSearchParams()
  if (params?.purchase_order) query.set('purchase_order', params.purchase_order)
  if (params?.location) query.set('location', params.location)

  const res = await fetch(`/api/v1/receipts/?${query.toString()}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load intake receipts')
  const data = await res.json()
  return Array.isArray(data) ? { count: data.length, results: data } : data
}

export async function createReceipt(payload: ReceiptCreatePayload): Promise<Receipt> {
  const res = await fetch('/api/v1/receipts/', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || err.detail || 'Failed to record intake receipt')
  }
  return res.json()
}
