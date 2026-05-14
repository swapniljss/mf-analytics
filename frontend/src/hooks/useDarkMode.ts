import { useEffect, useState } from 'react'

// localStorage key shared with the inline no-flash script in index.html.
// "1" = dark, "0" = light, missing = follow OS preference.
const STORAGE_KEY = 'mf:dark-mode'

function readInitial(): boolean {
  if (typeof document === 'undefined') return false
  // The inline script in index.html already set the class on <html> before
  // React mounted — read it back so our state matches what's painted.
  return document.documentElement.classList.contains('dark')
}

export function useDarkMode() {
  const [enabled, setEnabled] = useState<boolean>(readInitial)

  useEffect(() => {
    const root = document.documentElement
    if (enabled) root.classList.add('dark')
    else root.classList.remove('dark')
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
    } catch {
      /* private mode — ignore */
    }
  }, [enabled])

  return {
    enabled,
    toggle: () => setEnabled((v) => !v),
    setEnabled,
  }
}
