const NAV_ITEMS = [
  { tab: 'dashboard', icon: '📊', label: 'ダッシュボード' },
  { tab: 'sales',     icon: '💴', label: '売上管理' },
  { tab: 'adcost',    icon: '📣', label: '広告費' },
  { tab: 'contracts', icon: '✅', label: '成約管理' },
  { tab: 'leads',     icon: '📥', label: 'リード管理' },
  { tab: 'call',      icon: '📞', label: '架電機能' },
  { tab: 'estimate',  icon: '📝', label: '見積書', isNew: true },
  { tab: 'settings',  icon: '⚙️', label: '設定' },
]

export default function Sidebar({ activeTab, onTabChange, isOpen, user, onLogout }) {
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

      <div style={{ marginTop: 'auto' }}>
        <div
          onClick={onLogout}
          style={{
            padding: '12px 16px', cursor: 'pointer',
            color: 'rgba(255,255,255,.4)', fontSize: 13, fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 10,
            borderTop: '1px solid rgba(255,255,255,.08)',
            transition: 'all .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,.4)'}
        >
          <span style={{ fontSize: 16 }}>🚪</span>ログアウト
        </div>
        <div className="sidebar-footer">デモ版 v1.0 &nbsp;|&nbsp; 2025年6月</div>
      </div>
    </aside>
  )
}
