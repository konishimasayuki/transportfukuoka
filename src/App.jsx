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
import DebugRequest from './tabs/DebugRequest'

const TABS = {
  dashboard: Dashboard,
  sales: Sales,
  adcost: AdCost,
  contracts: Contracts,
  follow: Contracts,     // 追客（成約管理の絞り込みビュー）
  aircon: Contracts,     // エアコン依頼
  cardboard: Contracts,  // 段ボール配達
  leads: Leads,
  call: Call,
  estimate: Estimate,
  schedule: Schedule,
  board: Schedule, // 配車ボード（Schedule と同一コンポーネント：view で切替、state は保持される）
  settings: Settings,
  debug: Debug,
  debugreq: DebugRequest,
}

const USERS = {
  a: { id: 'a', name: 'デモユーザー', mode: 'demo' },
  b: { id: 'b', name: 'トランスポート福岡', mode: 'live' },
  // 紹介デモ：DB非依存(mode:'demo')・開発者(デバッグ)非表示・ブランディング表示。
  // 表示名・データはすべて架空（実在の企業・人物ではありません）。
  z: { id: 'z', name: '引っ越し業者サポートシステム', mode: 'demo', company: '引っ越し業者サポートシステム', hideDev: true },
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
  // 初期タブ: URL に ?tab=xxx（既知タブ）があればそれを開く（チャットのデバッグ依頼リンク等の deep-link 用）
  const [activeTab, setActiveTab]     = useState(() => {
    try { const t = new URLSearchParams(window.location.search).get('tab'); if (t && TABS[t]) return t } catch { /* noop */ }
    return 'dashboard'
  })
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

  // 開発者(デバッグ)非表示ユーザー（デモ含む）は debug / debugreq に入れない（ガード）
  const isDevTab = activeTab === 'debug' || activeTab === 'debugreq'
  const safeTab = ((user.hideDev || user.mode === 'demo') && isDevTab) ? 'dashboard' : activeTab
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
          <ActiveTab user={user} switchTab={switchTab} view={safeTab === 'board' ? 'board' : 'month'} mode={['follow', 'aircon', 'cardboard'].includes(safeTab) ? safeTab : undefined} />
        </div>
      </div>
      <LeadNotifier user={user} switchTab={switchTab} />
    </div>
  )
}
