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
import { useState, useMemo, useRef, useEffect } from 'react'
import { DEFAULT_FLEET } from '../lib/fleet'

const START = 8, END = 19, COLS = END - START // 08:00–19:00 = 11列
const CAT_NAME = { move: '引っ越し', quote: '見積り', box: '段ボール配達' }
const money = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP')
const fmt = (h) => { const H = Math.floor(h), M = Math.round((h - H) * 60); return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0') }
const pctL = (h) => ((h - START) / COLS) * 100
const pctW = (d) => (d / COLS) * 100

// ---- 初期ダミーデータ（外注枠は含めない：必要時に追加）----
// 車両フリートの初期値は設定「トラック設定」と共有（src/lib/fleet.js）。
const INIT_VEHICLES = DEFAULT_FLEET
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

// ---- 成約(成約管理)→ 未手配カード の変換ヘルパー ----
const ymd = (d) => { const x = d instanceof Date ? d : new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const splitRoute = (route) => { const p = String(route || '').split(/\s*(?:→|->|〜|~|–|—)\s*/); return [(p[0] || '').trim() || '—', (p[1] || '').trim() || '—'] }
const isActiveContract = (c) => c && !['失注', 'キャンセル', 'キャンセル済み'].includes(c.status)
const contractToCard = (c) => {
  const [from, to] = splitRoute(c.route)
  return { contractId: c.id, cat: 'move', name: (c.name || '') + ' 様', crew: (String(c.persons || '').replace(/[^\d]/g, '') || '2') + '名', need: '2t', from, to, whn: c.moveDateText || c.date || '', src: String(c.srcLabel || 'hp'), amt: Number(c.amount) || 0 }
}

export default function DispatchBoard({ filter, onToast, contracts = [], boardDate = new Date(), isDemo = false }) {
  const [vehicles, setVehicles] = useState(INIT_VEHICLES)
  const [jobs, setJobs] = useState([])          // その日の割当（/api/dispatch で日付別に保存）
  const [manualUn, setManualUn] = useState([])  // 成約以外の未手配カード（手動追加・非成約の戻し）。成約由来は下でderive
  const [armed, setArmed] = useState(null)   // 選択中の未手配カードindex
  const [dragId, setDragId] = useState(null) // ドラッグ中の配置済みジョブid（車両間移動）
  const [tip, setTip] = useState(null)       // ツールチップ { job, x, y }
  const [showCreate, setShowCreate] = useState(false)
  const [showVeh, setShowVeh] = useState(false)
  const idRef = useRef(1000)                 // 新規ジョブのid採番
  const extRef = useRef(0)                   // 外注枠の連番
  const toast = onToast || (() => {})
  const boardKey = ymd(boardDate)
  const show = (c) => !filter || filter[c] !== false // カテゴリチップの絞り込み
  const vehOf = (key) => vehicles.find(v => v.key === key)

  // 未手配案件＝その日(配車日)の“進行中の成約”からderive（割当済みは除く）＋ 手動カード(manualUn)
  const contractCards = useMemo(() => (contracts || []).filter(c => isActiveContract(c) && c.date === boardKey).map(contractToCard), [contracts, boardKey])
  const contractCardsAvail = useMemo(() => { const a = new Set(jobs.map(j => j.contractId).filter(Boolean)); return contractCards.filter(cd => !a.has(cd.contractId)) }, [contractCards, jobs])
  const unassigned = useMemo(() => [...contractCardsAvail, ...manualUn], [contractCardsAvail, manualUn])

  // 日付別に保存済みの割当を読み込み（デモは日付ごとに空から）。読み込み完了前は保存しない（readyKeyで制御）。
  const readyKey = useRef('')
  useEffect(() => {
    setArmed(null)
    if (isDemo) { setJobs([]); setManualUn([]); readyKey.current = boardKey; return }
    let cancelled = false; readyKey.current = ''
    fetch('/api/dispatch').then(r => r.json()).then(d => {
      if (cancelled) return
      const data = d.data || {}; const st = data[boardKey] || {}
      setJobs(Array.isArray(st.jobs) ? st.jobs : [])
      setManualUn(Array.isArray(st.manualUn) ? st.manualUn : [])
      if (Array.isArray(data._fleet) && data._fleet.length) setVehicles(data._fleet)
      readyKey.current = boardKey
    }).catch(() => { if (!cancelled) { setJobs([]); setManualUn([]); readyKey.current = boardKey } })
    return () => { cancelled = true }
  }, [boardKey, isDemo])

  // 割当・車両の変更を日付別に自動保存（デモは保存しない・読み込み前は保存しない）
  const saveTimer = useRef(null)
  useEffect(() => {
    if (isDemo || readyKey.current !== boardKey) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch('/api/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: boardKey, jobs, manualUn, fleet: vehicles }) }).catch(() => {})
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [jobs, manualUn, vehicles, boardKey, isDemo])

  // ツールチップ(hover詳細)が画面に残る不具合対策：モーダルを開いた時、
  // またはクリック/スクロールが起きた時に必ず閉じる（mouseleaveが発火しないケースの保険）。
  useEffect(() => { if (showCreate || showVeh) setTip(null) }, [showCreate, showVeh])
  useEffect(() => {
    if (!tip) return
    const clear = () => setTip(null)
    document.addEventListener('click', clear, true)
    window.addEventListener('scroll', clear, true)
    return () => { document.removeEventListener('click', clear, true); window.removeEventListener('scroll', clear, true) }
  }, [tip])

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
    if (!u) { setArmed(null); return }
    const dur = u.cat === 'move' ? 3 : 1.5
    const clash = jobs.some(j => j.v === vKey && hour < (j.s + j.d) && (hour + dur) > j.s)
    const isExt = !!(vehOf(vKey) || {}).ext
    const id = 'j' + (++idRef.current)
    setJobs(prev => [...prev, { id, contractId: u.contractId, v: vKey, cat: u.cat, name: u.name, crew: u.crew, from: u.from, to: u.to, s: hour, d: dur, st: clash ? 'conflict' : 'tentative', src: String(u.src || '').toUpperCase(), amt: u.amt || 0, extJob: isExt, locked: false }])
    // 成約由来カードはjobsのcontractIdでderive除外される。手動カード(manualUn)だけ実配列から取り除く。
    if (armed >= contractCardsAvail.length) { const mi = armed - contractCardsAvail.length; setManualUn(prev => prev.filter((_, i) => i !== mi)) }
    setArmed(null)
    toast(clash ? '割り当てました（時間重複あり・要確認）' : '割り当てました')
  }

  // 配置済みカードを別の車両／時間へ移動（ドラッグ＆ドロップ）。ロック中は不可。時間が重なれば conflict。
  const moveJob = (id, vKey, hour) => {
    if (!id) return
    const j = jobs.find(x => x.id === id)
    if (!j || j.locked) return
    if (j.v === vKey && j.s === hour) return // 同じ位置なら何もしない
    const clash = jobs.some(o => o.id !== id && o.v === vKey && hour < (o.s + o.d) && (hour + j.d) > o.s)
    const isExt = !!(vehOf(vKey) || {}).ext
    setJobs(prev => prev.map(x => x.id === id
      ? { ...x, v: vKey, s: hour, st: clash ? 'conflict' : (x.st === 'confirmed' ? 'confirmed' : 'tentative'), extJob: isExt }
      : x))
    toast(clash ? '移動しました（時間重複あり・要確認）' : '移動しました')
  }

  // 配置済みカードのロック切替
  const toggleLock = (id) => setJobs(prev => prev.map(j => j.id === id ? { ...j, locked: !j.locked } : j))

  // 配置済みカードを未手配一覧に戻す（ロック中は不可）
  const jobToUn = (j) => ({ contractId: j.contractId, cat: j.cat, name: j.name, crew: j.crew, need: (vehOf(j.v) || {}).cls || '—', from: j.from, to: j.to, whn: '本日 ' + fmt(j.s), src: String(j.src || 'hp').toLowerCase(), amt: j.amt || 0 })
  const returnJob = (id) => {
    const j = jobs.find(x => x.id === id)
    if (!j || j.locked) return
    setJobs(prev => prev.filter(x => x.id !== id))
    if (!j.contractId) setManualUn(prev => [jobToUn(j), ...prev]) // 成約由来はderiveで自動的に未手配へ戻る
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
      const manualOrphans = orphaned.filter(j => !j.contractId).map(jobToUn) // 成約由来はderiveで戻る
      if (manualOrphans.length) setManualUn(prev => [...manualOrphans, ...prev])
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

      {/* ===== 配車ルートマップ ===== */}
      <DispatchMap vehicles={vehicles} jobs={jobs} show={show} />

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
                  <div className={'db-lane' + (armed !== null || dragId ? ' armed' : '')}>
                    {/* 空き枠（クリックで割当／ドラッグ中はドロップ先） */}
                    {Array.from({ length: COLS }, (_, i) => (
                      <div key={i} className="db-slot" style={{ left: pctL(START + i) + '%' }}
                        onClick={() => assignHere(v.key, START + i)}
                        onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                        onDrop={(e) => { e.preventDefault(); const id = dragId || e.dataTransfer.getData('text/plain'); moveJob(id, v.key, START + i); setDragId(null) }} />
                    ))}
                    {/* ジョブブロック（ロック中以外はドラッグで他車両へ移動可） */}
                    {jobs.filter(j => j.v === v.key && show(j.cat)).map((j) => (
                      <div key={j.id} className={jobClass(j) + (j.locked ? ' locked' : '') + (dragId === j.id ? ' dragging' : '')}
                        draggable={!j.locked}
                        onDragStart={(e) => { setTip(null); setDragId(j.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', j.id) } catch {} }}
                        onDragEnd={() => setDragId(null)}
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
          <div className="db-side-hint">カードを選び、ボードの空き枠をクリックで割り当て。配置済みカードはドラッグで別の車両へ移動できます。</div>
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
        <CreateModal onClose={() => setShowCreate(false)} onAdd={(u) => { setManualUn(prev => [u, ...prev]); setShowCreate(false); toast('未手配に追加しました') }} />
      )}
      {showVeh && (
        <VehicleModal vehicles={vehicles} jobs={jobs} onClose={() => setShowVeh(false)} onApply={applyVehicles} />
      )}
    </div>
  )
}

// ===== 配車ルートマップ =====
// キー対応：Google Maps APIキーがあれば本物の地図＋実道路ルートを描画し、
// 無ければ福岡都市圏の区・市の相対座標をSVGに投影した概略図に自動フォールバックする。
// キーは VITE_GOOGLE_MAPS_KEY（ビルド時）または localStorage 'tf_gmaps_key'（動作確認用）から取得。
// ※クライアント側Mapsキーは元々ブラウザに露出する前提。Google側でリファラー制限して保護すること。
const GMAPS_KEY = ((import.meta && import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_KEY) ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('tf_gmaps_key')) || '').trim()

const COORDS = {
  '博多区': [130.420, 33.590], '中央区': [130.395, 33.585], '南区': [130.425, 33.555],
  '城南区': [130.375, 33.560], '早良区': [130.340, 33.560], '西区': [130.290, 33.580],
  '東区': [130.430, 33.650], '春日市': [130.470, 33.530], '春日': [130.470, 33.530],
  '大野城市': [130.480, 33.535], '大野城': [130.478, 33.533], '筑紫野': [130.520, 33.495],
  '糸島市': [130.195, 33.560], '糸島': [130.200, 33.558], '新宮町': [130.440, 33.720],
  '粕屋町': [130.470, 33.610], '北九州': [130.870, 33.850], '福岡市': [130.400, 33.590],
}
const coordOf = (name) => {
  if (!name || name === '—') return null
  if (COORDS[name]) return COORDS[name]
  const hit = Object.keys(COORDS).find(kk => name.includes(kk))
  return hit ? COORDS[hit] : null
}
// 車両ごとのルート色（画像イメージ：オレンジ／青／緑…）
const ROUTE_COLORS = ['#f97316', '#2563eb', '#16a34a', '#7c3aed', '#e11d48', '#0891b2', '#ca8a04', '#0d9488']
const gmapUrl = (names) => {
  const q = names.map(n => encodeURIComponent(n + ' 福岡'))
  if (q.length === 1) return 'https://www.google.com/maps/search/?api=1&query=' + q[0]
  const way = q.slice(1, -1).join('%7C')
  let u = 'https://www.google.com/maps/dir/?api=1&origin=' + q[0] + '&destination=' + q[q.length - 1]
  if (way) u += '&waypoints=' + way
  return u
}

// 各車両の停車地列（from→to・時刻順、連続重複を除去）を作る。両モード共通。
function computeVehicleRoutes(vehicles, jobs, show) {
  return vehicles.map((v, idx) => {
    const vj = jobs.filter(j => j.v === v.key && show(j.cat)).sort((a, b) => a.s - b.s)
    const raw = []
    vj.forEach(j => { raw.push(j.from); if (j.to && j.to !== '—') raw.push(j.to) })
    const stops = raw.filter((s, i) => i === 0 || s !== raw[i - 1])
    return { v, color: ROUTE_COLORS[idx % ROUTE_COLORS.length], stops }
  }).filter(r => r.stops.length > 0)
}

// 凡例（車両→色＋経路＋Googleマップリンク）。両モード共通。
// カード群は固定高さ＋縦スクロール（地図と高さを揃え、下部の余白を作らない）。注記はスクロール外に常時表示。
function RouteLegend({ routes, note }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="db-legend-scroll">
        {routes.map((r, ri) => (
          <div key={ri} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 14, height: 4, borderRadius: 2, background: r.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700 }}>{r.v.ext ? '外注' : '#' + r.v.id}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{r.v.cls}</span>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--sub)', margin: '5px 0 6px', lineHeight: 1.4 }}>{r.stops.join(' → ')}</div>
            <a href={gmapUrl(r.stops)} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textDecoration: 'none' }}>🗺 Googleマップで開く ›</a>
          </div>
        ))}
      </div>
      {note && <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.5, marginTop: 2 }}>{note}</div>}
    </div>
  )
}

// 概略図モード（キー無し）：区の相対座標をSVGに投影して色分け表示
function SchematicMap({ routes }) {
  const W = 760, H = 360, pad = 46
  const g = useMemo(() => {
    const withC = routes.map(r => ({ ...r, pts: r.stops.map(n => ({ name: n, c: coordOf(n) })).filter(x => x.c) })).filter(r => r.pts.length > 0)
    const all = withC.flatMap(r => r.pts.map(p => p.c))
    if (!all.length) return null
    const xs = all.map(p => p[0]), ys = all.map(p => p[1])
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
    const spanX = (maxX - minX) || 0.02, spanY = (maxY - minY) || 0.02
    const proj = ([lng, lat]) => [pad + ((lng - minX) / spanX) * (W - 2 * pad), pad + ((maxY - lat) / spanY) * (H - 2 * pad)]
    const seen = {}, labels = []
    withC.forEach(r => r.pts.forEach(s => { if (!seen[s.name]) { seen[s.name] = 1; labels.push({ name: s.name, p: proj(s.c) }) } }))
    return { withC, proj, labels }
  }, [routes])

  // Googleマップ風の装飾（陸地・水域・緑地・道路網）。地理的正確さではなく“地図らしさ”のための背景。
  const LAND = '#EAEDE4'
  const roads = [
    `M0 ${H * 0.30} Q ${W * 0.45} ${H * 0.22} ${W} ${H * 0.40}`,
    `M0 ${H * 0.66} Q ${W * 0.5} ${H * 0.74} ${W} ${H * 0.60}`,
    `M${W * 0.22} 0 Q ${W * 0.30} ${H * 0.5} ${W * 0.18} ${H}`,
    `M${W * 0.62} 0 Q ${W * 0.56} ${H * 0.5} ${W * 0.70} ${H}`,
    `M0 ${H * 0.5} L ${W} ${H * 0.5}`,
  ]

  return (
    <div className="db-maprow">
      <div className="db-mapbox">
        {g ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
            {/* 陸地 */}
            <rect x="-2" y="-2" width={W + 4} height={H + 4} fill={LAND} />
            {/* 水域・緑地（うっすら） */}
            <ellipse cx={W * 0.86} cy={H * 0.14} rx={W * 0.26} ry={H * 0.32} fill="#C7DDF0" opacity="0.55" />
            <ellipse cx={W * 0.13} cy={H * 0.86} rx={W * 0.20} ry={H * 0.22} fill="#D5E7C9" opacity="0.6" />
            {/* 道路網：グレーの縁取り(下)→白(上)で“道路らしさ” */}
            {roads.map((rd, i) => <path key={'rc' + i} d={rd} fill="none" stroke="#DADCE0" strokeWidth={i === 4 ? 8.5 : 6.5} strokeLinecap="round" opacity="0.5" />)}
            {roads.map((rd, i) => <path key={'rw' + i} d={rd} fill="none" stroke="#FFFFFF" strokeWidth={i === 4 ? 6.5 : 4.5} strokeLinecap="round" opacity="0.9" />)}
            {/* ルート（白casing → 車両色。Googleの経路ラインに近づける） */}
            {g.withC.map((r, ri) => {
              const pts = r.pts.map(s => g.proj(s.c))
              const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
              return (
                <g key={ri}>
                  {pts.length > 1 && <path d={d} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />}
                  {pts.length > 1 && <path d={d} fill="none" stroke={r.color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />}
                  {pts.map((p, pi) => (
                    <circle key={pi} cx={p[0]} cy={p[1]} r={pi === 0 ? 6 : 5}
                      fill={pi === 0 ? r.color : '#fff'} stroke={r.color} strokeWidth="2.5" />
                  ))}
                </g>
              )
            })}
            {/* 地名ラベル（マップ風タイポ＋白フチで可読性確保） */}
            {g.labels.map((l, i) => (
              <text key={i} x={l.p[0] + 8} y={l.p[1] - 6} fontSize="11.5" fontWeight="600" fill="#5F6368" stroke="#fff" strokeWidth="3.2" paintOrder="stroke" style={{ paintOrder: 'stroke' }}>{l.name}</text>
            ))}
          </svg>
        ) : <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 24 }}>地図に表示できる地名がありません</div>}
      </div>
      <RouteLegend routes={routes} note={'※ 概略図は区の相対位置ベース。実際の道路経路は「Googleマップで開く」で確認できます。Google Mapsキーを設定すると実地図に切り替わります。'} />
    </div>
  )
}

// Google Maps JS の遅延ロード（1回だけ）。認証失敗は gm_authFailure で検知。
let gmapsPromise = null
function loadGmaps(key) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.google && window.google.maps) return Promise.resolve()
  if (gmapsPromise) return gmapsPromise
  gmapsPromise = new Promise((resolve, reject) => {
    let done = false
    const finish = (fn, arg) => { if (!done) { done = true; fn(arg) } }
    window.__tfGmapsCb = () => finish(resolve)
    window.gm_authFailure = () => finish(reject, new Error('auth'))
    const s = document.createElement('script')
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&callback=__tfGmapsCb'
    s.async = true; s.defer = true
    s.onerror = () => finish(reject, new Error('load'))
    setTimeout(() => finish(reject, new Error('timeout')), 12000) // 応答が無ければ12秒で諦めて概略図へ
    document.head.appendChild(s)
  })
  gmapsPromise.catch(() => { gmapsPromise = null }) // 失敗時は次回リトライできるよう解放
  return gmapsPromise
}
const dirCache = new Map() // 同一停車列の経路計算を使い回す（API呼び出し削減）

// 実地図モード（キーあり）：Directions API の実道路ルートを車両ごとに色分け描画
function GoogleRouteMap({ routes }) {
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const overlays = useRef([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [err, setErr] = useState('')
  const sig = routes.map(r => r.v.key + ':' + r.stops.join('>')).join('|')

  useEffect(() => {
    let alive = true
    loadGmaps(GMAPS_KEY).then(() => {
      if (!alive) return
      if (!mapObj.current && mapRef.current) {
        mapObj.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: 33.59, lng: 130.40 }, zoom: 11,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        })
      }
      setStatus('ready')
    }).catch(e => { if (alive) { setErr(e.message || 'error'); setStatus('error') } })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (status !== 'ready' || !mapObj.current || !window.google) return
    const g = window.google, map = mapObj.current
    overlays.current.forEach(o => { try { o.setMap(null) } catch {} }); overlays.current = []
    const bounds = new g.maps.LatLngBounds()
    const svc = new g.maps.DirectionsService()
    let cancelled = false

    const pin = (pos, color, scale) => { const m = new g.maps.Marker({ position: pos, map, icon: { path: g.maps.SymbolPath.CIRCLE, scale, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 1.8 } }); overlays.current.push(m); bounds.extend(pos) }

    const draw = (r) => new Promise((resolve) => {
      const names = r.stops
      const place = (result) => {
        if (cancelled || !result) return resolve()
        const rend = new g.maps.DirectionsRenderer({ map, suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: r.color, strokeWeight: 5, strokeOpacity: 0.85 } })
        rend.setDirections(result); overlays.current.push(rend)
        const legs = result.routes[0].legs
        legs.forEach((leg, i) => { if (i === 0) pin(leg.start_location, r.color, 9); pin(leg.end_location, r.color, 7) })
        try { map.fitBounds(bounds) } catch {}
        resolve()
      }
      const cacheKey = names.join('>')
      if (dirCache.has(cacheKey)) { place(dirCache.get(cacheKey)); return }
      if (names.length < 2) { // 単一地点：ジオコーディングして1ピン
        new g.maps.Geocoder().geocode({ address: names[0] + ' 福岡' }, (res, st) => {
          if (st === 'OK' && res[0]) { pin(res[0].geometry.location, r.color, 8); try { map.fitBounds(bounds) } catch {} }
          resolve()
        })
        return
      }
      svc.route({
        origin: names[0] + ' 福岡', destination: names[names.length - 1] + ' 福岡',
        waypoints: names.slice(1, -1).map(n => ({ location: n + ' 福岡', stopover: true })),
        optimizeWaypoints: true, travelMode: g.maps.TravelMode.DRIVING,
      }, (result, st) => {
        if (st === 'OK') { dirCache.set(cacheKey, result); place(result) }
        else if (st === 'REQUEST_DENIED') { setErr('REQUEST_DENIED'); setStatus('error'); resolve() }
        else resolve() // ZERO_RESULTS 等は無視して次へ
      })
    })

    ;(async () => { for (const r of routes) { if (cancelled) break; await draw(r) } })() // 逐次実行でレート超過を回避
    return () => { cancelled = true }
  }, [status, sig])

  if (status === 'error') { // 失敗時は概略図にフォールバック
    return (
      <>
        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>Googleマップを表示できませんでした（{err}）。概略図を表示します。APIキー・請求先・リファラー制限をご確認ください。</div>
        <SchematicMap routes={routes} />
      </>
    )
  }
  return (
    <div className="db-maprow">
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div ref={mapRef} style={{ width: '100%', height: 340 }} />
        {status === 'loading' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#F1F5F9', fontSize: 12, color: 'var(--muted)' }}>地図を読み込み中…</div>}
      </div>
      <RouteLegend routes={routes} note={'※ 巡回順は自動最適化。線は実際の道路に沿った経路です。'} />
    </div>
  )
}

// ラッパー：APIキーがあれば実地図、無ければ概略図に自動フォールバック。
// キーがある場合はトグルでGoogleマップAPIのON/OFFを切替可（OFFで概略図＝API呼び出し0）。
// OFF状態は localStorage 'tf_gmaps_off' に保存し、リロード後も維持する。
function DispatchMap({ vehicles, jobs, show }) {
  const routes = useMemo(() => computeVehicleRoutes(vehicles, jobs, show), [vehicles, jobs, show])
  const hasKey = !!GMAPS_KEY
  const [gmapOn, setGmapOn] = useState(() => {
    try { return hasKey && localStorage.getItem('tf_gmaps_off') !== '1' } catch { return hasKey }
  })
  const toggle = () => setGmapOn(prev => {
    const next = !prev
    try { localStorage.setItem('tf_gmaps_off', next ? '0' : '1') } catch {}
    return next
  })
  const useGmap = hasKey && gmapOn
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <h3>🗺 配車ルートマップ <span className="c-sub">· 各車両の進行ルート</span></h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="c-sub">{hasKey ? (gmapOn ? 'Googleマップ' : '非表示（API OFF）') : '区の相対位置に基づく概略図'}</span>
          {hasKey && (
            <button type="button" onClick={toggle}
              title={gmapOn ? 'Googleマップ APIを使用中（クリックでマップ非表示＝API呼び出し停止）' : 'マップ非表示中（クリックでGoogleマップを表示）'}
              className={'db-gmap-toggle' + (gmapOn ? ' on' : '')}>
              <span className="knob" />
              <span className="lbl">Googleマップ API {gmapOn ? 'ON' : 'OFF'}</span>
            </button>
          )}
        </div>
      </div>
      <div className="card-body" style={{ padding: 12 }}>
        {hasKey && !gmapOn
          ? <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 24 }}>GoogleマップAPIはOFFです。マップは表示されません（トグルをONにすると表示します）。</div>
          : routes.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 24 }}>表示できるルートがありません</div>
            : (useGmap ? <GoogleRouteMap routes={routes} /> : <SchematicMap routes={routes} />)}
      </div>
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
