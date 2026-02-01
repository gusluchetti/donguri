import { createRoot } from 'react-dom/client'
import { api } from './libs/api'
import { useEffect } from 'react'

const App = () => {
  useEffect(() => {
    const callApi = async () => {
      const resp = await api.hi.get()
      console.log(resp)
    }

    callApi()
  }, [])

  return (
    <div>
      <p>
        hello elysia (client)
      </p>
    </div>
  )
}


const root = createRoot(document.getElementById('root')!)
root.render(<App />)
