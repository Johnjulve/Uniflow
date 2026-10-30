import type { UserProfile } from '@/modules/auth/types'

export type UserRoleCode = UserProfile['role']

export interface UserCreatePayload {
  username: string
  password: string
  email: string
  first_name: string
  last_name: string
  role: UserRoleCode
  is_active: boolean
}

export interface UserUpdatePayload {
  email?: string
  first_name?: string
  last_name?: string
  role?: UserRoleCode
  is_active?: boolean
  password?: string
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('uniflow_auth_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Token ${token}` } : {}),
  }
}

async function parseApiError(res: Response, fallbackMessage: string): Promise<string> {
  try {
    const err = await res.json()
    if (err.error?.details && typeof err.error.details === 'object') {
      const firstField = Object.values(err.error.details)[0]
      if (typeof firstField === 'string') return firstField
      if (Array.isArray(firstField) && typeof firstField[0] === 'string') {
        return firstField[0]
      }
    }
    return err.error?.message || err.detail || fallbackMessage
  } catch {
    return fallbackMessage
  }
}

export async function fetchUsers(params?: {
  search?: string
  role?: string
  is_active?: boolean
}): Promise<{ count: number; results: UserProfile[] }> {
  const query = new URLSearchParams()
  if (params?.search) query.set('search', params.search)
  if (params?.role) query.set('role', params.role)
  if (params?.is_active !== undefined) query.set('is_active', String(params.is_active))

  const res = await fetch(`/api/v1/auth/users/?${query.toString()}`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    throw new Error(await parseApiError(res, 'Failed to load user accounts'))
  }
  const data = await res.json()
  return Array.isArray(data) ? { count: data.length, results: data } : data
}

export async function createUser(payload: UserCreatePayload): Promise<UserProfile> {
  const res = await fetch('/api/v1/auth/users/', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(await parseApiError(res, 'Failed to create user account'))
  }
  return res.json()
}

export async function updateUser(
  id: string,
  payload: UserUpdatePayload
): Promise<UserProfile> {
  const res = await fetch(`/api/v1/auth/users/${id}/`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(await parseApiError(res, 'Failed to update user account'))
  }
  return res.json()
}
