import { useState, useEffect, useMemo } from 'react'
import { autoAdCostForMonth } from '../lib/adcost'

const num = (v) => Number(v) || 0
const yen = (n) => '¥' + Math.round(num(n)).toLocaleString('ja-JP')

// "2026-06-15" / "2026/07/01 19:37" / "06/15" / "6/15" などから YYYY-MM のキーを得る
function monthKeyOf(dateStr) {
  const s = String(dateStr || '')
  let m = s.match(/^(\d{4})[-/](\d{1,2})/)   // YYYY-MM / YYYY/MM（価格.com対応）
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})/)        // MM/DD → 今年
  if (m) return `${new Date().getFullYear()}-${String(parseInt(m[1], 10)).padStart(2, '0')}`
  return null
}

// 旧／新フォーマット両対応の月次経費合計
function totalOfExp(ex) {
  if (!ex) return 0
  let t = 0
  if (ex.daily) {
    Object.values(ex.daily).forEach(row => {
      ;['samurai_single', 'samurai_family', 'kakaku', 'zubatto'].forEach(k => { t += num(row[k]) })
    })
  }
  if (ex.monthly) {
    ;['suumo', 'chirashi', 'other'].forEach(k => { t += num(ex.monthly[k]) })
  }
  if (!ex.daily && !ex.monthly) {
    ;['samurai_single', 'samurai_family', 'kakaku', 'zubatto', 'suumo', 'chirashi', 'other'].forEach(k => {
      if (ex[k] != null) t += num(ex[k])
    })
  }
  return t
}

// すべて架空のサンプル（氏名は「サンプル＋名」で実在しないと一目でわかる形）。
const DEMO_RECENT = [
  { name: 'サンプル 太郎', meta: '東区→博多区 / 2LDK / 6月15日', amount: '¥68,000', badge: 'bg', status: '成約済', color: '#1E5FA8', initial: 'サ', src: '引越し侍' },
  { name: 'サンプル 花子', meta: '南区→春日市 / 1K / 6月18日',   amount: '¥38,500', badge: 'bo', status: '見積済', color: '#0E8A7A', initial: 'サ', src: '価格.com' },
  { name: 'サンプル 一郎', meta: '北九州→中央区 / 3LDK / 6月22日',amount: '¥124,000',badge: 'bb', status: '交渉中', color: '#7C3AED', initial: 'サ', src: '比較ナビ' },
  { name: 'サンプル 二郎', meta: '博多区→東区 / 2DK / 6月20日',  amount: '¥52,000', badge: 'bp', status: '連絡待', color: '#EA580C', initial: 'サ', src: '自社HP' },
  { name: 'サンプル 三郎', meta: '糸島市→西区 / 1LDK / 6月25日', amount: '¥45,000', badge: 'bg', status: '成約済', color: '#D97706', initial: 'サ', src: '引越し侍' },
]

const DEMO_LEGEND = [
  { color: '#1E5FA8', name: '引越し侍',  val: 9, pct: '38%' },
  { color: '#0E8A7A', name: '価格.com', val: 5, pct: '21%' },
  { color: '#7C3AED', name: '比較ナビ',  val: 4, pct: '17%' },
  { color: '#EA580C', name: '自社HP',    val: 4, pct: '17%' },
  { color: '#94A3B8', name: '紹介',      val: 2, pct: '8%'  },
]

const MONTHS = ['1月','2月','3月','4月','5月','6月']
const VALS   = [820000,940000,780000,1050000,1054000,1248000]
const COLORS = ['#BFDBFE','#BFDBFE','#BFDBFE','#93C5FD','#60A5FA','#1E5FA8']

function EmptyState({ icon, text }) {
  return (
    <div style={{ textAlign:'center', padding:'32px 0', color:'#94A3B8' }}>
      <div style={{ fontSize:36, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:12 }}>{text}</div>
    </div>
  )
}

function BarChart({ labels = MONTHS, values = VALS } = {}) {
  const [animate, setAnimate] = useState(false)
  const max = Math.max(...values, 1)
  useEffect(() => { const t = setTimeout(() => setAnimate(true), 100); return () => clearTimeout(t) }, [labels.join(','), values.join(',')])
  // 直近月を一番濃く
  const palette = ['#BFDBFE', '#BFDBFE', '#BFDBFE', '#93C5FD', '#60A5FA', '#1E5FA8']
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:120, paddingBottom:22, position:'relative', borderBottom:'1px solid #E2E8F0' }}>
      {labels.map((m, i) => {
        const v = values[i] || 0
        const pct = (v / max * 100).toFixed(1)
        return (
          <div key={m + i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', position:'relative', height:'100%' }}>
            <div style={{ width:'100%', borderRadius:'5px 5px 0 0', position:'absolute', bottom:0, height: animate ? `${pct}%` : 0, background: palette[i] || '#1E5FA8', transition:'height .8s cubic-bezier(.34,1.56,.64,1)' }} />
            <span style={{ position:'absolute', bottom:-20, fontSize:9, color:'#64748B' }}>{m}</span>
            <span style={{ position:'absolute', top:-16, fontSize:9, fontWeight:700, whiteSpace:'nowrap' }}>{v > 0 ? `¥${(v/10000).toFixed(0)}万` : '—'}</span>
          </div>
        )
      })}
    </div>
  )
}

// 流入元の円グラフ（直近の流入元を上位5つまで）
const SRC_COLORS = ['#1E5FA8', '#0E8A7A', '#7C3AED', '#EA580C', '#D97706', '#94A3B8']
function DonutChart({ legend, total }) {
  // legend: [{ name, val, pct }]
  if (!legend.length) return null
  let acc = 0
  return (
    <div style={{ display:'flex', gap:16, alignItems:'center' }}>
      <svg width="96" height="96" viewBox="0 0 36 36" style={{ flexShrink:0 }}>
        <circle r="15.9" cx="18" cy="18" fill="none" stroke="#E2E8F0" strokeWidth="3.5"/>
        {legend.map((l, i) => {
          const dash = l.pctNum
          const offset = -acc + 25 // 25 で12時開始
          acc += dash
          return (
            <circle key={l.name} r="15.9" cx="18" cy="18" fill="none"
              stroke={SRC_COLORS[i % SRC_COLORS.length]} strokeWidth="3.5"
              strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={offset} />
          )
        })}
        <text x="18" y="21" textAnchor="middle" fontSize="6.5" fontWeight="900" fill="#1E293B">{total}件</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1 }}>
        {legend.map((l, i) => (
          <div key={l.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
            <div style={{ width:9, height:9, borderRadius:'50%', background: SRC_COLORS[i % SRC_COLORS.length], flexShrink:0 }} />
            <span style={{ flex:1, color:'#64748B' }}>{l.name}</span>
            <b>{l.val}</b><span style={{ color:'#94A3B8' }}>{l.pct}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LiveDashboard({ switchTab }) {
  const [contracts, setContracts] = useState([])
  const [leads, setLeads]         = useState([])
  const [expenses, setExpenses]   = useState({})
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoading(true)
      try {
        const [c, l, e] = await Promise.all([
          fetch('/api/contracts').then(r => r.json()).catch(() => ({ items: [] })),
          fetch('/api/inbound').then(r => r.json()).catch(() => ({ items: [] })),
          fetch('/api/expenses').then(r => r.json()).catch(() => ({ data: {} })),
        ])
        if (!alive) return
        setContracts(c.items || [])
        setLeads(l.items || [])
        setExpenses(e.data || {})
      } catch (err) { console.error(err) }
      finally { if (alive) setLoading(false) }
    }
    load()
    return () => { alive = false }
  }, [])

  // 当月キーと直近6ヶ月のキー
  const now = new Date()
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const last6 = useMemo(() => {
    const d = new Date()
    const out = []
    for (let i = 0; i < 6; i++) {
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${d.getMonth() + 1}月`,
      })
      d.setMonth(d.getMonth() - 1)
    }
    return out.reverse() // 古い→新しい
  }, [])

  // KPI集計
  const monthly = useMemo(() => {
    // 成約は「売り上げ登録日」優先で当月判定（無ければ引越し日）。売上管理タブと整合。
    const ofMonth = (rows) => rows.filter(r => monthKeyOf(r.salesDate || r.date || r.receivedAt || r.savedAt) === thisMonthKey)
    const monthContracts = ofMonth(contracts)
    const ofMonthLeads = leads.filter(l => {
      const k = monthKeyOf(l.receivedAt) || monthKeyOf(l.savedAt)
      return k === thisMonthKey
    })
    const salesAmt = monthContracts
      .filter(c => c.status === '成約済み')
      .reduce((s, c) => s + num(c.amount), 0)
    const closedCount = monthContracts.filter(c => c.status === '成約済み').length
    const inquiryCount = ofMonthLeads.length
    // 広告費（経費）はリードから自動算出した当月の最新合計（保存待ちを避ける）。対象外月は保存済み合計。
    const auto = autoAdCostForMonth(leads, thisMonthKey)
    const expAmt = auto ? auto.total : totalOfExp(expenses[thisMonthKey])
    return { salesAmt, closedCount, inquiryCount, expAmt, monthContracts }
  }, [contracts, leads, expenses, thisMonthKey])

  // 月次推移（直近6ヶ月の売上）
  const monthlyTrend = useMemo(() => {
    const map = Object.fromEntries(last6.map(m => [m.key, 0]))
    contracts.forEach(c => {
      if (c.status !== '成約済み') return
      const k = monthKeyOf(c.salesDate || c.date) // 売り上げ登録日で計上月を決める
      if (k && map[k] != null) map[k] += num(c.amount)
    })
    return { labels: last6.map(m => m.label), values: last6.map(m => map[m.key]) }
  }, [contracts, last6])

  // 成約の流入元（今月の成約から件数集計）
  const sourceLegend = useMemo(() => {
    const closed = monthly.monthContracts.filter(c => c.status === '成約済み')
    const acc = {}
    closed.forEach(c => {
      const k = c.srcLabel || 'その他'
      acc[k] = (acc[k] || 0) + 1
    })
    const total = closed.length
    const entries = Object.entries(acc).sort((a, b) => b[1] - a[1])
    const top = entries.slice(0, 5)
    const others = entries.slice(5).reduce((s, [, v]) => s + v, 0)
    const list = top.map(([name, val]) => {
      const pctNum = total > 0 ? (val / total * 100) : 0
      return { name, val, pctNum, pct: `${Math.round(pctNum)}%` }
    })
    if (others > 0) {
      const pctNum = (others / total * 100)
      list.push({ name: 'その他', val: others, pctNum, pct: `${Math.round(pctNum)}%` })
    }
    return { list, total }
  }, [monthly])

  // 最新案件（直近5件）
  const recent = useMemo(() => {
    return [...contracts]
      .sort((a, b) => String(b.salesDate || b.date).localeCompare(String(a.salesDate || a.date)))
      .slice(0, 5)
  }, [contracts])

  if (loading) {
    return (
      <div>
        <div className="page-hdr"><h1>ダッシュボード</h1><p>読み込み中...</p></div>
      </div>
    )
  }

  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`

  return (
    <div>
      <div className="page-hdr"><h1>ダッシュボード</h1><p>{monthLabel} 月次サマリー（成約管理・リード・経費の自動集計）</p></div>

      <div className="kpi-row kpi-4">
        <div className="kpi-card c-blue">
          <div className="kpi-label">今月の売上</div>
          <div className="kpi-val">{yen(monthly.salesAmt)}</div>
          <div className="kpi-change" style={{ color: '#94A3B8' }}>{monthly.salesAmt > 0 ? `${monthly.closedCount}件 成約済` : 'データなし'}</div>
        </div>
        <div className="kpi-card c-green">
          <div className="kpi-label">成約件数</div>
          <div className="kpi-val">{monthly.closedCount}<span>件</span></div>
        </div>
        <div className="kpi-card c-orange">
          <div className="kpi-label">問い合わせ</div>
          <div className="kpi-val">{monthly.inquiryCount}<span>件</span></div>
        </div>
        <div className="kpi-card c-purple">
          <div className="kpi-label">今月の経費</div>
          <div className="kpi-val">{yen(monthly.expAmt)}</div>
          <div className="kpi-change" style={{ color: '#94A3B8' }}>{monthly.expAmt > 0 ? '掲載費の月合計' : '未入力'}</div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head"><h3>月次売上推移</h3><span className="c-sub">直近6ヶ月</span></div>
          <div className="card-body">
            {monthlyTrend.values.some(v => v > 0)
              ? <BarChart labels={monthlyTrend.labels} values={monthlyTrend.values} />
              : <EmptyState icon="📊" text="成約管理に「成約済み」案件を追加すると表示されます" />}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>成約の流入元</h3><span className="c-sub">{monthLabel} {sourceLegend.total}件</span></div>
          <div className="card-body">
            {sourceLegend.list.length > 0
              ? <DonutChart legend={sourceLegend.list} total={sourceLegend.total} />
              : <EmptyState icon="🥧" text="今月の成約データが入ると表示されます" />}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>最新案件</h3>
          <span className="c-sub">直近5件 ／ <a onClick={() => switchTab && switchTab('contracts')} style={{ color: '#1E5FA8', cursor: 'pointer', fontWeight: 700 }}>成約管理へ</a></span>
        </div>
        <div className="card-body" style={{ padding: '4px 16px' }}>
          {recent.length === 0 ? (
            <EmptyState icon="📋" text="成約管理タブから案件を追加してください" />
          ) : recent.map(r => {
            const initial = (r.name || '?').slice(0, 1)
            const statusBadge = ({ '成約済み': 'bg', '交渉中': 'bb', '見積済み': 'bo', '連絡待ち': 'bp', '失注': 'br' })[r.status] || 'bk'
            const color = ({ '成約済み': '#16A34A', '交渉中': '#1E5FA8', '見積済み': '#EA580C', '連絡待ち': '#7C3AED', '失注': '#DC2626' })[r.status] || '#64748B'
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #E2E8F0' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{r.name} 様</div>
                  <div style={{ fontSize: 10, color: '#64748B', marginTop: 1 }}>{[r.route, r.salesDate || r.date].filter(Boolean).join(' / ')}</div>
                </div>
                <span className={`badge ${statusBadge}`}>{r.status || '—'}</span>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{yen(r.amount)}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{r.srcLabel || '—'}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ user, switchTab }) {
  const isDemo = user?.mode === 'demo'

  // ===== LIVE モード =====
  if (!isDemo) {
    return <LiveDashboard switchTab={switchTab} />
  }

  // ===== DEMO モード =====
  return (
    <div>
      <div className="page-hdr"><h1>ダッシュボード</h1><p>2025年6月 — 月次サマリー（デモデータ）</p></div>
      <div className="kpi-row kpi-4">
        <div className="kpi-card c-blue"><div className="kpi-label">今月の売上</div><div className="kpi-val">¥1,248,000</div><div className="kpi-change up">▲ 前月比 +18.4%</div></div>
        <div className="kpi-card c-green"><div className="kpi-label">成約件数</div><div className="kpi-val">24<span>件</span></div><div className="kpi-change up">▲ 前月比 +6件</div></div>
        <div className="kpi-card c-orange"><div className="kpi-label">問い合わせ</div><div className="kpi-val">67<span>件</span></div><div className="kpi-change up">▲ 前月比 +12件</div></div>
        <div className="kpi-card c-purple"><div className="kpi-label">今月の経費</div><div className="kpi-val">¥342,800</div><div className="kpi-change down">▼ 前月比 +2.1%</div></div>
      </div>
      <div className="two-col">
        <div className="card">
          <div className="card-head"><h3>月次売上推移</h3><span className="c-sub">直近6ヶ月</span></div>
          <div className="card-body">
            <BarChart />
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>成約の流入元</h3><span className="c-sub">今月 24件</span></div>
          <div className="card-body">
            <div style={{ display:'flex', gap:16, alignItems:'center' }}>
              <svg width="96" height="96" viewBox="0 0 36 36" style={{ flexShrink:0 }}>
                <circle r="15.9" cx="18" cy="18" fill="none" stroke="#E2E8F0" strokeWidth="3.5"/>
                <circle r="15.9" cx="18" cy="18" fill="none" stroke="#1E5FA8" strokeWidth="3.5" strokeDasharray="37.5 62.5" strokeDashoffset="25"/>
                <circle r="15.9" cx="18" cy="18" fill="none" stroke="#0E8A7A" strokeWidth="3.5" strokeDasharray="22 78" strokeDashoffset="-12.5"/>
                <circle r="15.9" cx="18" cy="18" fill="none" stroke="#7C3AED" strokeWidth="3.5" strokeDasharray="17 83" strokeDashoffset="-34.5"/>
                <circle r="15.9" cx="18" cy="18" fill="none" stroke="#EA580C" strokeWidth="3.5" strokeDasharray="8 92" strokeDashoffset="-51.5"/>
                <text x="18" y="21" textAnchor="middle" fontSize="6.5" fontWeight="900" fill="#1E293B">24件</text>
              </svg>
              <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1 }}>
                {DEMO_LEGEND.map(l => (
                  <div key={l.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:l.color, flexShrink:0 }} />
                    <span style={{ flex:1, color:'#64748B' }}>{l.name}</span>
                    <b>{l.val}</b><span style={{ color:'#94A3B8' }}>{l.pct}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>最新案件</h3><span className="c-sub">直近5件</span></div>
        <div className="card-body" style={{ padding:'4px 16px' }}>
          {DEMO_RECENT.map(r => (
            <div key={r.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid #E2E8F0' }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:r.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>{r.initial}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{r.name} 様</div>
                <div style={{ fontSize:10, color:'#64748B', marginTop:1 }}>{r.meta}</div>
              </div>
              <span className={`badge ${r.badge}`}>{r.status}</span>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:12, fontWeight:700 }}>{r.amount}</div>
                <div style={{ fontSize:10, color:'#94A3B8' }}>{r.src}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
