import type { DashboardSummary } from './types'

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('uniflow_auth_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  }
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch('/api/v1/reports/summary/', {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || err.detail || 'Failed to load report summary')
  }
  return res.json()
}

export async function downloadReportCsv(
  type: 'balances' | 'low_stock' | 'movements',
  startDate?: string,
  endDate?: string
): Promise<void> {
  const query = new URLSearchParams()
  query.set('type', type)
  if (startDate) query.set('start_date', startDate)
  if (endDate) query.set('end_date', endDate)

  const token = localStorage.getItem('uniflow_auth_token')
  const res = await fetch(`/api/v1/reports/export/?${query.toString()}`, {
    headers: token ? { Authorization: `Token ${token}` } : {},
  })

  if (!res.ok) {
    throw new Error(`Failed to export ${type} report (HTTP ${res.status})`)
  }

  // Extract filename from Content-Disposition if present
  const disposition = res.headers.get('Content-Disposition')
  let filename = `uniflow_${type}_report.csv`
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/)
    if (match?.[1]) {
      filename = match[1]
    }
  }

  const blob = await res.blob()
  const downloadUrl = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = downloadUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(downloadUrl)
}
