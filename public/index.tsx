import { createRoot } from 'react-dom/client'
import { api, MediaListResponse } from './libs/api'
import { useEffect, useState, useCallback } from 'react'

const ITEMS_PER_PAGE = 100

const App = () => {
  const [media, setMedia] = useState<MediaListResponse>()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<'movie' | 'tv_series' | 'anime' | ''>('')

  const fetchMedia = useCallback(async () => {
    setLoading(true)
    const { data } = await api.api.media.get({
      query: {
        page,
        limit: ITEMS_PER_PAGE,
        search: search || undefined,
        type: typeFilter || undefined,
      },
    })
    setMedia(data)
    setLoading(false)
  }, [page, search, typeFilter])

  useEffect(() => {
    fetchMedia()
  }, [fetchMedia])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const pagination = media?.pagination
  const totalPages = pagination?.totalPages ?? 1

  return (
    <div>
      <h1>Media Catalog</h1>

      <form onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Search titles..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit">Search</button>
        {search && (
          <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1) }}>
            Clear
          </button>
        )}
      </form>

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


const root = createRoot(document.getElementById('root')!)
root.render(<App />)
