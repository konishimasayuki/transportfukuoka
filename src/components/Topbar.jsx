const TITLES = {
  dashboard: 'ダッシュボード',
  sales:     '売上管理',
  contracts: '成約管理',
  cases:     '案件管理',
  call:      '架電機能',
  settings:  '設定',
}

export default function Topbar({ activeTab, onMenuClick, onRefresh, loading }) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <>
      <div className="topbar">
        <div className="tb-left">
          <button className="menu-btn" onClick={onMenuClick}>☰</button>
          <div className="topbar-title">{TITLES[activeTab]}</div>
        </div>
        <div className="tb-right">
          <span className="topbar-date">{dateStr}</span>
          <button className="topbar-btn" onClick={onRefresh}>⟳ 更新</button>
        </div>
      </div>
      <div className={`loading-bar ${loading ? 'run' : ''}`} />
    </>
  )
}
