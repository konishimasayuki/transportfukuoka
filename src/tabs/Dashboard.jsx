import { useEffect, useRef } from 'react'

const RECENT = [
  { name: '田中 誠一', meta: '東区→博多区 / 2LDK / 6月15日', amount: '¥68,000', badge: 'bg', status: '成約済', color: '#1E5FA8', initial: '田', src: '引越し侍' },
  { name: '山口 花子', meta: '南区→春日市 / 1K / 6月18日',    amount: '¥38,500', badge: 'bo', status: '見積済', color: '#0E8A7A', initial: '山', src: '価格.com' },
  { name: '佐藤 健太', meta: '北九州→中央区 / 3LDK / 6月22日',amount: '¥124,000',badge: 'bb', status: '交渉中', color: '#7C3AED', initial: '佐', src: '比較ナビ' },
  { name: '高橋 美咲', meta: '博多区→東区 / 2DK / 6月20日',   amount: '¥52,000', badge: 'bp', status: '連絡待', color: '#EA580C', initial: '高', src: '自社HP' },
  { name: '中村 龍一', meta: '糸島市→西区 / 1LDK / 6月25日',  amount: '¥45,000', badge: 'bg', status: '成約済', color: '#D97706', initial: '中', src: '引越し侍' },
]

const LEGEND = [
  { color: '#1E5FA8', name: '引越し侍',  val: 9,  pct: '38%' },
  { color: '#0E8A7A', name: '価格.com', val: 5,  pct: '21%' },
  { color: '#7C3AED', name: '比較ナビ',  val: 4,  pct: '17%' },
  { color: '#EA580C', name: '自社HP',    val: 4,  pct: '17%' },
  { color: '#94A3B8', name: '紹介',      val: 2,  pct: '8%'  },
]

const MONTHS = ['1月','2月','3月','4月','5月','6月']
const VALS   = [820000,940000,780000,1050000,1054000,1248000]
const COLORS = ['#BFDBFE','#BFDBFE','#BFDBFE','#93C5FD','#60A5FA','#1E5FA8']

export default function Dashboard() {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current) return
    const max = Math.max(...VALS)
    chartRef.current.innerHTML = ''
    MONTHS.forEach((m, i) => {
      const pct = (VALS[i] / max * 100).toFixed(1)
      const wrap = document.createElement('div')
      wrap.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;position:relative;height:100%'
      wrap.innerHTML = `
        <div data-h="${pct}%" style="width:100%;border-radius:5px 5px 0 0;position:absolute;bottom:0;height:0;background:${COLORS[i]};transition:height .8s cubic-bezier(.34,1.56,.64,1)"></div>
        <span style="position:absolute;bottom:-20px;font-size:9px;color:#64748B">${m}</span>
        <span style="position:absolute;top:-16px;font-size:9px;font-weight:700;white-space:nowrap">¥${(VALS[i]/10000).toFixed(0)}万</span>
      `
      chartRef.current.appendChild(wrap)
    })
    setTimeout(() => {
      chartRef.current?.querySelectorAll('[data-h]').forEach(b => { b.style.height = b.dataset.h })
    }, 100)
  }, [])

  return (
    <div>
      <div className="page-hdr"><h1>ダッシュボード</h1><p>2025年6月 — 月次サマリー</p></div>

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
            <div ref={chartRef} style={{ display:'flex', alignItems:'flex-end', gap:6, height:120, paddingBottom:22, position:'relative', borderBottom:'1px solid #E2E8F0' }} />
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
                {LEGEND.map(l => (
                  <div key={l.name} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
                    <div style={{ width:9, height:9, borderRadius:'50%', background:l.color, flexShrink:0 }} />
                    <span style={{ flex:1, color:'#64748B' }}>{l.name}</span>
                    <b>{l.val}</b>
                    <span style={{ color:'#94A3B8' }}>{l.pct}</span>
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
          {RECENT.map(r => (
            <div key={r.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid #E2E8F0' }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:r.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>{r.initial}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name} 様</div>
                <div style={{ fontSize:10, color:'#64748B', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.meta}</div>
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
