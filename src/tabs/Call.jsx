import { useState, useEffect } from 'react'
import LeadDetailModal from '../components/LeadDetailModal'

const DEMO_LOGS = [
  { icon:'📞', bg:'#F0FDF4', name:'山田 太郎', meta:'引越し侍 / 090-XXXX-1234 / 10:23', badge:'bg', status:'通話成立' },
  { icon:'📵', bg:'#FEF2F2', name:'鈴木 優子', meta:'価格.com / 080-XXXX-5678 / 10:31',  badge:'br', status:'不在' },
  { icon:'📞', bg:'#F0FDF4', name:'橋本 直樹', meta:'引越し侍 / 070-XXXX-9012 / 11:05', badge:'bg', status:'通話成立' },
  { icon:'📞', bg:'#FFFBEB', name:'坂本 由美', meta:'引越し侍 / 090-XXXX-3456 / 11:42', badge:'by', status:'折返し待ち' },
  { icon:'📞', bg:'#F0FDF4', name:'藤本 健司', meta:'価格.com / 080-XXXX-7890 / 13:18', badge:'bg', status:'通話成立' },
]

const DEMO_SITES = [
  { name:'ズバット',  status:'監視中', dotColor:'#22c55e', count:'今日 32件 / 新規3件', newCount:'🔴 NEW 3件' },
  { name:'引越し侍', status:'監視中', dotColor:'#22c55e', count:'今日 28件 / 新規2件', newCount:'🔴 NEW 2件' },
  { name:'価格.com', status:'監視中', dotColor:'#22c55e', count:'今日 14件 / 新規1件', newCount:'🔴 NEW 1件' },
  { name:'SUUMO',    status:'待機中', dotColor:'#F59E0B', count:'今日 8件 / 新規0件',  newCount:null },
]

function CallUI({ callOn, setCallOn, sites, logs, stats, onOpenLog }) {
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
              <div
                key={i}
                onDoubleClick={() => l.lead && onOpenLog && onOpenLog(l.lead)}
                title={l.lead ? 'ダブルクリックで詳細' : undefined}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom: i < logs.length-1 ? '1px solid #E2E8F0' : 'none', cursor: l.lead ? 'pointer' : 'default' }}
              >
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

// ズバット監視の生存状態 → 表示用の判定
function monHealth(status) {
  if (!status || !status.at) return { label: '監視状態：不明', sub: 'まだ通信がありません', color: '#94A3B8', bg: '#F1F5FB' }
  const ageMin = (Date.now() - new Date(status.at).getTime()) / 60000
  const last = new Date(status.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  if (status.ok === false) {
    if (status.reason === 'auth') return { label: '⚠ ズバット未接続', sub: `ログイン切れの可能性。ズバットに再ログインしてください（最終 ${last}）`, color: '#B91C1C', bg: '#FEF2F2' }
    return { label: '⚠ 取得エラー', sub: `通信エラーが発生しています（最終 ${last}）`, color: '#C2410C', bg: '#FFF7ED' }
  }
  if (ageMin > 2) return { label: '⚠ 監視停止の可能性', sub: `${Math.round(ageMin)}分間 更新がありません。監視端末のタブが開いているか確認してください（最終 ${last}）`, color: '#C2410C', bg: '#FFF7ED' }
  return { label: '✓ 監視中（正常）', sub: `最終取得 ${last}${status.count != null ? ` ／ ${status.count}件` : ''}`, color: '#15803D', bg: '#F0FDF4' }
}

export default function Call({ user, switchTab }) {
  const isDemo = user?.mode === 'demo'
  const [callOn, setCallOn] = useState(true)
  const [leads, setLeads]   = useState([])
  const [monStatus, setMonStatus] = useState(null)

  // ライブモード：保存済みリードと監視ステータスを取得し、15秒ごとに最新化
  useEffect(() => {
    if (isDemo) return
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/inbound')
        const data = await res.json()
        if (alive) setLeads(data.items || [])
      } catch (e) { console.error(e) }
      try {
        const sres = await fetch('/api/status')
        const sdata = await sres.json()
        if (alive) setMonStatus(sdata.status || null)
      } catch (e) { /* status取得失敗は無視 */ }
    }
    load()
    const t = setInterval(load, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [isDemo])

  // 受付日時の新しい順（最新が一番上）に並べ替え
  const sortedLeads = [...leads].sort((a, b) =>
    String(b.receivedAt || b.savedAt || '').localeCompare(String(a.receivedAt || a.savedAt || ''))
  )

  // 「本日」判定：受付日時(MM/DD)が今日と一致（無ければ保存日時で判定）
  const now = new Date()
  const todayMD = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`
  const isToday = (l) => {
    if (l.receivedAt && /^\d{2}\/\d{2}/.test(l.receivedAt)) return l.receivedAt.slice(0, 5) === todayMD
    if (l.savedAt) {
      const d = new Date(l.savedAt)
      if (!isNaN(d.getTime())) return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` === todayMD
    }
    return false
  }
  const todaysLeads = sortedLeads.filter(isToday)

  const liveLogs = todaysLeads.map(l => ({
    icon: '🆕', bg: '#EFF6FF',
    name: l.name || '（名前なし）',
    meta: [l.site, l.phone, l.receivedAt || fmtTime(l.savedAt)].filter(Boolean).join(' / '),
    badge: 'bb', status: '新規',
    lead: l,
  }))

  const [detailItem, setDetailItem] = useState(null)

  // 詳細モーダルからのステータス変更（楽観更新＋サーバ反映）
  const updateLeadStatus = async (item, status) => {
    setLeads(prev => prev.map(l => l.id === item.id ? { ...l, status } : l))
    setDetailItem(d => (d ? { ...d, status } : d))
    if (isDemo) return
    try {
      await fetch('/api/inbound', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key || item.phone, phone: item.phone, status }),
      })
    } catch (e) { console.error(e) }
  }

  // 詳細モーダルからの編集（メモ・家財）
  const savePatch = async (item, patch) => {
    setLeads(prev => prev.map(l => l.id === item.id ? { ...l, ...patch } : l))
    setDetailItem(d => (d ? { ...d, ...patch } : d))
    if (isDemo) return
    try {
      await fetch('/api/inbound', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key || item.phone, phone: item.phone, ...patch }),
      })
    } catch (e) { console.error(e) }
  }

  const createEstimateFromLead = (item) => {
    const prefill = {
      name: item.name || '', kana: item.kana || '',
      fromZip: (item.fromZip || '').replace(/^〒/, ''),
      fromAddress: item.fromAddress || item.from || '',
      toZip: (item.toZip || '').replace(/^〒/, ''),
      toAddress: item.toAddress || item.to || '',
      fromTelMobile: item.phone || '',
      kazai: Array.isArray(item.kazai) ? item.kazai : [],
      boxCount: item.boxCount || '',
      memo: [item.memo, item.request, item.option].filter(Boolean).join(' / '),
    }
    try { sessionStorage.setItem('tf_estimate_prefill', JSON.stringify(prefill)) } catch {}
    setDetailItem(null)
    if (typeof switchTab === 'function') switchTab('estimate')
  }

  const liveSites = [
    { name: 'ズバット', status: callOn ? '監視中' : '待機中', dotColor: callOn ? '#22c55e' : '#94A3B8', count: `取得済み ${leads.length}件`, newCount: null },
  ]

  const mon = monHealth(monStatus)

  return (
    <div>
      <div className="page-hdr"><h1>架電機能</h1><p>一括査定サイトを監視し、新規顧客に自動電話・通知します</p></div>
      {!isDemo && (
        <div style={{ background: mon.bg, border: `1px solid ${mon.color}33`, borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: mon.color, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: mon.color }}>{mon.label}</div>
            <div style={{ fontSize: 11, color: '#64748B' }}>{mon.sub}</div>
          </div>
        </div>
      )}
      <CallUI
        callOn={callOn}
        setCallOn={setCallOn}
        sites={isDemo ? DEMO_SITES : liveSites}
        logs={isDemo ? DEMO_LOGS : liveLogs}
        stats={isDemo ? { total:7, success:5 } : { total: todaysLeads.length, success: 0 }}
        onOpenLog={setDetailItem}
      />
      <LeadDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onStatusChange={updateLeadStatus}
        onSave={savePatch}
        onCreateEstimate={createEstimateFromLead}
      />
    </div>
  )
}
