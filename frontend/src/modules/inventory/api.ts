import type { Location, StockAdjustmentPayload, StockBalance, StockMovement } from './types'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('uniflow_auth_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  }
}

export async function fetchLocations(): Promise<Location[]> {
  const res = await fetch('/api/v1/inventory/locations/', {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load locations')
  const data = await res.json()
  return data.results || data
}

export async function fetchStockBalances(params: {
  search?: string
  location?: string
  lowStock?: boolean
}): Promise<{ count: number; results: StockBalance[] }> {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.location) query.set('location', params.location)
  if (params.lowStock) query.set('low_stock', 'true')

  const res = await fetch(`/api/v1/inventory/balances/?${query.toString()}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load stock balances')
  return res.json()
}

export async function fetchStockMovements(params: {
  location?: string
  movementType?: string
}): Promise<{ count: number; results: StockMovement[] }> {
  const query = new URLSearchParams()
  if (params.location) query.set('location', params.location)
  if (params.movementType) query.set('movement_type', params.movementType)

  const res = await fetch(`/api/v1/inventory/movements/?${query.toString()}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to load stock movements')
  return res.json()
}

export async function recordStockAdjustment(payload: StockAdjustmentPayload): Promise<{
  movement: StockMovement
  balance: StockBalance
}> {
  const res = await fetch('/api/v1/inventory/adjustments/', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const msg = errorData.detail || errorData.error?.message || 'Failed to record stock adjustment'
    throw new Error(msg)
  }
  return res.json()
}
