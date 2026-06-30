const TITLES = {
  dashboard: 'ダッシュボード',
  sales:     '売上管理',
  adcost:    '広告費',
  contracts: '成約管理',
  leads:     'リード管理',
  call:      '架電機能',
  estimate:  '見積書',
  settings:  '設定',
}

export default function Topbar({ activeTab, onMenuClick, onRefresh, loading, user }) {
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
          {user?.mode === 'demo' && (
            <span style={{
              background: '#FEF3C7', color: '#92400E', fontSize: 10, fontWeight: 700,
              padding: '3px 8px', borderRadius: 20, border: '1px solid #FCD34D',
            }}>デモ</span>
          )}
          <button className="topbar-btn" onClick={onRefresh}>⟳ 更新</button>
        </div>
      </div>
      <div className={`loading-bar ${loading ? 'run' : ''}`} />
    </>
  )
}
