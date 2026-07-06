import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import LeadNotifier from './components/LeadNotifier'
import Login from './tabs/Login'
import Dashboard from './tabs/Dashboard'
import Sales from './tabs/Sales'
import AdCost from './tabs/AdCost'
import Contracts from './tabs/Contracts'
import Leads from './tabs/Leads'
import Call from './tabs/Call'
import Estimate from './tabs/Estimate'
import Schedule from './tabs/Schedule'
import Settings from './tabs/Settings'
import Debug from './tabs/Debug'

const TABS = {
  dashboard: Dashboard,
  sales: Sales,
  adcost: AdCost,
  contracts: Contracts,
  leads: Leads,
  call: Call,
  estimate: Estimate,
  schedule: Schedule,
  settings: Settings,
  debug: Debug,
}

const USERS = {
  a: { id: 'a', name: 'デモユーザー', mode: 'demo' },
  b: { id: 'b', name: 'トランスポート福岡', mode: 'live' },
  // 東部生コン(株)向けデモ：DB非依存(mode:'demo')・開発者(デバッグ)非表示・会社名ブランディング。
  // 会社名以外は全て架空。
  z: { id: 'z', name: '東部生コン株式会社', mode: 'demo', company: '東部生コン(株)', hideDev: true },
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

  // 開発者(デバッグ)非表示ユーザーは debug に入れない（ガード）
  const safeTab = (user.hideDev && activeTab === 'debug') ? 'dashboard' : activeTab
  const ActiveTab = TABS[safeTab] || Dashboard

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
      <LeadNotifier user={user} switchTab={switchTab} />
    </div>
  )
}
