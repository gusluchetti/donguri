import { useCallback, useEffect, useState } from "react"
import { api, MediaListResponse, MediaItem } from "../libs/api"
import { useStats, usePagination } from "../index"

const ITEMS_PER_PAGE = 50

// Type badge component with color coding
const TypeBadge = ({ type }: { type: string }) => {
  if (type === 'movie') {
    return <span className="font-medium dark:text-kanagawa-accent-orange light:text-kanagawa-light-accent-orange">MOV</span>
  }
  if (type === 'tv_series') {
    return <span className="font-medium dark:text-kanagawa-accent-cyan light:text-kanagawa-light-accent-cyan">TV</span>
  }
  if (type === 'anime') {
    return <span className="font-medium dark:text-kanagawa-accent-green light:text-kanagawa-light-accent-green">ANI</span>
  }
  return <span className="font-medium dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">{type.slice(0, 3).toUpperCase()}</span>
}

// External link badge
const LinkBadge = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    className="px-1 text-xs border rounded dark:border-kanagawa-bg-surface dark:text-kanagawa-text-secondary dark:hover:text-kanagawa-accent-blue dark:hover:border-kanagawa-accent-blue light:border-kanagawa-light-bg-surface light:text-kanagawa-light-text-secondary light:hover:text-kanagawa-light-accent-blue light:hover:border-kanagawa-light-accent-blue transition-colors duration-100"
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
    <tr className="group border-b dark:border-kanagawa-bg-surface light:border-kanagawa-light-bg-surface dark:hover:bg-kanagawa-bg-elevated light:hover:bg-kanagawa-light-bg-elevated transition-colors duration-100">
      {/* Title column spans both rows visually */}
      <td className="py-1.5 px-3 align-top">
        <div className="flex flex-col gap-0.5">
          <span className="dark:text-kanagawa-text-primary light:text-kanagawa-light-text-primary truncate max-w-xs" title={item.titleEn || undefined}>
            {item.titleEn || '-'}
          </span>
          {item.titleOriginal && item.titleOriginal !== item.titleEn && (
            <span className="text-xs dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary truncate max-w-xs" title={item.titleOriginal}>
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
      <td className="py-1.5 px-2 text-center align-top dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">
        {formatYear(item.startYear, item.endYear)}
      </td>
      {/* Episodes (hidden on tablet) */}
      <td className="py-1.5 px-2 text-center align-top dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary hidden lg:table-cell">
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
    <div className="p-3 border rounded dark:border-kanagawa-bg-surface dark:bg-kanagawa-bg-elevated light:border-kanagawa-light-bg-surface light:bg-kanagawa-light-bg-elevated">
      <div className="flex items-start justify-between gap-2 mb-1">
        <TypeBadge type={item.mediaType} />
        <span className="text-xs dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">
          {formatYear(item.startYear, item.endYear)}
        </span>
      </div>
      <div className="mb-2">
        <div className="font-medium truncate dark:text-kanagawa-text-primary light:text-kanagawa-light-text-primary" title={item.titleEn || undefined}>
          {item.titleEn || '-'}
        </div>
        {item.titleOriginal && item.titleOriginal !== item.titleEn && (
          <div className="text-xs truncate dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary" title={item.titleOriginal}>
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
          <span className="text-xs dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">
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
    <span className="dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary tui-loading">
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
        ? 'dark:bg-kanagawa-bg-surface dark:border-kanagawa-accent-cyan dark:text-kanagawa-accent-cyan light:bg-kanagawa-light-bg-surface light:border-kanagawa-light-accent-cyan light:text-kanagawa-light-accent-cyan'
        : 'dark:border-kanagawa-bg-surface dark:text-kanagawa-text-secondary dark:hover:border-kanagawa-text-secondary light:border-kanagawa-light-bg-surface light:text-kanagawa-light-text-secondary light:hover:border-kanagawa-light-text-secondary'
      }`}
  >
    {children}
  </button>
)

export const MediaCatalog = () => {
  const [media, setMedia] = useState<MediaListResponse>()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<'movie' | 'tv_series' | 'anime' | ''>('')
  const { setStats } = useStats()
  const { setPagination } = usePagination()

  // Fetch stats on mount
  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await api.api.media.stats.get()
      if (data) {
        setStats({
          total: data.total,
          movies: data.byType.movie || 0,
          tvSeries: data.byType.tv_series || 0,
          anime: data.byType.anime || 0,
        })
      }
    }
    fetchStats()
  }, [setStats])

  const fetchMedia = useCallback(async (searchQuery: string) => {
    setLoading(true)
    const { data } = await api.api.media.get({
      query: {
        page,
        limit: ITEMS_PER_PAGE,
        search: searchQuery || undefined,
        type: typeFilter || undefined,
      },
    })
    setMedia(data)
    setLoading(false)

    // Update pagination in status bar
    if (data?.pagination) {
      setPagination({
        page: data.pagination.page,
        totalPages: data.pagination.totalPages,
      })
    }
  }, [page, typeFilter, setPagination])

  // Fetch on page/filter/search changes with debounce for search
  useEffect(() => {
    // Skip if 1 character (wait for 2+ or empty to show all)
    if (search.length === 1) return

    const timer = setTimeout(() => {
      fetchMedia(search)
    }, search ? 250 : 0)

    return () => clearTimeout(timer)
  }, [search, page, typeFilter, fetchMedia])

  const pagination = media?.pagination
  const totalPages = pagination?.totalPages ?? 1

  return (
    <div className="px-4 py-3">
      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">/</span>
          <input
            type="text"
            placeholder="search (2+ chars)..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-full pl-6 pr-8 py-1.5 text-sm border rounded dark:bg-kanagawa-bg-base dark:border-kanagawa-bg-surface dark:text-kanagawa-text-primary dark:placeholder-kanagawa-text-secondary light:bg-kanagawa-light-bg-base light:border-kanagawa-light-bg-surface light:text-kanagawa-light-text-primary light:placeholder-kanagawa-light-text-secondary focus:outline-none dark:focus:border-kanagawa-accent-blue light:focus:border-kanagawa-light-accent-blue"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 dark:text-kanagawa-text-secondary dark:hover:text-kanagawa-text-primary light:text-kanagawa-light-text-secondary light:hover:text-kanagawa-light-text-primary"
            >
              x
            </button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-xs dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">filter:</span>
          <FilterButton active={typeFilter === ''} onClick={() => { setTypeFilter(''); setPage(1) }}>all</FilterButton>
          <FilterButton active={typeFilter === 'movie'} onClick={() => { setTypeFilter('movie'); setPage(1) }}>mov</FilterButton>
          <FilterButton active={typeFilter === 'tv_series'} onClick={() => { setTypeFilter('tv_series'); setPage(1) }}>tv</FilterButton>
          <FilterButton active={typeFilter === 'anime'} onClick={() => { setTypeFilter('anime'); setPage(1) }}>ani</FilterButton>
        </div>
      </div>

      {/* Results info */}
      {pagination && !loading && (
        <div className="mb-3 text-xs dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">
          showing {media?.data.length ?? 0} of {pagination.total.toLocaleString()}
          {search && <span> matching "{search}"</span>}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {/* Desktop table (hidden on mobile) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-kanagawa-bg-surface light:border-kanagawa-light-bg-surface">
                  <th className="py-2 px-3 text-left font-medium dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">title</th>
                  <th className="py-2 px-2 text-center font-medium dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary w-16">type</th>
                  <th className="py-2 px-2 text-center font-medium dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary w-20">year</th>
                  <th className="py-2 px-2 text-center font-medium dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary w-24 hidden lg:table-cell">eps</th>
                  <th className="py-2 px-2 text-left font-medium dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary w-24">links</th>
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
      {totalPages > 1 && !loading && (
        <div className="flex items-center justify-center gap-2 mt-4 text-sm">
          <button
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="px-2 py-0.5 border rounded dark:border-kanagawa-bg-surface light:border-kanagawa-light-bg-surface disabled:opacity-30 dark:hover:border-kanagawa-text-secondary light:hover:border-kanagawa-light-text-secondary disabled:hover:border-kanagawa-bg-surface transition-colors duration-100"
          >
            {'\u00AB'}
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-0.5 border rounded dark:border-kanagawa-bg-surface light:border-kanagawa-light-bg-surface disabled:opacity-30 dark:hover:border-kanagawa-text-secondary light:hover:border-kanagawa-light-text-secondary disabled:hover:border-kanagawa-bg-surface transition-colors duration-100"
          >
            {'\u2039'}
          </button>
          <span className="px-3 dark:text-kanagawa-text-secondary light:text-kanagawa-light-text-secondary">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2 py-0.5 border rounded dark:border-kanagawa-bg-surface light:border-kanagawa-light-bg-surface disabled:opacity-30 dark:hover:border-kanagawa-text-secondary light:hover:border-kanagawa-light-text-secondary disabled:hover:border-kanagawa-bg-surface transition-colors duration-100"
          >
            {'\u203A'}
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            className="px-2 py-0.5 border rounded dark:border-kanagawa-bg-surface light:border-kanagawa-light-bg-surface disabled:opacity-30 dark:hover:border-kanagawa-text-secondary light:hover:border-kanagawa-light-text-secondary disabled:hover:border-kanagawa-bg-surface transition-colors duration-100"
          >
            {'\u00BB'}
          </button>
        </div>
      )}
    </div>
  )
}
