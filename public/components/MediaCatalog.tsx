import { useEffect, useState } from "react"
import useSWR from "swr"
import { api, MediaItem } from "../libs/api"
import { useStats, usePagination } from "../index"
import { MediaType } from "../../src/import/types"

const ITEMS_PER_PAGE = 50

// SWR fetcher for media list
const mediaFetcher = async (key: string) => {
  const [, page, typeFilter, search] = key.split('|')
  const { data } = await api.api.media.get({
    query: {
      page: Number(page),
      limit: ITEMS_PER_PAGE,
      search: search || undefined,
      type: typeFilter as MediaType || undefined,
    },
  })
  return data
}

// SWR fetcher for stats
const statsFetcher = async () => {
  const { data } = await api.api.media.stats.get()
  return data
}

// Type badge component with color coding
const TypeBadge = ({ type }: { type: string }) => {
  if (type === 'movie') {
    return <span className="font-medium text-accent-orange dark:text-glow-orange">MOV</span>
  }
  if (type === 'tv_series') {
    return <span className="font-medium text-accent-cyan dark:text-glow-cyan">TV</span>
  }
  if (type === 'anime') {
    return <span className="font-medium text-accent-green dark:text-glow-green">ANI</span>
  }
  return <span className="font-medium text-ink-400 dark:text-sand-500">{type.slice(0, 3).toUpperCase()}</span>
}

// External link badge
const LinkBadge = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="px-1 text-xs border rounded border-cream-300 dark:border-espresso-800 text-ink-400 dark:text-sand-500 hover:text-accent-blue dark:hover:text-glow-blue hover:border-accent-blue dark:hover:border-glow-blue transition-colors duration-100"
  >
    {label}
  </a>
)

// Format year range compactly
const formatYear = (start: number | null, end: number | null) => {
  if (!start) return '-'
  if (!end || end === start) return String(start)
  // Compact format: 2008-13 instead of 2008-2013
  const endStr = String(end)
  const startStr = String(start)
  if (startStr.slice(0, 2) === endStr.slice(0, 2)) {
    return `${start}-${endStr.slice(2)}`
  }
  return `${start}-${end}`
}

// Format episode/season count
const formatEpisodes = (item: MediaItem) => {
  const parts: string[] = []
  if (item.seasonCount) parts.push(`S:${item.seasonCount}`)
  if (item.episodeCount) parts.push(`E:${item.episodeCount}`)
  return parts.length > 0 ? parts.join(' ') : null
}

// Desktop table row (two-row layout per item)
const TableRow = ({ item }: { item: MediaItem }) => {
  const episodes = formatEpisodes(item)

  return (
    <tr className="group border-b border-cream-300 dark:border-espresso-800 hover:bg-cream-200 dark:hover:bg-espresso-900 transition-colors duration-100">
      {/* Title column spans both rows visually */}
      <td className="py-1.5 px-3 align-top">
        <div className="flex flex-col gap-0.5">
          <span className="text-ink-600 dark:text-sand-300 truncate max-w-xs" title={item.titleEn || undefined}>
            {item.titleEn || '-'}
          </span>
          {item.titleOriginal && item.titleOriginal !== item.titleEn && (
            <span className="text-xs text-ink-400 dark:text-sand-500 truncate max-w-xs" title={item.titleOriginal}>
              {item.titleOriginal}
            </span>
          )}
        </div>
      </td>
      {/* Type badge */}
      <td className="py-1.5 px-2 text-center align-top">
        <TypeBadge type={item.mediaType} />
      </td>
      {/* Year */}
      <td className="py-1.5 px-2 text-center align-top text-ink-400 dark:text-sand-500">
        {formatYear(item.startYear, item.endYear)}
      </td>
      {/* Episodes (hidden on tablet) */}
      <td className="py-1.5 px-2 text-center align-top text-ink-400 dark:text-sand-500 hidden lg:table-cell">
        {episodes || '-'}
      </td>
      {/* External links */}
      <td className="py-1.5 px-2 align-top">
        <div className="flex gap-1">
          {item.imdbId && (
            <LinkBadge href={`https://www.imdb.com/title/${item.imdbId}`} label="imdb" />
          )}
          {item.malId && (
            <LinkBadge href={`https://myanimelist.net/anime/${item.malId}`} label="mal" />
          )}
        </div>
      </td>
    </tr>
  )
}

// Mobile card layout
const MediaCard = ({ item }: { item: MediaItem }) => {
  const episodes = formatEpisodes(item)

  return (
    <div className="p-3 border rounded border-cream-300 dark:border-espresso-800 bg-cream-200 dark:bg-espresso-900">
      <div className="flex items-start justify-between gap-2 mb-1">
        <TypeBadge type={item.mediaType} />
        <span className="text-xs text-ink-400 dark:text-sand-500">
          {formatYear(item.startYear, item.endYear)}
        </span>
      </div>
      <div className="mb-2">
        <div className="font-medium truncate text-ink-600 dark:text-sand-300" title={item.titleEn || undefined}>
          {item.titleEn || '-'}
        </div>
        {item.titleOriginal && item.titleOriginal !== item.titleEn && (
          <div className="text-xs truncate text-ink-400 dark:text-sand-500" title={item.titleOriginal}>
            {item.titleOriginal}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {item.imdbId && (
            <LinkBadge href={`https://www.imdb.com/title/${item.imdbId}`} label="imdb" />
          )}
          {item.malId && (
            <LinkBadge href={`https://myanimelist.net/anime/${item.malId}`} label="mal" />
          )}
        </div>
        {episodes && (
          <span className="text-xs text-ink-400 dark:text-sand-500">
            {episodes}
          </span>
        )}
      </div>
    </div>
  )
}

// Loading state
const LoadingState = () => (
  <div className="flex items-center justify-center py-12">
    <span className="text-ink-400 dark:text-sand-500 tui-loading">
      loading
    </span>
  </div>
)

// Filter button component
const FilterButton = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-2 py-0.5 text-xs border rounded transition-colors duration-100
      ${active
        ? 'bg-cream-300 dark:bg-espresso-800 border-accent-cyan dark:border-glow-cyan text-accent-cyan dark:text-glow-cyan'
        : 'border-cream-300 dark:border-espresso-800 text-ink-400 dark:text-sand-500 hover:border-ink-400 dark:hover:border-sand-500'
      }`}
  >
    {children}
  </button>
)

export const MediaCatalog = () => {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<'movie' | 'tv_series' | 'anime' | ''>('')
  const { setStats } = useStats()
  const { setPagination } = usePagination()

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
    }, search ? 250 : 0)
    return () => clearTimeout(timer)
  }, [search])

  // Skip fetch if search is exactly 1 char
  const shouldFetch = debouncedSearch.length !== 1

  // Fetch media with SWR
  const { data: media, isLoading } = useSWR(
    shouldFetch ? `media|${page}|${typeFilter}|${debouncedSearch}` : null,
    mediaFetcher,
    {
      keepPreviousData: true,
      dedupingInterval: 2000,
    }
  )

  // Fetch stats with SWR
  const { data: stats } = useSWR('stats', statsFetcher)

  // Update stats context when data changes
  useEffect(() => {
    if (stats) {
      setStats({
        total: stats.total,
        movies: stats.byType.movie || 0,
        tvSeries: stats.byType.tv_series || 0,
        anime: stats.byType.anime || 0,
      })
    }
  }, [stats, setStats])

  // Update pagination context when data changes
  useEffect(() => {
    if (media?.pagination) {
      setPagination({
        page: media.pagination.page,
        totalPages: media.pagination.totalPages,
      })
    }
  }, [media, setPagination])

  const pagination = media?.pagination
  const totalPages = pagination?.totalPages ?? 1

  return (
    <div className="px-4 py-3">
      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-400 dark:text-sand-500">/</span>
          <input
            type="text"
            placeholder="search (2+ chars)..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full pl-6 pr-8 py-1.5 text-sm border rounded bg-cream-100 dark:bg-espresso-950 border-cream-300 dark:border-espresso-800 text-ink-600 dark:text-sand-300 placeholder-ink-400 dark:placeholder-sand-500 focus:outline-none focus:border-accent-blue dark:focus:border-glow-blue"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 dark:text-sand-500 hover:text-ink-600 dark:hover:text-sand-300"
            >
              x
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-ink-400 dark:text-sand-500">filter:</span>
          <FilterButton active={typeFilter === ''} onClick={() => { setTypeFilter(''); setPage(1) }}>all</FilterButton>
          <FilterButton active={typeFilter === 'movie'} onClick={() => { setTypeFilter('movie'); setPage(1) }}>mov</FilterButton>
          <FilterButton active={typeFilter === 'tv_series'} onClick={() => { setTypeFilter('tv_series'); setPage(1) }}>tv</FilterButton>
          <FilterButton active={typeFilter === 'anime'} onClick={() => { setTypeFilter('anime'); setPage(1) }}>ani</FilterButton>
        </div>
      </div>

      {/* Results info */}
      {pagination && !isLoading && (
        <div className="mb-3 text-xs text-ink-400 dark:text-sand-500">
          showing {media?.data.length ?? 0} of {pagination.total.toLocaleString()}
          {search && <span> matching "{search}"</span>}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <LoadingState />
      ) : (
        <>
          {/* Desktop table (hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cream-300 dark:border-espresso-800">
                  <th className="py-2 px-3 text-left font-medium text-ink-400 dark:text-sand-500">title</th>
                  <th className="py-2 px-2 text-center font-medium text-ink-400 dark:text-sand-500 w-16">type</th>
                  <th className="py-2 px-2 text-center font-medium text-ink-400 dark:text-sand-500 w-20">year</th>
                  <th className="py-2 px-2 text-center font-medium text-ink-400 dark:text-sand-500 w-24 hidden lg:table-cell">eps</th>
                  <th className="py-2 px-2 text-left font-medium text-ink-400 dark:text-sand-500 w-24">links</th>
                </tr>
              </thead>
              <tbody>
                {media?.data.map((m) => (
                  <TableRow key={m.id} item={m} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards (hidden on desktop) */}
          <div className="md:hidden grid gap-2">
            {media?.data.map((m) => (
              <MediaCard key={m.id} item={m} />
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && !isLoading && (
        <div className="flex items-center justify-center gap-2 mt-4 text-sm">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-2 py-0.5 border rounded border-cream-300 dark:border-espresso-800 disabled:opacity-30 hover:border-ink-400 dark:hover:border-sand-500 disabled:hover:border-cream-300 dark:disabled:hover:border-espresso-800 transition-colors duration-100"
          >
            {'\u00AB'}
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-0.5 border rounded border-cream-300 dark:border-espresso-800 disabled:opacity-30 hover:border-ink-400 dark:hover:border-sand-500 disabled:hover:border-cream-300 dark:disabled:hover:border-espresso-800 transition-colors duration-100"
          >
            {'\u2039'}
          </button>
          <span className="px-3 text-ink-400 dark:text-sand-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2 py-0.5 border rounded border-cream-300 dark:border-espresso-800 disabled:opacity-30 hover:border-ink-400 dark:hover:border-sand-500 disabled:hover:border-cream-300 dark:disabled:hover:border-espresso-800 transition-colors duration-100"
          >
            {'\u203A'}
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="px-2 py-0.5 border rounded border-cream-300 dark:border-espresso-800 disabled:opacity-30 hover:border-ink-400 dark:hover:border-sand-500 disabled:hover:border-cream-300 dark:disabled:hover:border-espresso-800 transition-colors duration-100"
          >
            {'\u00BB'}
          </button>
        </div>
      )}
    </div>
  )
}
