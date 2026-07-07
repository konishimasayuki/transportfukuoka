// 業務フローナビ：リード管理 → 成約管理 → 月カレンダー → 配車ボード の一連の流れを
// 各ページ上部に表示し、現在地の明示と「次へ」ワンクリック遷移でユーザビリティを高める。
// 見積書など本流以外のページからは nextTab/nextText で配車ボード等へのショートカットを出す。
const FLOW = [
  { tab: 'leads',     label: 'リード管理',   icon: '📥' },
  { tab: 'contracts', label: '成約管理',     icon: '✅' },
  { tab: 'schedule',  label: '月カレンダー', icon: '📅' },
  { tab: 'board',     label: '配車ボード',   icon: '🚚' },
]

export default function FlowNav({ switchTab, current, nextTab, nextText }) {
  const go = (tab) => { if (typeof switchTab === 'function') switchTab(tab) }
  const idx = FLOW.findIndex(s => s.tab === current)
  let next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null
  if (nextTab) next = FLOW.find(s => s.tab === nextTab) || { tab: nextTab, label: nextTab }

  return (
    <div className="flownav">
      <div className="flownav-chain">
        {FLOW.map((s, i) => (
          <span key={s.tab} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              className={'flownav-step' + (s.tab === current ? ' cur' : '') + (idx >= 0 && i < idx ? ' done' : '')}
              onClick={() => go(s.tab)} title={`${s.label}へ移動`}>
              <span className="fn-ic">{s.icon}</span>{s.label}
            </button>
            {i < FLOW.length - 1 && <span className="flownav-arrow">›</span>}
          </span>
        ))}
      </div>
      {next && (
        <button className="btn btn-primary btn-sm flownav-next" onClick={() => go(next.tab)}>
          {nextText || `次へ：${next.label} →`}
        </button>
      )}
    </div>
  )
}
