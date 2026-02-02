import { createContext, useContext, useState, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{
  theme: Theme
  toggleTheme: () => void
}>({
  theme: 'dark',
  toggleTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Read initial theme from document class (set by inline script)
    if (typeof document !== 'undefined') {
      return document.documentElement.className as Theme || 'dark'
    }
    return 'dark'
  })

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    document.documentElement.className = newTheme
    // Save to both localStorage and cookie for flash prevention
    localStorage.setItem('theme', newTheme)
    document.cookie = `theme=${newTheme};path=/;max-age=31536000`
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
