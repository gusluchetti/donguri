import { createRoot } from 'react-dom/client'
import { Route, Link, Switch } from 'wouter'
import { Tracking } from './components/Tracking'
import { MediaCatalog } from './components/MediaCatalog'

const App = () => {
  return (
    <div>
      <nav>
        <Link href="/">Tracking</Link>
        <Link href="/catalog">Catalog</Link>
      </nav>
      <Switch>
        <Route path="/" component={Tracking} />
        <Route path="/catalog" component={MediaCatalog} />
      </Switch>
    </div>
  )
}


const root = createRoot(document.getElementById('root')!)
root.render(<App />)
