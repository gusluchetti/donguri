import { createRoot } from 'react-dom/client'

const App = () => {
  return (
    <div>
      <ul>
        <li>home</li>
        <li>media</li>
      </ul>
      <div>

      </div>
    </div>
  )
}


const root = createRoot(document.getElementById('root')!)
root.render(<App />)
