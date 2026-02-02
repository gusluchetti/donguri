import { createRoot } from 'react-dom/client'
import { Route, Link, Switch, useLocation } from 'wouter'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Home } from './components/Home'
import { MediaCatalog } from './components/MediaCatalog'
import { ThemeProvider, useTheme } from './libs/theme'

// Stats context for status bar
type Stats = {
  total: number
  movies: number
  tvSeries: number
  anime: number
} | null

const StatsContext = createContext<{
  stats: Stats
  setStats: (stats: Stats) => void
}>({
  stats: null,
  setStats: () => {},
})

export const useStats = () => useContext(StatsContext)

const StatsProvider = ({ children }: { children: ReactNode }) => {
  const [stats, setStats] = useState<Stats>(null)
  return (
    <StatsContext.Provider value={{ stats, setStats }}>
      {children}
    </StatsContext.Provider>
  )
}

// Pagination context for status bar
type PaginationInfo = {
  page: number
  totalPages: number
} | null

const PaginationContext = createContext<{
  pagination: PaginationInfo
  setPagination: (pagination: PaginationInfo) => void
}>({
  pagination: null,
  setPagination: () => {},
})

export const usePagination = () => useContext(PaginationContext)

const PaginationProvider = ({ children }: { children: ReactNode }) => {
  const [pagination, setPagination] = useState<PaginationInfo>(null)
  return (
    <PaginationContext.Provider value={{ pagination, setPagination }}>
      {children}
    </PaginationContext.Provider>
  )
}

// Navigation link component
const NavLink = ({ href, children }: { href: string; children: ReactNode }) => {
  const [location] = useLocation()
  const isActive = location === href

  return (
    <Link
      href={href}
      className={`px-3 py-1 text-sm transition-colors duration-100
        ${isActive
          ? 'dark:bg-kanagawa-bg-surface dark:text-kanagawa-accent-cyan light:bg-kanagawa-light-bg-surface light:text-kanagawa-light-accent-cyan'
          : 'dark:text-kanagawa-text-secondary dark:hover:text-kanagawa-text-primary light:text-kanagawa-light-text-secondary light:hover:text-kanagawa-light-text-primary'
        }`}
    >
      [{children}]
    </Link>
  )
}

// Theme toggle button
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className="px-2 py-1 text-sm dark:text-kanagawa-text-secondary dark:hover:text-kanagawa-accent-yellow light:text-kanagawa-light-text-secondary light:hover:text-kanagawa-light-accent-yellow transition-colors duration-100"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      [{theme === 'dark' ? '\u263E' : '\u2600'}]
    </button>
  )
}

// Status bar footer
const StatusBar = () => {
  const { stats } = useStats()
  const { pagination } = usePagination()

  return (
    <footer className="fixed bottom-0 left-0 right-0 h-7 px-4 flex items-center text-xs border-t
      dark:bg-kanagawa-bg-elevated dark:border-kanagawa-bg-surface dark:text-kanagawa-text-secondary
      light:bg-kanagawa-light-bg-elevated light:border-kanagawa-light-bg-surface light:text-kanagawa-light-text-secondary">
      <div className="flex items-center gap-4">
        {stats ? (
          <>
            <span>{stats.total.toLocaleString()} items</span>
            <span className="dark:text-kanagawa-accent-orange light:text-kanagawa-light-accent-orange">mov: {stats.movies.toLocaleString()}</span>
            <span className="dark:text-kanagawa-accent-cyan light:text-kanagawa-light-accent-cyan">tv: {stats.tvSeries.toLocaleString()}</span>
            <span className="dark:text-kanagawa-accent-green light:text-kanagawa-light-accent-green">ani: {stats.anime.toLocaleString()}</span>
          </>
        ) : (
          <span>loading...</span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-4">
        {pagination && (
          <span>pg {pagination.page}/{pagination.totalPages}</span>
        )}
        <span className="dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">
          j/k:nav | /:search | ?:help
        </span>
      </div>
    </footer>
  )
}

// Navigation header
const NavBar = () => {
  return (
    <header className="fixed top-0 left-0 right-0 h-10 px-4 flex items-center border-b
      dark:bg-kanagawa-bg-elevated dark:border-kanagawa-bg-surface
      light:bg-kanagawa-light-bg-elevated light:border-kanagawa-light-bg-surface">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold dark:text-kanagawa-accent-yellow light:text-kanagawa-light-accent-yellow">
          {'\u25A3'} donguri
        </span>
      </div>
      <nav className="flex items-center gap-1 ml-8">
        <NavLink href="/">home</NavLink>
        <NavLink href="/catalog">catalog</NavLink>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <button className="px-2 py-1 text-sm dark:text-kanagawa-text-secondary dark:hover:text-kanagawa-text-primary light:text-kanagawa-light-text-secondary light:hover:text-kanagawa-light-text-primary transition-colors duration-100">
          [?]
        </button>
      </div>
    </header>
  )
}

// Main app shell
const AppShell = ({ children }: { children: ReactNode }) => {
  return (
    <div className="min-h-screen font-mono dark:bg-kanagawa-bg-base dark:text-kanagawa-text-primary light:bg-kanagawa-light-bg-base light:text-kanagawa-light-text-primary">
      <NavBar />
      <main className="pt-10 pb-7 min-h-screen">
        {children}
      </main>
      <StatusBar />
    </div>
  )
}

const App = () => {
  return (
    <ThemeProvider>
      <StatsProvider>
        <PaginationProvider>
          <AppShell>
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/catalog" component={MediaCatalog} />
            </Switch>
          </AppShell>
        </PaginationProvider>
      </StatsProvider>
    </ThemeProvider>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
