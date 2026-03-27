import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface ThemeStore {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.classList.toggle('light', theme === 'light')
      },
    }),
    { name: 'nuz-theme' }
  )
)

export function applyStoredTheme() {
  const stored = localStorage.getItem('nuz-theme')
  if (stored) {
    try {
      const { state } = JSON.parse(stored)
      if (state?.theme === 'light') document.documentElement.classList.add('light')
    } catch {}
  }
}
