// 配車ボード（車両 × 時間）
// スケジュールページの「配車ボード」表示モード本体。
// - KPI（稼働率／確定・仮・未手配／売上見込／外注／重複アラート）
// - ボードグリッド：1行=1車両、08:00–19:00の11列に各ジョブを絶対配置
// - 未手配パネル：カード選択 → ボードの空き枠クリックで割当（時間重複は赤で検知）
// - 配置済みカードは「未手配に戻す」／「ロック」できる（ロック中は戻す・車両削除の対象外）
// - 車両／乗務員の設定（追加・編集・削除）
// - 外注枠は初期非表示。「外注枠を追加」で必要なときだけ追加する。
// データはダミー配列（後で /api/schedule 等の実データ・型に差し替え可能）。
// 車両は内部キー(key)で参照し、号車番号(id)を変更してもジョブの紐付けが壊れない設計。
import { useState, useMemo, useRef } from 'react'

const START = 8, END = 19, COLS = END - START // 08:00–19:00 = 11列
const CAT_NAME = { move: '引っ越し', quote: '見積り', box: '段ボール配達' }
const money = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP')
const fmt = (h) => { const H = Math.floor(h), M = Math.round((h - H) * 60); return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0') }
const pctL = (h) => ((h - START) / COLS) * 100
const pctW = (d) => (d / COLS) * 100

// ---- 初期ダミーデータ（外注枠は含めない：必要時に追加）----
const INIT_VEHICLES = [
  { key: 'v1', id: '831', cls: '2t', crew: '田中 / 佐藤', n: 2 },
  { key: 'v2', id: '712', cls: '2tロング', crew: '山本 / 中村', n: 2 },
  { key: 'v3', id: '405', cls: '3t', crew: '高橋班', n: 3 },
  { key: 'v4', id: '218', cls: '4t', crew: '伊藤班', n: 3 },
  { key: 'v5', id: '109', cls: '軽', crew: '小林', n: 1 },
]
const INIT_JOBS = [
  { id: 'j1', v: 'v1', cat: 'move', name: '松本 様', crew: '2名', from: '早良区', to: '中央区', s: 9, d: 3, st: 'confirmed', src: 'SUUMO', amt: 52000 },
  { id: 'j2', v: 'v1', cat: 'quote', name: '井上 様', crew: '2名', from: '南区', to: '—', s: 14, d: 1.5, st: 'tentative', src: 'HP', amt: 0 },
  { id: 'j3', v: 'v2', cat: 'move', name: 'グエン 様', crew: '2名', from: '春日市', to: '大野城市', s: 10, d: 3, st: 'confirmed', src: 'ZBT', amt: 63000 },
  { id: 'j4', v: 'v2', cat: 'move', name: '重複確認', crew: '2名', from: '大野城', to: '筑紫野', s: 12, d: 2, st: 'conflict', src: 'HP', amt: 48000 },
  { id: 'j5', v: 'v3', cat: 'move', name: '佐々木 様', crew: '3名', from: '西区', to: '糸島市', s: 9, d: 4.5, st: 'confirmed', src: 'SUUMO', amt: 98000 },
  { id: 'j6', v: 'v3', cat: 'box', name: '高田 様', crew: '1名', from: '糸島', to: '—', s: 15, d: 1.5, st: 'tentative', src: 'HP', amt: 0 },
  { id: 'j7', v: 'v4', cat: 'move', name: '渡辺 様', crew: '3名', from: '東区', to: '新宮町', s: 8.5, d: 5, st: 'confirmed', src: 'ZBT', amt: 132000 },
  { id: 'j8', v: 'v5', cat: 'quote', name: '田口 様', crew: '1名', from: '博多区', to: '—', s: 8.5, d: 1.5, st: 'confirmed', src: 'HP', amt: 0 },
  { id: 'j9', v: 'v5', cat: 'move', name: 'パク 様', crew: '1名', from: '中央区', to: '中央区', s: 11, d: 1.5, st: 'confirmed', src: 'SUUMO', amt: 19000 },
  { id: 'j10', v: 'v5', cat: 'box', name: '森 様', crew: '1名', from: '城南区', to: '—', s: 13.5, d: 1.5, st: 'tentative', src: 'HP', amt: 0 },
]
const INIT_UN = [
  { cat: 'move', name: '中村 様', crew: '2名', need: '2t', from: '南区', to: '城南区', whn: '7/3 09:00', src: 'suumo' },
  { cat: 'box', name: 'リー 様', crew: '1名', need: '軽', from: '博多区', to: '—', whn: '7/3 14:00', src: 'zbt' },
  { cat: 'quote', name: '大塚 様', crew: '1名', need: '軽', from: '中央区', to: '—', whn: '7/3 08:00', src: 'hp' },
  { cat: 'move', name: 'チャン 様', crew: '2名', need: '2t', from: '早良区', to: '西区', whn: '7/3 13:00', src: 'suumo' },
  { cat: 'move', name: '斉藤 様', crew: '2名', need: '2tロング', from: '東区', to: '粕屋町', whn: '7/3 15:30', src: 'hp' },
]
const SRC_TXT = { suumo: 'SUUMO', zbt: 'ズバット', hp: '自社HP' }
const jobClass = (j) => 'db-job ' + (j.st === 'conflict' ? 'conflict' : j.cat) + (j.st === 'tentative' ? ' tentative' : '')

export default function DispatchBoard({ filter, onToast }) {
  const [vehicles, setVehicles] = useState(INIT_VEHICLES)
  const [jobs, setJobs] = useState(INIT_JOBS)
  const [unassigned, setUnassigned] = useState(INIT_UN)
  const [armed, setArmed] = useState(null)   // 選択中の未手配カードindex
  const [tip, setTip] = useState(null)       // ツールチップ { job, x, y }
  const [showCreate, setShowCreate] = useState(false)
  const [showVeh, setShowVeh] = useState(false)
  const idRef = useRef(1000)                 // 新規ジョブのid採番
  const extRef = useRef(0)                   // 外注枠の連番
  const toast = onToast || (() => {})
  const show = (c) => !filter || filter[c] !== false // カテゴリチップの絞り込み
  const vehOf = (key) => vehicles.find(v => v.key === key)

  // NOWライン：現在時刻（営業時間内のときだけ表示）
  const nowH = useMemo(() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 }, [])
  const showNow = nowH >= START && nowH <= END

  // KPI（絞り込みに関わらず全データで集計）
  const k = useMemo(() => {
    const conf = jobs.filter(j => j.st === 'confirmed').length
    const tent = jobs.filter(j => j.st === 'tentative').length
    const clash = jobs.filter(j => j.st === 'conflict').length
    const cap = vehicles.filter(v => !v.ext).length * COLS
    const used = jobs.filter(j => { const v = vehOf(j.v); return v && !v.ext }).reduce((a, j) => a + j.d, 0)
    const util = cap ? Math.min(99, Math.round((used / cap) * 100)) : 0
    const revenue = jobs.reduce((a, j) => a + (j.amt || 0), 0)
    return { conf, tent, clash, util, revenue, extLanes: vehicles.filter(v => v.ext).length, extJobs: jobs.filter(j => j.extJob).length, un: unassigned.length }
  }, [jobs, vehicles, unassigned])

  const ownCount = vehicles.filter(v => !v.ext).length

  // 未手配カード → 空き枠クリックで割当。同一車両で時間が重なれば conflict。
  const assignHere = (vKey, hour) => {
    if (armed === null) { toast('未手配カードを選んでから枠をクリック'); return }
    const u = unassigned[armed]
    const dur = u.cat === 'move' ? 3 : 1.5
    const clash = jobs.some(j => j.v === vKey && hour < (j.s + j.d) && (hour + dur) > j.s)
    const isExt = !!(vehOf(vKey) || {}).ext
    const id = 'j' + (++idRef.current)
    setJobs(prev => [...prev, { id, v: vKey, cat: u.cat, name: u.name, crew: u.crew, from: u.from, to: u.to, s: hour, d: dur, st: clash ? 'conflict' : 'tentative', src: String(u.src || '').toUpperCase(), amt: 0, extJob: isExt, locked: false }])
    setUnassigned(prev => prev.filter((_, i) => i !== armed))
    setArmed(null)
    toast(clash ? '割り当てました（時間重複あり・要確認）' : '割り当てました')
  }

  // 配置済みカードのロック切替
  const toggleLock = (id) => setJobs(prev => prev.map(j => j.id === id ? { ...j, locked: !j.locked } : j))

  // 配置済みカードを未手配一覧に戻す（ロック中は不可）
  const jobToUn = (j) => ({ cat: j.cat, name: j.name, crew: j.crew, need: (vehOf(j.v) || {}).cls || '—', from: j.from, to: j.to, whn: '本日 ' + fmt(j.s), src: String(j.src || 'hp').toLowerCase() })
  const returnJob = (id) => {
    const j = jobs.find(x => x.id === id)
    if (!j || j.locked) return
    setUnassigned(prev => [jobToUn(j), ...prev])
    setJobs(prev => prev.filter(x => x.id !== id))
    toast('未手配に戻しました')
  }

  // 外注枠の追加
  const addExt = () => {
    const n = ++extRef.current
    setVehicles(prev => [...prev, { key: 'ext' + n + '_' + prev.length, id: 'EXT' + n, cls: '外注枠', crew: '協力会社 未指定', n: 0, ext: true }])
    toast('外注枠を追加しました')
  }

  // 車両設定モーダルからの反映。削除された車両のジョブはロック中なら中止、それ以外は未手配へ戻す。
  const applyVehicles = (draft) => {
    const keys = new Set(draft.map(v => v.key))
    const orphaned = jobs.filter(j => !keys.has(j.v))
    if (orphaned.some(j => j.locked)) { toast('ロック中の予定がある車両は削除できません'); return false }
    if (orphaned.length) {
      const ret = orphaned.map(jobToUn)
      setUnassigned(prev => [...ret, ...prev])
      setJobs(prev => prev.filter(j => keys.has(j.v)))
    }
    setVehicles(draft)
    toast('車両設定を保存しました')
    return true
  }

  const moveTip = (e, job) => setTip({ job, x: e.clientX, y: e.clientY })
  const tipStyle = () => {
    if (!tip) return {}
    let x = tip.x + 14, y = tip.y + 14
    if (typeof window !== 'undefined') { if (x + 250 > window.innerWidth) x = tip.x - 260; if (y + 160 > window.innerHeight) y = tip.y - 160 }
    return { left: x, top: y }
  }

  return (
    <div>
      {/* ===== KPI ===== */}
      <div className="db-kpis">
        <div className="db-kpi util">
          <div className="lab">本日の稼働率</div>
          <div className="val">{k.util}<small>%</small></div>
          <div className="bar"><i style={{ width: k.util + '%' }} /></div>
        </div>
        <div className="db-kpi">
          <div className="lab">配車ステータス</div>
          <div className="db-splitk">
            <div className="u"><b style={{ color: 'var(--green)' }}>{k.conf}</b><span>確定</span></div>
            <div className="u"><b style={{ color: 'var(--yellow)' }}>{k.tent + k.clash}</b><span>仮</span></div>
            <div className="u"><b style={{ color: 'var(--muted)' }}>{k.un}</b><span>未手配</span></div>
          </div>
        </div>
        <div className="db-kpi">
          <div className="lab">本日の売上見込</div>
          <div className="val">{money(k.revenue)}</div>
          <div className="meta">確定・仮の見積合計</div>
        </div>
        <div className="db-kpi">
          <div className="lab"><i style={{ background: 'var(--purple)' }} />外注（協力会社）</div>
          <div className="val">{k.extLanes}<small>台</small></div>
          <div className="meta">{k.extLanes ? (k.extJobs ? k.extJobs + '件を外注手配' : '外注枠 空き') : '外注なし'}</div>
        </div>
        <div className="db-kpi alert">
          <div className="lab"><i style={{ background: 'var(--red)' }} />要確認アラート</div>
          <div className="val">{k.clash}</div>
          <div className="meta">{k.clash ? '時間重複の疑い' : '重複なし'}</div>
        </div>
      </div>

      {/* ===== ボード ＋ 未手配 ===== */}
      <div className="db-layout">
        <div className="db-wrap">
          <div className="db-head">
            <h3>車両 × 時間 <span>· 自社{ownCount}台{k.extLanes ? ` ＋ 外注${k.extLanes}` : ''}</span></h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div className="db-legend">
                <span><i style={{ background: 'var(--blueL)' }} />引っ越し</span>
                <span><i style={{ background: '#F59E0B' }} />見積り</span>
                <span><i style={{ background: '#22C55E' }} />段ボール配達</span>
                <span><i style={{ background: 'var(--red)' }} />重複</span>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => setShowVeh(true)}>🚚 車両設定</button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowCreate(true)}>＋ 未手配を追加</button>
            </div>
          </div>

          <div className="scroll-x">
            <div className="db-grid">
              {/* 時間ヘッダ */}
              <div className="db-timerow">
                <div className="corner">車両 / 乗務員</div>
                {Array.from({ length: COLS }, (_, i) => (
                  <div key={i} className="tc">{String(START + i).padStart(2, '0')}:00</div>
                ))}
              </div>

              {/* 車両行 */}
              {vehicles.map(v => (
                <div className="db-row" key={v.key}>
                  <div className={'db-veh' + (v.ext ? ' ext' : '')}>
                    <span className="db-badge">{v.ext ? '外注' : '#' + v.id}</span>
                    <div>
                      <div className="db-vt">{v.cls}</div>
                      <div className="db-vc">{v.crew}{v.n ? ` · ${v.n}名` : ''}</div>
                    </div>
                  </div>
                  <div className={'db-lane' + (armed !== null ? ' armed' : '')}>
                    {/* 空き枠（クリックで割当） */}
                    {Array.from({ length: COLS }, (_, i) => (
                      <div key={i} className="db-slot" style={{ left: pctL(START + i) + '%' }} onClick={() => assignHere(v.key, START + i)} />
                    ))}
                    {/* ジョブブロック */}
                    {jobs.filter(j => j.v === v.key && show(j.cat)).map((j) => (
                      <div key={j.id} className={jobClass(j) + (j.locked ? ' locked' : '')}
                        style={{ left: pctL(j.s) + '%', width: `calc(${pctW(j.d)}% - 6px)` }}
                        onMouseMove={(e) => moveTip(e, j)} onMouseLeave={() => setTip(null)}>
                        {j.locked && <span className="db-lockbadge">🔒</span>}
                        <div className="db-acts">
                          <button title={j.locked ? 'ロック解除' : 'ロック'} onClick={(e) => { e.stopPropagation(); toggleLock(j.id) }}>{j.locked ? '🔓' : '🔒'}</button>
                          {!j.locked && <button title="未手配に戻す" onClick={(e) => { e.stopPropagation(); returnJob(j.id) }}>↩</button>}
                        </div>
                        <div className="jt">
                          {j.st === 'conflict' && <span title="時間重複の疑い">⚠ </span>}
                          {j.name}
                          {j.st === 'tentative' && <span className="db-tag">仮</span>}
                          {j.extJob && <span className="db-tag">外注</span>}
                        </div>
                        <div className="jm">{j.from}{j.to && j.to !== '—' ? '→' + j.to : ''} · {CAT_NAME[j.cat]}</div>
                        <div className="jtime">{fmt(j.s)}–{fmt(j.s + j.d)}</div>
                      </div>
                    ))}
                    {showNow && <div className="db-nowline" style={{ left: pctL(nowH) + '%' }} />}
                  </div>
                </div>
              ))}

              {/* 外注枠を追加 */}
              <button className="db-addext" onClick={addExt}>＋ 外注枠を追加</button>
            </div>
          </div>
        </div>

        {/* 未手配案件 */}
        <aside className="db-side">
          <div className="db-side-head">
            <div className="t"><span className="dot" />未手配案件</div>
            <div className="cnt">{unassigned.length}</div>
          </div>
          <div className="db-side-hint">カードを選び、ボードの空き枠をクリックで割り当て</div>
          <div className="db-side-list">
            {unassigned.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 14 }}>未手配はありません</div>}
            {unassigned.map((u, i) => show(u.cat) && (
              <div key={i} className={'db-ucard' + (armed === i ? ' selected' : '')}
                onClick={() => setArmed(armed === i ? null : i)}>
                <div className="row1">
                  <div className="nm">{u.name}</div>
                  <div className={'db-catpill ' + u.cat}>{CAT_NAME[u.cat]}</div>
                </div>
                <div className="route">📍 {u.from}{u.to && u.to !== '—' ? ' → ' + u.to : ''}</div>
                <div className="need">希望車両 {u.need} ・ 作業員 {u.crew}</div>
                <div className="foot">
                  <div className="whn">🕐 {u.whn}</div>
                  <div className={'src db-src-' + u.src}>{SRC_TXT[u.src] || u.src}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* ツールチップ */}
      {tip && (
        <div className="db-tip" style={tipStyle()}>
          <b>{tip.job.name}</b> · {CAT_NAME[tip.job.cat]}{tip.job.extJob ? '（外注）' : ''}{tip.job.locked ? ' 🔒' : ''}
          <div className="tr"><span>区間</span><span>{tip.job.from}{tip.job.to && tip.job.to !== '—' ? ' → ' + tip.job.to : ''}</span></div>
          <div className="tr"><span>時間</span><span>{fmt(tip.job.s)}–{fmt(tip.job.s + tip.job.d)}（{tip.job.d}h）</span></div>
          <div className="tr"><span>作業員</span><span>{tip.job.crew}</span></div>
          <div className="tr"><span>状態</span><span>{{ confirmed: '確定', tentative: '仮予約', conflict: '⚠ 時間重複の疑い' }[tip.job.st]}</span></div>
          {tip.job.amt ? <div className="tr"><span>見積</span><span>{money(tip.job.amt)}</span></div> : null}
        </div>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onAdd={(u) => { setUnassigned(prev => [u, ...prev]); setShowCreate(false); toast('未手配に追加しました') }} />
      )}
      {showVeh && (
        <VehicleModal vehicles={vehicles} jobs={jobs} onClose={() => setShowVeh(false)} onApply={applyVehicles} />
      )}
    </div>
  )
}

// ===== 車両／乗務員 設定モーダル =====
function VehicleModal({ vehicles, jobs, onClose, onApply }) {
  const [draft, setDraft] = useState(() => vehicles.map(v => ({ ...v })))
  const nextKey = useRef(1)
  const jobCount = (key) => jobs.filter(j => j.v === key).length
  const lockedCount = (key) => jobs.filter(j => j.v === key && j.locked).length

  const setField = (key, field, val) => setDraft(prev => prev.map(v => v.key === key ? { ...v, [field]: field === 'n' ? (parseInt(val, 10) || 0) : val } : v))
  const addRow = () => setDraft(prev => [...prev, { key: 'new' + (nextKey.current++) + '_' + Date.now(), id: '', cls: '2t', crew: '', n: 2 }])
  const removeRow = (key) => {
    if (lockedCount(key) > 0) { alert('この車両にはロック中の予定があります。先にロック解除してください。'); return }
    setDraft(prev => prev.filter(v => v.key !== key))
  }

  const save = () => {
    // 号車が空の行は除外（誤って空行を残しても落とす）
    const cleaned = draft.filter(v => String(v.id || '').trim() || v.ext).map(v => ({ ...v, id: String(v.id || '').trim() }))
    if (onApply(cleaned) !== false) onClose()
  }

  const ov = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: 16, overflowY: 'auto' }
  const bx = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, margin: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
  const ip = { padding: '7px 9px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1E293B', width: '100%' }
  const th = { fontSize: 10, fontWeight: 700, color: '#64748B', textAlign: 'left', padding: '0 6px 6px' }

  return (
    <div style={ov} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={bx}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: 15, fontWeight: 800 }}>車両 / 乗務員の設定</div><div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>号車・車両クラス・乗務員・人数を登録します</div></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94A3B8' }}>×</button>
        </div>
        <div style={{ padding: '14px 18px', maxHeight: '60vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 90 }}>号車</th>
                <th style={{ ...th, width: 120 }}>車両クラス</th>
                <th style={th}>乗務員</th>
                <th style={{ ...th, width: 70 }}>人数</th>
                <th style={{ ...th, width: 44 }}></th>
              </tr>
            </thead>
            <tbody>
              {draft.map(v => (
                <tr key={v.key}>
                  <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9' }}><input style={ip} value={v.id} onChange={e => setField(v.key, 'id', e.target.value)} placeholder="831" /></td>
                  <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9' }}>
                    <select style={ip} value={v.cls} onChange={e => setField(v.key, 'cls', e.target.value)}>
                      {['軽', '2t', '2tロング', '3t', '4t', '外注枠'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9' }}><input style={ip} value={v.crew} onChange={e => setField(v.key, 'crew', e.target.value)} placeholder="田中 / 佐藤" /></td>
                  <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9' }}><input type="number" min="0" style={{ ...ip, width: 60 }} value={v.n} onChange={e => setField(v.key, 'n', e.target.value)} /></td>
                  <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9', textAlign: 'center' }}>
                    <button title={lockedCount(v.key) ? 'ロック中の予定があり削除不可' : (jobCount(v.key) ? '削除（配置済みは未手配へ戻る）' : '削除')}
                      onClick={() => removeRow(v.key)}
                      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', fontSize: 13, opacity: lockedCount(v.key) ? 0.4 : 1 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={addRow}>＋ 車両を追加</button>
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 8, lineHeight: 1.5 }}>※ 削除した車両に配置済みの予定は「未手配案件」に戻ります。ロック中の予定がある車両は削除できません。</div>
        </div>
        <div style={{ padding: '13px 18px', borderTop: '1px solid #EEF2F7', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  )
}

// ===== 作成モーダル（種別・荷量から概算見積 → 未手配に追加）=====
const TRUCKS = [
  { key: '軽', label: '軽・少量', need: '軽', base: 22000 },
  { key: '2t', label: '2t・単身', need: '2t', base: 48000 },
  { key: '2tL', label: '2tロング', need: '2tロング', base: 58000 },
  { key: '3t', label: '3t・家族', need: '3t', base: 86000 },
  { key: '4t', label: '4t・大家族', need: '4t', base: 120000 },
]
const OPTIONS = [
  { label: 'エアコン脱着', p: 12000 },
  { label: '洗濯機設置', p: 8000 },
  { label: 'ピアノ運送', p: 15000 },
  { label: '不用品回収', p: 6000 },
  { label: 'ダンボール20枚', p: 3000 },
]
const SRC_OPTS = [{ v: 'suumo', t: 'SUUMO引越し' }, { v: 'zbt', t: 'ズバット' }, { v: 'hp', t: '自社HP' }, { v: 'hp', t: '電話・紹介' }]

function CreateModal({ onClose, onAdd }) {
  const [cat, setCat] = useState('move')
  const [truck, setTruck] = useState('2t')
  const [opts, setOpts] = useState({})
  const [name, setName] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [crew, setCrew] = useState('2名')
  const [src, setSrc] = useState('suumo')

  const est = useMemo(() => {
    const base = (TRUCKS.find(t => t.key === truck) || {}).base || 48000
    const add = OPTIONS.reduce((a, o) => a + (opts[o.label] ? o.p : 0), 0)
    return base + add
  }, [truck, opts])

  const save = () => {
    const nm = (name || '新規').trim()
    const need = (TRUCKS.find(t => t.key === truck) || {}).need || '2t'
    onAdd({ cat, name: nm.endsWith('様') ? nm : nm + ' 様', crew, need, from: from || '福岡市', to: to || '—', whn: '本日', src })
  }

  const ov = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: 16, overflowY: 'auto' }
  const bx = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 560, margin: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
  const ip = { width: '100%', padding: '9px 11px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1E293B' }
  const lb = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, display: 'block' }
  const seg = (on) => ({ padding: '7px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? 'var(--blue)' : '#E2E8F0'}`, background: on ? 'var(--blue)' : '#F8FAFC', color: on ? '#fff' : '#64748B' })

  return (
    <div style={ov} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={bx}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: 15, fontWeight: 800 }}>予定を作成</div><div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>種別・荷量から概算見積を自動計算し、未手配に追加します</div></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94A3B8' }}>×</button>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={lb}>種別 *</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['move', 'quote', 'box'].map(c => (
                <button key={c} style={seg(cat === c)} onClick={() => setCat(c)}>{CAT_NAME[c]}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={lb}>顧客名 *</label><input style={ip} value={name} onChange={e => setName(e.target.value)} placeholder="例）松本 健太" /></div>
            <div><label style={lb}>作業員</label>
              <select style={ip} value={crew} onChange={e => setCrew(e.target.value)}>{['2名', '3名', '4名', '1名'].map(x => <option key={x}>{x}</option>)}</select>
            </div>
            <div><label style={lb}>出発地 *</label><input style={ip} value={from} onChange={e => setFrom(e.target.value)} placeholder="福岡市早良区 …" /></div>
            <div><label style={lb}>到着地</label><input style={ip} value={to} onChange={e => setTo(e.target.value)} placeholder="福岡市中央区 …" /></div>
            <div><label style={lb}>流入元</label>
              <select style={ip} value={src} onChange={e => setSrc(e.target.value)}>{SRC_OPTS.map((s, i) => <option key={i} value={s.v}>{s.t}</option>)}</select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lb}>荷量 / 車両クラス</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TRUCKS.map(t => <button key={t.key} style={seg(truck === t.key)} onClick={() => setTruck(t.key)}>{t.label}</button>)}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={lb}>オプション</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {OPTIONS.map(o => (
                <label key={o.label} style={{ ...seg(!!opts[o.label]), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={!!opts[o.label]} onChange={e => setOpts(p => ({ ...p, [o.label]: e.target.checked }))} style={{ margin: 0 }} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 11, color: '#64748B' }}>概算見積<b style={{ display: 'block', fontSize: 22, fontWeight: 900, color: '#1E293B', marginTop: 2 }}>{money(est)}</b></div>
            <div style={{ fontSize: 10, color: '#94A3B8', textAlign: 'right', maxWidth: 220 }}>車両・作業員・距離＋オプション。確定は訪問見積で調整。</div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-outline" onClick={onClose}>キャンセル</button>
            <button className="btn btn-primary" onClick={save}>＋ 未手配に追加</button>
          </div>
        </div>
      </div>
    </div>
  )
}
