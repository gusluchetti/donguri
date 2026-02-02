import { useCallback, useEffect, useState } from "react"
import { api, MediaListResponse } from "../libs/api"

const ITEMS_PER_PAGE = 100

export const Media = () => {
  const [media, setMedia] = useState<MediaListResponse>()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<'movie' | 'tv_series' | 'anime' | ''>('')

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
  }, [page, typeFilter])

  // Debounced search effect
  useEffect(() => {
    // Skip if 1 character (wait for 2+ or empty to show all)
    if (search.length === 1) return

    const timer = setTimeout(() => {
      setPage(1)
      fetchMedia(search)
    }, 250)

    return () => clearTimeout(timer)
  }, [search])

  // Fetch on page/filter changes
  useEffect(() => {
    fetchMedia(search)
  }, [page, typeFilter])

  const pagination = media?.pagination
  const totalPages = pagination?.totalPages ?? 1

  return (
    <div>
      <h1>Media Catalog</h1>

      <div>
        <input
          type="text"
          placeholder="Search titles (2+ chars)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      <div>
        <label>
          Filter by type:{' '}
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as typeof typeFilter)
              setPage(1)
            }}
          >
            <option value="">All</option>
            <option value="movie">Movie</option>
            <option value="tv_series">TV Series</option>
            <option value="anime">Anime</option>
          </select>
        </label>
      </div>

      {pagination && (
        <p>
          Showing {media?.data.length ?? 0} of {pagination.total} items
          {search && ` matching "${search}"`}
        </p>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Title (EN)</th>
              <th>Original Title</th>
              <th>Type</th>
              <th>Year</th>
              <th>IMDb</th>
              <th>MAL</th>
            </tr>
          </thead>
          <tbody>
            {media?.data.map((m) => (
              <tr key={m.id}>
                <td>{m.titleEn || '-'}</td>
                <td>{m.titleOriginal || '-'}</td>
                <td>{m.mediaType}</td>
                <td>
                  {m.startYear}
                  {m.endYear && m.endYear !== m.startYear ? `–${m.endYear}` : ''}
                </td>
                <td>
                  {m.imdbId ? (
                    <a href={`https://www.imdb.com/title/${m.imdbId}`} target="_blank" rel="noreferrer">
                      {m.imdbId}
                    </a>
                  ) : '-'}
                </td>
                <td>
                  {m.malId ? (
                    <a href={`https://myanimelist.net/anime/${m.malId}`} target="_blank" rel="noreferrer">
                      {m.malId}
                    </a>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div>
          <button onClick={() => setPage(1)} disabled={page === 1}>
            First
          </button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </button>
          <span>
            {' '}Page {page} of {totalPages}{' '}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next
          </button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            Last
          </button>
        </div>
      )}
    </div>
  )
}
