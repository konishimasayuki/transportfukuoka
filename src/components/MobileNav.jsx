const NAV_ITEMS = [
  { tab: 'dashboard', icon: '📊', label: 'ダッシュ' },
  { tab: 'sales',     icon: '💴', label: '売上' },
  { tab: 'contracts', icon: '✅', label: '成約' },
  { tab: 'cases',     icon: '📋', label: '案件', dot: true },
  { tab: 'call',      icon: '📞', label: '架電' },
  { tab: 'settings',  icon: '⚙️', label: '設定' },
]

export default function MobileNav({ activeTab, onTabChange }) {
  return (
    <nav className="mobile-nav">
      {NAV_ITEMS.map(item => (
        <div
          key={item.tab}
          className={`mn-item ${activeTab === item.tab ? 'active' : ''}`}
          onClick={() => onTabChange(item.tab)}
        >
          <span className="mn-icon">{item.icon}</span>
          {item.label}
          {item.dot && <div className="mn-dot" />}
        </div>
      ))}
    </nav>
  )
}
