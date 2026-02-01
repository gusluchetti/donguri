import { createRoot } from 'react-dom/client'
import { api } from './libs/api'
import { useEffect, useState } from 'react'

type MediaResponse =
  Awaited<ReturnType<typeof api.api.media.get>>['data'];

const App = () => {
  const [media, setMedia] = useState<MediaResponse>()

  useEffect(() => {
    const callApi = async () => {
      const { data, error } = await api.api.media.get()
      setMedia(data)
    }

    callApi()
  }, [])

  return (
    <div>
      <p>
        hello elysia (client)
      </p>
      <ul>
        {media?.data.map(m => {
          return (
            <li>{m.titleEn}</li>
          )
        })}
        {}
      </ul>
    </div>
  )
}


const root = createRoot(document.getElementById('root')!)
root.render(<App />)
