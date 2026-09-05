import { useEffect, useState } from 'react'
import { ensureSeed } from './lib/db'
import { applySetupLink, startAutoSync } from './lib/autosync'
import { ToastProvider, go, useHash } from './components/ui'
import Today from './pages/Today'
import Batches from './pages/Batches'
import BatchForm from './pages/BatchForm'
import BatchDetail from './pages/BatchDetail'
import Settings from './pages/Settings'
import Customers from './pages/Customers'

function Nav({ path }: { path: string }) {
  const item = (to: string, ico: string, label: string, match: (p: string) => boolean) => (
    <a href={'#' + to} className={match(path) ? 'active' : ''}>
      <span className="ico">{ico}</span>
      {label}
    </a>
  )
  return (
    <nav className="bottomnav">
      {item('/', '☀️', '今日', (p) => p === '/')}
      {item('/batches', '🌱', '批次', (p) => p.startsWith('/batch'))}
      {item('/customers', '👤', '客戶', (p) => p.startsWith('/customers'))}
      {item('/settings', '⚙️', '設定', (p) => p.startsWith('/settings'))}
    </nav>
  )
}

export default function App() {
  const path = useHash()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    ensureSeed().then(applySetupLink).then(() => { setReady(true); startAutoSync() })
  }, [])
  if (!ready) return null

  let page: JSX.Element
  let showNav = true
  if (path === '/') page = <Today />
  else if (path === '/batches') page = <Batches />
  else if (path === '/batch/new') { page = <BatchForm />; showNav = false }
  else if (/^\/batch\/[^/]+\/edit$/.test(path)) { page = <BatchForm id={path.split('/')[2]} />; showNav = false }
  else if (/^\/batch\/[^/]+$/.test(path)) { page = <BatchDetail id={path.split('/')[2]} />; showNav = false }
  else if (path === '/customers') page = <Customers />
  else if (path.startsWith('/settings')) page = <Settings sub={path.split('/')[2]} />
  else page = <Today />

  return (
    <ToastProvider>
      {page}
      {showNav && <Nav path={path} />}
      {showNav && (path === '/' || path === '/batches') && (
        <button className="fab" aria-label="新增批次" onClick={() => go('/batch/new')}>+</button>
      )}
    </ToastProvider>
  )
}
