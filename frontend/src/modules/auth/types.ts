export interface UserProfile {
  id: string
  username: string
  email: string
  first_name: string
  last_name: string
  role: 'ADMIN' | 'MANAGER' | 'STAFF' | 'VIEWER'
  role_display: string
  is_active: boolean
  can_manage_users: boolean
  can_manage_stock: boolean
  can_manage_purchasing: boolean
  date_joined: string
  created_at: string
  updated_at: string
}

export interface AuthContextType {
  user: UserProfile | null
  token: string | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
