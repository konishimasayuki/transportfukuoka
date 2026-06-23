const NAV_ITEMS = [
  { tab: 'dashboard', icon: '📊', label: 'ダッシュボード' },
  { tab: 'sales',     icon: '💴', label: '売上管理' },
  { tab: 'contracts', icon: '✅', label: '成約管理' },
  { tab: 'cases',     icon: '📋', label: '案件管理', badge: 3 },
  { tab: 'leads',     icon: '📥', label: 'リード', isNew: true },
  { tab: 'call',      icon: '📞', label: '架電機能' },
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

      {/* ユーザー表示 */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,.08)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: user?.mode === 'demo' ? '#D97706' : '#1E5FA8',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>
          {user?.id?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)' }}>{user?.mode === 'demo' ? 'デモモード' : 'ライブモード'}</div>
        </div>
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
