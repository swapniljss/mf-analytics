import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

// ⚠️ TEMPORARY hardcoded credentials. Replace with proper backend auth (JWT/session)
//     when the auth system is built. Until then, this gates the dashboard behind
//     a simple username + password check stored client-side only.
const STATIC_USERNAME = '9167058416'
const STATIC_PASSWORD = 'mutualfundsk2vs'
const STORAGE_KEY = 'mf:auth-session'

type AuthValue = {
  authed: boolean
  /** Check creds WITHOUT flipping auth state (used to gate the exit animation). */
  validate: (username: string, password: string) => boolean
  /** Check creds AND flip auth state on success. */
  login: (username: string, password: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthValue | undefined>(undefined)

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Provider must wrap the entire app so login/logout in any component
// updates the shared state immediately — without this, each useAuth()
// call gets its own useState instance and the UI desyncs.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean>(readInitial)
  // AuthProvider lives inside <BrowserRouter> in App.tsx, so this hook works
  // here. Used only inside logout() to send the user back to "/".
  const navigate = useNavigate()

  // Sync across browser tabs (storage event only fires in OTHER tabs).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setAuthed(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const validate = (username: string, password: string): boolean => {
    const u = (username || '').trim()
    const p = password || ''
    return u === STATIC_USERNAME && p === STATIC_PASSWORD
  }

  const login = (username: string, password: string): boolean => {
    if (!validate(username, password)) return false
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setAuthed(true)
    return true
  }

  const logout = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setAuthed(false)
    // Reset the URL to "/" so the address bar reflects the logged-out state.
    // After the user signs back in, AuthGate renders <Layout/> and the route
    // matches "/" → DashboardPage mounts. No API call is triggered by this
    // navigation itself; it's a pure URL/router update.
    navigate('/', { replace: true })
  }

  // Using createElement keeps this file as .ts (no JSX, no file rename).
  return React.createElement(
    AuthContext.Provider,
    { value: { authed, validate, login, logout } },
    children,
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
