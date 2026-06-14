const NAV_ITEMS = [
  { tab: 'dashboard', icon: '📊', label: 'ダッシュボード' },
  { tab: 'sales',     icon: '💴', label: '売上管理' },
  { tab: 'contracts', icon: '✅', label: '成約管理' },
  { tab: 'cases',     icon: '📋', label: '案件管理', badge: 3 },
  { tab: 'call',      icon: '📞', label: '架電機能', isNew: true },
  { tab: 'settings',  icon: '⚙️', label: '設定' },
]

export default function Sidebar({ activeTab, onTabChange, isOpen }) {
  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">🚛</div>
        <div className="logo-name">トランスポート福岡</div>
        <div className="logo-sub">業務効率化システム</div>
      </div>

      <nav className="nav-section">
        <div className="nav-label">メインメニュー</div>
        {NAV_ITEMS.map(item => (
          <div
            key={item.tab}
            className={`nav-item ${activeTab === item.tab ? 'active' : ''}`}
            onClick={() => onTabChange(item.tab)}
          >
            <span className="ni-icon">{item.icon}</span>
            {item.label}
            {item.badge && <span className="ni-badge">{item.badge}</span>}
            {item.isNew && <span className="ni-new">NEW</span>}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">デモ版 v1.0 &nbsp;|&nbsp; 2025年6月</div>
    </aside>
  )
}
