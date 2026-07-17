import { useEffect, useState } from 'react'
import { DEMO_DATA as DEMO_LEADS } from '../tabs/Leads'
import { DEMO_DATA as DEMO_CONTRACTS } from '../tabs/Contracts'

const NAV_ITEMS = [
  { tab: 'dashboard', icon: '📊', label: 'ダッシュボード' },
  { tab: 'sales',     icon: '💴', label: '売上管理' },
  { tab: 'adcost',    icon: '📣', label: '広告費' },
  { tab: 'leads',     icon: '📥', label: 'リード管理' },
  { tab: 'contracts', icon: '✅', label: '成約管理' },
  { tab: 'follow',    icon: '🎯', label: '追客' },
  { tab: 'aircon',    icon: '❄️', label: 'エアコン依頼' },
  { tab: 'cardboard', icon: '📦', label: '段ボール配達' },
  { tab: 'call',      icon: '📞', label: '架電機能', mark: '未' },
  { tab: 'estimate',  icon: '📝', label: '見積書', mark: '未' },
  { tab: 'schedule',  icon: '📅', label: '月カレンダー', mark: '未' },
  { tab: 'board',     icon: '🚚', label: '配車ボード', mark: '未' },
  { tab: 'settings',  icon: '⚙️', label: '設定' },
  { tab: 'debug',     icon: '🧪', label: 'デバッグ', dev: true },
  { tab: 'debugreq',  icon: '🐛', label: 'デバッグ依頼', dev: true },
]

export default function Sidebar({ activeTab, onTabChange, isOpen, user, onLogout }) {
  // 会社名ブランディング（未指定はトランスポート福岡）／開発者向けタブ(dev)はデモ・hideDevで非表示
  const companyName = user?.company || 'トランスポート福岡'
  const hideDev = user?.hideDev || user?.mode === 'demo'
  const navItems = NAV_ITEMS.filter(item => !(hideDev && item.dev))
  const isDemo = user?.mode === 'demo'

  // 追客タブの右に表示する残追客数（要追客のリード＋成約の件数）。
  // ポーリングはせず、タブを切り替えた（＝リード/成約タブでの変更が一段落した）タイミングでだけ数え直す。
  const [followCount, setFollowCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    const compute = async () => {
      if (isDemo) {
        const n = DEMO_LEADS.filter(l => l.status === '要追客').length + DEMO_CONTRACTS.filter(c => c.status === '要追客').length
        if (!cancelled) setFollowCount(n)
        return
      }
      try {
        const [leadsRes, contractsRes] = await Promise.all([
          fetch('/api/inbound').then(r => r.json()).catch(() => ({ items: [] })),
          fetch('/api/contracts').then(r => r.json()).catch(() => ({ items: [] })),
        ])
        const n = (leadsRes.items || []).filter(l => l.status === '要追客').length +
                  (contractsRes.items || []).filter(c => c.status === '要追客').length
        if (!cancelled) setFollowCount(n)
      } catch { if (!cancelled) setFollowCount(0) }
    }
    compute()
    return () => { cancelled = true }
  }, [isDemo, activeTab])

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">🚛</div>
        <div className="logo-name">{companyName}</div>
        <div className="logo-sub">業務効率化システム</div>
      </div>

      <nav className="nav-section">
        <div className="nav-label">メインメニュー</div>
        {navItems.map(item => (
          <div
            key={item.tab}
            className={`nav-item ${activeTab === item.tab ? 'active' : ''}`}
            onClick={() => onTabChange(item.tab)}
          >
            <span className="ni-icon">{item.icon}</span>
            {item.label}
            {item.tab === 'follow' && followCount > 0 && <span className="ni-badge">{followCount}</span>}
            {item.badge && <span className="ni-badge">{item.badge}</span>}
            {item.mark && <span className="ni-mark">{item.mark}</span>}
          </div>
        ))}
      </nav>

      <div>
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
