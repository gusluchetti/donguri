import { createRoot } from 'react-dom/client'

const App = () => {
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
