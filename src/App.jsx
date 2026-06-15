import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import MobileNav from './components/MobileNav'
import Login from './tabs/Login'
import Dashboard from './tabs/Dashboard'
import Sales from './tabs/Sales'
import Contracts from './tabs/Contracts'
import Cases from './tabs/Cases'
import Call from './tabs/Call'
import Settings from './tabs/Settings'
 
const TABS = {
  dashboard: Dashboard,
  sales: Sales,
  contracts: Contracts,
  cases: Cases,
  call: Call,
  settings: Settings,
}

// ユーザー定義
const USERS = {
  a: { id: 'a', name: 'デモユーザー', mode: 'demo' },
  b: { id: 'b', name: 'トランスポート福岡', mode: 'live' },
}

export default function App() {
  const [user, setUser]         = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading]   = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogin = useCallback((u) => {
    setUser(u)
    setActiveTab('dashboard')
  }, [])

  const handleLogout = useCallback(() => {
    setUser(null)
    setActiveTab('dashboard')
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

  // 未ログイン
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
          <ActiveTab user={user} />
        </div>
      </div>
      <MobileNav activeTab={activeTab} onTabChange={switchTab} />
    </div>
  )
}
