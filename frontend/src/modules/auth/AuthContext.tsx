import React, { useEffect, useState } from 'react'
import { AuthContext } from './context'
import type { UserProfile } from './types'

const TOKEN_KEY = 'uniflow_auth_token'
const USER_KEY = 'uniflow_user_profile'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem(USER_KEY)
    if (!saved) return null
    try {
      return JSON.parse(saved) as UserProfile
    } catch {
      return null
    }
  })
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Validate or refresh session on mount
  useEffect(() => {
    async function verifySession() {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      if (!storedToken) {
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch('/api/v1/auth/me/', {
          headers: {
            Authorization: `Token ${storedToken}`,
          },
        })

        if (response.ok) {
          const profile: UserProfile = await response.json()
          setUser(profile)
          localStorage.setItem(USER_KEY, JSON.stringify(profile))
        } else if (response.status === 401 || response.status === 403) {
          // Token expired or explicitly rejected by Django
          localStorage.removeItem(TOKEN_KEY)
          localStorage.removeItem(USER_KEY)
          setToken(null)
          setUser(null)
        } else {
          // Server offline or proxy 502/504 gateway timeout: retain offline cached session
        }
      } catch {
        // Network offline or fetch error - retain cached user
      } finally {
        setIsLoading(false)
      }
    }

    verifySession()
  }, [])

  const login = async (username: string, password: string) => {
    const response = await fetch('/api/v1/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      let errorMessage = 'Invalid username or password'
      try {
        const errData = await response.json()
        errorMessage =
          errData.detail ||
          errData.error?.message ||
          (errData.non_field_errors && errData.non_field_errors[0]) ||
          errorMessage
      } catch {
        // Fallback
      }
      throw new Error(errorMessage)
    }

    const data = await response.json()
    const receivedToken = data.token
    const receivedUser: UserProfile = data.user

    localStorage.setItem(TOKEN_KEY, receivedToken)
    localStorage.setItem(USER_KEY, JSON.stringify(receivedUser))
    setToken(receivedToken)
    setUser(receivedUser)
  }

  const logout = async () => {
    if (token) {
      try {
        await fetch('/api/v1/auth/logout/', {
          method: 'POST',
          headers: {
            Authorization: `Token ${token}`,
          },
        })
      } catch {
        // Best-effort logout network request
      }
    }

    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
