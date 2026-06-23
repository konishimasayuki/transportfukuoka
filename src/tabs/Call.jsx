import { useState, useEffect } from 'react'

const DEMO_LOGS = [
  { icon:'📞', bg:'#F0FDF4', name:'山田 太郎', meta:'引越し侍 / 090-XXXX-1234 / 10:23', badge:'bg', status:'通話成立' },
  { icon:'📵', bg:'#FEF2F2', name:'鈴木 優子', meta:'価格.com / 080-XXXX-5678 / 10:31',  badge:'br', status:'不在' },
  { icon:'📞', bg:'#F0FDF4', name:'橋本 直樹', meta:'引越し侍 / 070-XXXX-9012 / 11:05', badge:'bg', status:'通話成立' },
  { icon:'📞', bg:'#FFFBEB', name:'坂本 由美', meta:'引越し侍 / 090-XXXX-3456 / 11:42', badge:'by', status:'折返し待ち' },
  { icon:'📞', bg:'#F0FDF4', name:'藤本 健司', meta:'価格.com / 080-XXXX-7890 / 13:18', badge:'bg', status:'通話成立' },
]

const DEMO_SITES = [
  { name:'引越し侍', status:'監視中', dotColor:'#22c55e', count:'今日 28件 / 新規2件', newCount:'🔴 NEW 2件' },
  { name:'価格.com', status:'監視中', dotColor:'#22c55e', count:'今日 14件 / 新規1件', newCount:'🔴 NEW 1件' },
  { name:'スーモ',   status:'待機中', dotColor:'#F59E0B', count:'今日 8件 / 新規0件',  newCount:null },
]

function CallUI({ callOn, setCallOn, sites, logs, stats }) {
  return (
    <div>
      {/* ステータスバー */}
      <div style={{ background:'linear-gradient(135deg,#1B2B4B,#2d4a80)', borderRadius:14, padding:'18px 20px', color:'#fff', marginBottom:14, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div style={{ width:12, height:12, borderRadius:'50%', flexShrink:0, background: callOn ? '#22c55e' : '#94A3B8', boxShadow: callOn ? '0 0 0 4px rgba(34,197,94,.3)' : 'none' }} />
        <div>
          <div style={{ fontSize:10, opacity:.55, marginBottom:2 }}>自動架電システム</div>
          <div style={{ fontSize:16, fontWeight:800 }}>{callOn ? '監視中 — 待機' : '停止中'}</div>
        </div>
        <div style={{ marginLeft:12 }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.5)', marginBottom:2 }}>今日の架電</div>
          <div style={{ fontSize:20, fontWeight:900 }}>{stats.total}<span style={{ fontSize:12, opacity:.6 }}>件</span></div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <label className="toggle">
            <input type="checkbox" checked={callOn} onChange={e => setCallOn(e.target.checked)} />
            <div className="ttrack" /><div className="tthumb" />
          </label>
          <span style={{ fontSize:11, fontWeight:700, color: callOn ? '#22c55e' : '#94A3B8' }}>{callOn ? 'ON' : 'OFF'}</span>
        </div>
      </div>

      {/* サイト監視 */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 }}>
        {sites.map(s => (
          <div key={s.name} className="card" style={{ margin:0, padding:12 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>{s.name}</div>
            <div style={{ fontSize:10, display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:s.dotColor }} />{s.status}
            </div>
            <div style={{ fontSize:10, color:'#64748B', marginBottom: s.newCount ? 4 : 0 }}>{s.count}</div>
            {s.newCount && <span style={{ background:'#FEF2F2', color:'#DC2626', fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5 }}>{s.newCount}</span>}
          </div>
        ))}
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-head"><h3>本日の架電ログ</h3><span className="c-sub">{logs.length}件</span></div>
          <div className="card-body" style={{ padding:'4px 16px' }}>
            {logs.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px 0', color:'#94A3B8', fontSize:12 }}>架電ログがありません</div>
            ) : logs.map((l, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom: i < logs.length-1 ? '1px solid #E2E8F0' : 'none' }}>
                <div style={{ width:30, height:30, borderRadius:8, background:l.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{l.icon}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700 }}>{l.name} 様</div>
                  <div style={{ fontSize:10, color:'#64748B', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.meta}</div>
                </div>
                <span className={`badge ${l.badge}`}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>架電実績</h3><span className="c-sub">本日</span></div>
          <div className="card-body">
            <div className="kpi-row kpi-2" style={{ marginBottom:14 }}>
              <div className="kpi-card c-green" style={{ padding:12 }}><div className="kpi-label">通話成立</div><div className="kpi-val">{stats.success}<span>件</span></div>{stats.total > 0 && <div className="kpi-change up">成功率 {Math.round(stats.success/stats.total*100)}%</div>}</div>
              <div className="kpi-card c-blue" style={{ padding:12 }}><div className="kpi-label">架電総数</div><div className="kpi-val">{stats.total}<span>件</span></div></div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748B', marginBottom:8 }}>サイト別 新規検知</div>
            {[
              { label:'引越し侍', color:'#1E5FA8', pct:stats.total>0?68:0, val:stats.total>0?'2件':'0件' },
              { label:'価格.com', color:'#0E8A7A', pct:stats.total>0?34:0, val:stats.total>0?'1件':'0件' },
              { label:'スーモ',   color:'#94A3B8', pct:0, val:'0件' },
            ].map(b => (
              <div key={b.label} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, marginBottom:8 }}>
                <span style={{ width:65, color:'#64748B' }}>{b.label}</span>
                <div style={{ flex:1, background:'#F1F5FB', borderRadius:4, height:7 }}>
                  <div style={{ background:b.color, height:7, borderRadius:4, width:`${b.pct}%` }} />
                </div>
                <b>{b.val}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function Call({ user }) {
  const isDemo = user?.mode === 'demo'
  const [callOn, setCallOn] = useState(true)
  const [leads, setLeads]   = useState([])

  // ライブモード：保存済みリードを取得し、15秒ごとに最新化
  useEffect(() => {
    if (isDemo) return
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/inbound')
        const data = await res.json()
        if (alive) setLeads(data.items || [])
      } catch (e) { console.error(e) }
    }
    load()
    const t = setInterval(load, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [isDemo])

  // 受付日時の新しい順（最新が一番上）に並べ替え
  const sortedLeads = [...leads].sort((a, b) =>
    String(b.receivedAt || b.savedAt || '').localeCompare(String(a.receivedAt || a.savedAt || ''))
  )

  const liveLogs = sortedLeads.map(l => ({
    icon: '🆕', bg: '#EFF6FF',
    name: l.name || '（名前なし）',
    meta: [l.site, l.phone, l.receivedAt || fmtTime(l.savedAt)].filter(Boolean).join(' / '),
    badge: 'bb', status: '新規',
  }))

  const liveSites = [
    { name: 'ズバット', status: callOn ? '監視中' : '待機中', dotColor: callOn ? '#22c55e' : '#94A3B8', count: `取得済み ${leads.length}件`, newCount: null },
  ]

  return (
    <div>
      <div className="page-hdr"><h1>架電機能</h1><p>一括査定サイトを監視し、新規顧客に自動電話・通知します</p></div>
      <CallUI
        callOn={callOn}
        setCallOn={setCallOn}
        sites={isDemo ? DEMO_SITES : liveSites}
        logs={isDemo ? DEMO_LOGS : liveLogs}
        stats={isDemo ? { total:7, success:5 } : { total: leads.length, success: 0 }}
      />
    </div>
  )
}
