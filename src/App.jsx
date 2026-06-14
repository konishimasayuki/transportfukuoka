import { useState, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import MobileNav from './components/MobileNav'
import Dashboard from './tabs/Dashboard'
import Sales from './tabs/Sales'
import Contracts from './tabs/Contracts'
import Cases from './tabs/Cases'
import Call from './tabs/Call'
import Settings from './tabs/Settings'

const TABS = { dashboard: Dashboard, sales: Sales, contracts: Contracts, cases: Cases, call: Call, settings: Settings }

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const switchTab = useCallback((tab) => {
    setLoading(true)
    setActiveTab(tab)
    setSidebarOpen(false)
    setTimeout(() => setLoading(false), 500)
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    setTimeout(() => setLoading(false), 600)
  }, [])

  const ActiveTab = TABS[activeTab]

  return (
    <div className="app">
      {/* Overlay (mobile) */}
      <div
        className={`overlay ${sidebarOpen ? 'show' : ''}`}
        style={{ display: sidebarOpen ? 'block' : 'none' }}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar activeTab={activeTab} onTabChange={switchTab} isOpen={sidebarOpen} />

      <div className="main">
        <Topbar
          activeTab={activeTab}
          onMenuClick={() => setSidebarOpen(true)}
          onRefresh={refresh}
          loading={loading}
        />
        <div className="content">
          <ActiveTab />
        </div>
      </div>

      <MobileNav activeTab={activeTab} onTabChange={switchTab} />
    </div>
  )
}
