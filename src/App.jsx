import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import MobileNav from './components/MobileNav'
import Login from './tabs/Login'
import Dashboard from './tabs/Dashboard'
import Sales from './tabs/Sales'
import Contracts from './tabs/Contracts'
import Leads from './tabs/Leads'
import Call from './tabs/Call'
import Estimate from './tabs/Estimate'
import Settings from './tabs/Settings'

const TABS = {
  dashboard: Dashboard,
  sales: Sales,
  contracts: Contracts,
  leads: Leads,
  call: Call,
  estimate: Estimate,
  settings: Settings,
}

const USERS = {
  a: { id: 'a', name: 'デモユーザー', mode: 'demo' },
  b: { id: 'b', name: 'トランスポート福岡', mode: 'live' },
}

const STORAGE_KEY = 'tf_user'

export default function App() {
  // localStorageからログイン状態を復元
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [activeTab, setActiveTab]     = useState('dashboard')
  const [loading, setLoading]         = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogin = useCallback((u) => {
    setUser(u)
    setActiveTab('dashboard')
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(u)) } catch {}
  }, [])

  const handleLogout = useCallback(() => {
    setUser(null)
    setActiveTab('dashboard')
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }, [])

  const switchTab = useCallback((tab) => {
    setLoading(true)
    setActiveTab(tab)
    setSidebarOpen(false)
    setTimeout(() => setLoading(false), 400)
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    setTimeout(() => setLoading(false), 500)
  }, [])

  if (!user) return <Login users={USERS} onLogin={handleLogin} />

  const ActiveTab = TABS[activeTab]

  return (
    <div className="app">
      <div
        className={`overlay ${sidebarOpen ? 'show' : ''}`}
        style={{ display: sidebarOpen ? 'block' : 'none' }}
        onClick={() => setSidebarOpen(false)}
      />
      <Sidebar activeTab={activeTab} onTabChange={switchTab} isOpen={sidebarOpen} user={user} onLogout={handleLogout} />
      <div className="main">
        <Topbar activeTab={activeTab} onMenuClick={() => setSidebarOpen(true)} onRefresh={refresh} loading={loading} user={user} />
        <div className="content">
          <ActiveTab user={user} switchTab={switchTab} />
        </div>
      </div>
      <MobileNav activeTab={activeTab} onTabChange={switchTab} onLogout={handleLogout} />
    </div>
  )
}
