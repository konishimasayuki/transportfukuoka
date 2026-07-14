// 配車ボード（車両 × 時間）
// スケジュールページの「配車ボード」表示モード本体。
// - KPI（稼働率／確定・仮・未手配／売上見込／外注／重複アラート）
// - ボードグリッド：1行=1車両、08:00–19:00の11列に各ジョブを絶対配置
// - 未手配パネル：カード選択 → ボードの空き枠クリックで割当（時間重複は赤で検知）
// - 配置済みカードは「未手配に戻す」、クリックで詳細モーダル（成約と同じ情報・編集可）
// - 車両／乗務員の設定（追加・編集・削除）
// - 外注枠は初期非表示。「外注枠を追加」で必要なときだけ追加する。
// データはダミー配列（後で /api/schedule 等の実データ・型に差し替え可能）。
// 車両は内部キー(key)で参照し、号車番号(id)を変更してもジョブの紐付けが壊れない設計。
import { useState, useMemo, useRef, useEffect } from 'react'
import { DEFAULT_FLEET, DEFAULT_CREW } from '../lib/fleet'
import ContractDetailModal, { EMPTY_CONTRACT } from './ContractDetailModal'

const START = 8, END = 19, COLS = END - START // 08:00–19:00 = 11列
const CAT_NAME = { move: '引っ越し', quote: '見積り', box: '段ボール配達' }
const money = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP')
const fmt = (h) => { const H = Math.floor(h), M = Math.round((h - H) * 60); return String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0') }
const pctL = (h) => ((h - START) / COLS) * 100
const pctW = (d) => (d / COLS) * 100

// ---- 初期ダミーデータ（外注枠は含めない：必要時に追加）----
// 車両フリートの初期値は設定「トラック設定」と共有（src/lib/fleet.js）。
const INIT_VEHICLES = DEFAULT_FLEET
// ※すべて架空のサンプル（氏名は「サンプル○様」）。現在は初期表示に未使用（実データ/成約由来から生成）。
const INIT_JOBS = [
  { id: 'j1', v: 'v1', cat: 'move', name: 'サンプルA 様', crew: '2名', from: '早良区', to: '中央区', s: 9, d: 3, st: 'confirmed', src: 'SUUMO', amt: 52000 },
  { id: 'j2', v: 'v1', cat: 'quote', name: 'サンプルB 様', crew: '2名', from: '南区', to: '—', s: 14, d: 1.5, st: 'tentative', src: 'HP', amt: 0 },
  { id: 'j3', v: 'v2', cat: 'move', name: 'サンプルC 様', crew: '2名', from: '春日市', to: '大野城市', s: 10, d: 3, st: 'confirmed', src: 'ZBT', amt: 63000 },
  { id: 'j4', v: 'v2', cat: 'move', name: 'サンプルD 様', crew: '2名', from: '大野城', to: '筑紫野', s: 12, d: 2, st: 'conflict', src: 'HP', amt: 48000 },
  { id: 'j5', v: 'v3', cat: 'move', name: 'サンプルE 様', crew: '3名', from: '西区', to: '糸島市', s: 9, d: 4.5, st: 'confirmed', src: 'SUUMO', amt: 98000 },
  { id: 'j6', v: 'v3', cat: 'box', name: 'サンプルF 様', crew: '1名', from: '糸島', to: '—', s: 15, d: 1.5, st: 'tentative', src: 'HP', amt: 0 },
  { id: 'j7', v: 'v4', cat: 'move', name: 'サンプルG 様', crew: '3名', from: '東区', to: '新宮町', s: 8.5, d: 5, st: 'confirmed', src: 'ZBT', amt: 132000 },
  { id: 'j8', v: 'v5', cat: 'quote', name: 'サンプルH 様', crew: '1名', from: '博多区', to: '—', s: 8.5, d: 1.5, st: 'confirmed', src: 'HP', amt: 0 },
  { id: 'j9', v: 'v5', cat: 'move', name: 'サンプルI 様', crew: '1名', from: '中央区', to: '中央区', s: 11, d: 1.5, st: 'confirmed', src: 'SUUMO', amt: 19000 },
  { id: 'j10', v: 'v5', cat: 'box', name: 'サンプルJ 様', crew: '1名', from: '城南区', to: '—', s: 13.5, d: 1.5, st: 'tentative', src: 'HP', amt: 0 },
]
const INIT_UN = [
  { cat: 'move', name: 'サンプルK 様', crew: '2名', need: '2t', from: '南区', to: '城南区', whn: '7/3 09:00', src: 'suumo' },
  { cat: 'box', name: 'サンプルL 様', crew: '1名', need: '軽', from: '博多区', to: '—', whn: '7/3 14:00', src: 'zbt' },
  { cat: 'quote', name: 'サンプルM 様', crew: '1名', need: '軽', from: '中央区', to: '—', whn: '7/3 08:00', src: 'hp' },
  { cat: 'move', name: 'サンプルN 様', crew: '2名', need: '2t', from: '早良区', to: '西区', whn: '7/3 13:00', src: 'suumo' },
  { cat: 'move', name: 'サンプルO 様', crew: '2名', need: '2tロング', from: '東区', to: '粕屋町', whn: '7/3 15:30', src: 'hp' },
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

export default function DispatchBoard({ filter, onToast, contracts = [], onUpdateContract, boardDate = new Date(), isDemo = false }) {
  const [vehicles, setVehicles] = useState(INIT_VEHICLES)
  const [jobs, setJobs] = useState([])          // その日の割当（/api/dispatch で日付別に保存）
  const [manualUn, setManualUn] = useState([])  // 成約以外の未手配カード（手動追加・非成約の戻し）。成約由来は下でderive
  const [armed, setArmed] = useState(null)   // 選択中の未手配カードindex
  const [dragId, setDragId] = useState(null) // ドラッグ中の配置済みジョブid（車両間移動）
  const [editCrew, setEditCrew] = useState(null) // 乗務員ラベル選択中の車両key
  const [crewList, setCrewList] = useState(DEFAULT_CREW) // 選択できる乗務員(班)ラベル（設定→乗務員設定）
  const [crewMap, setCrewMap] = useState({})     // その日の乗務員割当 { 車両key: ラベル }（日付別・他日と非共有）
  const [tip, setTip] = useState(null)       // ツールチップ { job, x, y }
  const [showVeh, setShowVeh] = useState(false)
  const [jobDetail, setJobDetail] = useState(null) // クリックした配置済みジョブ（詳細モーダル表示用）
  const idRef = useRef(1000)                 // 新規ジョブのid採番
  const extRef = useRef(0)                   // 外注枠の連番
  const boardRef = useRef(null)              // 左ボードの高さ計測用
  const [sideH, setSideH] = useState(null)   // 未手配パネルの高さ（左ボードに合わせる）
  const toast = onToast || (() => {})
  const boardKey = ymd(boardDate)
  const show = (c) => !filter || filter[c] !== false // カテゴリチップの絞り込み
  const vehOf = (key) => vehicles.find(v => v.key === key)

  // 未手配パネルの高さを左ボードに合わせる（2カラム時のみ。中身が多ければ内部スクロール）
  useEffect(() => {
    const el = boardRef.current
    if (!el || typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return
    const mq = window.matchMedia('(min-width: 1181px)')
    const update = () => setSideH(mq.matches ? el.offsetHeight : null)
    const ro = new ResizeObserver(update); ro.observe(el)
    if (mq.addEventListener) mq.addEventListener('change', update); else mq.addListener(update)
    update()
    return () => { ro.disconnect(); if (mq.removeEventListener) mq.removeEventListener('change', update); else mq.removeListener(update) }
  }, [])

  // 未手配案件＝その日(配車日)の“進行中の成約”からderive（割当済みは除く）＋ 手動カード(manualUn)
  const contractCards = useMemo(() => (contracts || []).filter(c => isActiveContract(c) && c.date === boardKey).map(contractToCard), [contracts, boardKey])
  const contractCardsAvail = useMemo(() => { const a = new Set(jobs.map(j => j.contractId).filter(Boolean)); return contractCards.filter(cd => !a.has(cd.contractId)) }, [contractCards, jobs])
  const unassigned = useMemo(() => [...contractCardsAvail, ...manualUn], [contractCardsAvail, manualUn])

  // 日付別に保存済みの割当を読み込み（デモは日付ごとに空から）。読み込み完了前は保存しない（readyKeyで制御）。
  const readyKey = useRef('')
  useEffect(() => {
    setArmed(null)
    // 乗務員の初期割当（日付にまだ保存がない場合の既定値）＝フリートの既定乗務員。以後は日付別に独立。
    const seedCrew = (fleet) => Object.fromEntries((fleet || []).map(v => [v.key, v.crew || '']))
    if (isDemo) {
      setJobs([]); setManualUn([]); setCrewList(DEFAULT_CREW)
      setVehicles(DEFAULT_FLEET); setCrewMap(seedCrew(DEFAULT_FLEET))
      readyKey.current = boardKey; return
    }
    let cancelled = false; readyKey.current = ''
    fetch('/api/dispatch').then(r => r.json()).then(d => {
      if (cancelled) return
      const data = d.data || {}; const st = data[boardKey] || {}
      const fleet = (Array.isArray(data._fleet) && data._fleet.length) ? data._fleet : DEFAULT_FLEET
      setVehicles(fleet)
      setJobs(Array.isArray(st.jobs) ? st.jobs : [])
      setManualUn(Array.isArray(st.manualUn) ? st.manualUn : [])
      setCrewList(Array.isArray(data._crew) && data._crew.length ? data._crew : DEFAULT_CREW)
      // その日に保存済みの乗務員があればそれを、無ければフリート既定で初期化（編集は日付別に保存）
      setCrewMap(st.crew && Object.keys(st.crew).length ? st.crew : seedCrew(fleet))
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
      // 車両フリートは名前・大きさのみ（全日共通）。乗務員(crew)はその日の割当として日付別に保存。
      const fleet = vehicles.map(v => ({ key: v.key, id: v.id, cls: v.cls, ...(v.ext ? { ext: true } : {}) }))
      fetch('/api/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: boardKey, jobs, manualUn, crew: crewMap, fleet }) }).catch(() => {})
    }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [jobs, manualUn, crewMap, vehicles, boardKey, isDemo])

  // ツールチップ(hover詳細)が画面に残る不具合対策：モーダルを開いた時、
  // またはクリック/スクロールが起きた時に必ず閉じる（mouseleaveが発火しないケースの保険）。
  useEffect(() => { if (showVeh) setTip(null) }, [showVeh])
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
    setJobs(prev => [...prev, { id, contractId: u.contractId, v: vKey, cat: u.cat, name: u.name, crew: u.crew, from: u.from, to: u.to, s: hour, d: dur, st: clash ? 'conflict' : 'tentative', src: String(u.src || '').toUpperCase(), amt: u.amt || 0, extJob: isExt }])
    // 成約由来カードはjobsのcontractIdでderive除外される。手動カード(manualUn)だけ実配列から取り除く。
    if (armed >= contractCardsAvail.length) { const mi = armed - contractCardsAvail.length; setManualUn(prev => prev.filter((_, i) => i !== mi)) }
    setArmed(null)
    toast(clash ? '割り当てました（時間重複あり・要確認）' : '割り当てました')
  }

  // 配置済みカードを別の車両／時間へ移動（ドラッグ＆ドロップ）。時間が重なれば conflict。
  const moveJob = (id, vKey, hour) => {
    if (!id) return
    const j = jobs.find(x => x.id === id)
    if (!j) return
    if (j.v === vKey && j.s === hour) return // 同じ位置なら何もしない
    const clash = jobs.some(o => o.id !== id && o.v === vKey && hour < (o.s + o.d) && (hour + j.d) > o.s)
    const isExt = !!(vehOf(vKey) || {}).ext
    setJobs(prev => prev.map(x => x.id === id
      ? { ...x, v: vKey, s: hour, st: clash ? 'conflict' : (x.st === 'confirmed' ? 'confirmed' : 'tentative'), extJob: isExt }
      : x))
    toast(clash ? '移動しました（時間重複あり・要確認）' : '移動しました')
  }

  // 乗務員をボード上でラベル選択（クリック→ドロップダウンから選ぶ）。割当はその日のみ（日付別）。
  const startEditCrew = (v) => setEditCrew(v.key)
  const chooseCrew = (vKey, val) => {
    setCrewMap(prev => ({ ...prev, [vKey]: val }))
    setEditCrew(null)
    toast(val ? '乗務員を割り当てました' : '乗務員を未割当にしました')
  }

  // 配置済みカードを未手配一覧に戻す
  const jobToUn = (j) => ({ contractId: j.contractId, cat: j.cat, name: j.name, crew: j.crew, need: (vehOf(j.v) || {}).cls || '—', from: j.from, to: j.to, whn: '本日 ' + fmt(j.s), src: String(j.src || 'hp').toLowerCase(), amt: j.amt || 0 })
  const returnJob = (id) => {
    const j = jobs.find(x => x.id === id)
    if (!j) return
    setJobs(prev => prev.filter(x => x.id !== id))
    if (!j.contractId) setManualUn(prev => [jobToUn(j), ...prev]) // 成約由来はderiveで自動的に未手配へ戻る
    toast('未手配に戻しました')
  }

  // 配置済みジョブをクリック → 成約と同じ情報を出す詳細モーダルを開く（編集可）。
  const openJobDetail = (j) => setJobDetail(j)
  // 成約由来のジョブなら対応する成約レコード、そうでなければジョブ自身の情報から仮の成約風データを作る。
  const jobDetailItem = useMemo(() => {
    if (!jobDetail) return null
    if (jobDetail.contractId) {
      const c = contracts.find(c => c.id === jobDetail.contractId)
      if (c) return c
    }
    return {
      ...EMPTY_CONTRACT, id: jobDetail.id, name: jobDetail.name,
      srcLabel: SRC_TXT[String(jobDetail.src || '').toLowerCase()] || jobDetail.src || '',
      fromAddress: jobDetail.from, toAddress: jobDetail.to,
      route: [jobDetail.from, jobDetail.to].filter(s => s && s !== '—').join(' → '),
      persons: jobDetail.crew, amount: jobDetail.amt || 0,
      date: boardKey, status: '成約済み',
    }
  }, [jobDetail, contracts, boardKey])
  // 詳細モーダルの保存：成約由来なら /api/contracts を更新（親経由）し、ボード上のジョブ表示も同期。
  // 成約由来でなければ（手動追加のジョブ）ジョブ自身の情報を直接更新する。
  const saveJobDetail = async (payload) => {
    if (!jobDetail) return
    if (jobDetail.contractId && onUpdateContract) {
      await onUpdateContract(jobDetail.contractId, payload)
    }
    setJobs(prev => prev.map(j => j.id === jobDetail.id
      ? { ...j, name: payload.name, from: payload.fromAddress || j.from, to: payload.toAddress || j.to, amt: Number(payload.amount) || 0 }
      : j))
    setJobDetail(null)
    toast('保存しました')
  }

  // 成約・リード由来でない未手配カード(manualUn)の削除。成約由来はderive元なのでここでは消せない。
  const removeManualUn = (mi) => {
    setManualUn(prev => prev.filter((_, idx) => idx !== mi))
    setArmed(null) // インデックスずれ防止で選択解除
    toast('未手配を削除しました')
  }

  // 外注枠の追加
  const addExt = () => {
    const n = ++extRef.current
    setVehicles(prev => [...prev, { key: 'ext' + n + '_' + prev.length, id: 'EXT' + n, cls: '外注枠', crew: '協力会社 未指定', n: 0, ext: true }])
    toast('外注枠を追加しました')
  }

  // 車両設定モーダルからの反映。削除された車両のジョブは未手配へ戻す。
  const applyVehicles = (draft) => {
    const keys = new Set(draft.map(v => v.key))
    const orphaned = jobs.filter(j => !keys.has(j.v))
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
        <div className="db-wrap" ref={boardRef}>
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
                    <div style={{ minWidth: 0 }}>
                      <div className="db-vt">{v.cls}</div>
                      {editCrew === v.key ? (
                        <select className="db-crew-input" autoFocus value={crewMap[v.key] || ''}
                          onChange={e => chooseCrew(v.key, e.target.value)}
                          onBlur={() => setEditCrew(null)}
                          onKeyDown={e => { if (e.key === 'Escape') setEditCrew(null) }}>
                          <option value="">（未割当）</option>
                          {/* その日に他車両へ割当済みの乗務員は選べないよう非表示。この車両の現在値は残す */}
                          {crewList.filter(c => c === crewMap[v.key] || !Object.entries(crewMap).some(([k, cc]) => k !== v.key && cc === c)).map(c => <option key={c} value={c}>{c}</option>)}
                          {crewMap[v.key] && !crewList.includes(crewMap[v.key]) && <option value={crewMap[v.key]}>{crewMap[v.key]}</option>}
                        </select>
                      ) : crewMap[v.key] ? (
                        <div className="db-vc db-vc-edit" title="クリックで乗務員を変更" onClick={() => startEditCrew(v)}>
                          {crewMap[v.key]}<span className="db-vc-pen">▾</span>
                        </div>
                      ) : (
                        <div className="db-vc-unassigned" title="クリックで乗務員を割り当て" onClick={() => startEditCrew(v)}>
                          ⚠ 乗務員 未割当
                        </div>
                      )}
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
                    {/* ジョブブロック（ドラッグで他車両へ移動可・クリックで詳細モーダル） */}
                    {jobs.filter(j => j.v === v.key && show(j.cat)).map((j) => (
                      <div key={j.id} className={jobClass(j) + (dragId === j.id ? ' dragging' : '')}
                        draggable
                        onDragStart={(e) => { setTip(null); setDragId(j.id); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', j.id) } catch {} }}
                        onDragEnd={() => setDragId(null)}
                        style={{ left: pctL(j.s) + '%', width: `calc(${pctW(j.d)}% - 6px)`, cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); openJobDetail(j) }}
                        onMouseMove={(e) => moveTip(e, j)} onMouseLeave={() => setTip(null)}>
                        <div className="db-acts">
                          <button title="未手配に戻す" onClick={(e) => { e.stopPropagation(); returnJob(j.id) }}>↩</button>
                        </div>
                        <div className="jt">
                          {j.st === 'conflict' && <span title="時間重複の疑い">⚠ </span>}
                          {j.name}
                          {j.st === 'tentative' && <span className="db-tag">仮</span>}
                          {j.extJob && <span className="db-tag">外注</span>}
                        </div>
                        <div className="jm"><b>S</b> {j.from}{j.to && j.to !== '—' ? <> → <b>G</b> {j.to}</> : ''} · {CAT_NAME[j.cat]}</div>
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

        {/* 未手配案件（高さは左ボードに合わせ、あふれたら内部スクロール） */}
        <aside className="db-side" style={sideH ? { height: sideH } : undefined}>
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
                  {i >= contractCardsAvail.length && (
                    <button title="この未手配を削除" onClick={(e) => { e.stopPropagation(); removeManualUn(i - contractCardsAvail.length) }}
                      style={{ marginLeft: 4, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', fontSize: 13, lineHeight: 1, flexShrink: 0 }}>×</button>
                  )}
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
          <b>{tip.job.name}</b> · {CAT_NAME[tip.job.cat]}{tip.job.extJob ? '（外注）' : ''}
          <div className="tr"><span>区間</span><span>S {tip.job.from}{tip.job.to && tip.job.to !== '—' ? ' → G ' + tip.job.to : ''}</span></div>
          <div className="tr"><span>時間</span><span>{fmt(tip.job.s)}–{fmt(tip.job.s + tip.job.d)}（{tip.job.d}h）</span></div>
          <div className="tr"><span>作業員</span><span>{tip.job.crew}</span></div>
          <div className="tr"><span>状態</span><span>{{ confirmed: '確定', tentative: '仮予約', conflict: '⚠ 時間重複の疑い' }[tip.job.st]}</span></div>
          {tip.job.amt ? <div className="tr"><span>見積</span><span>{money(tip.job.amt)}</span></div> : null}
        </div>
      )}

      {showVeh && (
        <VehicleModal vehicles={vehicles} jobs={jobs} onClose={() => setShowVeh(false)} onApply={applyVehicles} />
      )}

      {jobDetailItem && (
        <ContractDetailModal item={jobDetailItem} isNew={false} onClose={() => setJobDetail(null)} onSave={saveJobDetail} />
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
// stops: 停車地点の並び。legs: stops[i]→stops[i+1] の区間種別（'job'=案件の搬送区間・実線／'move'=手配間の移動区間・点線）
function computeVehicleRoutes(vehicles, jobs, show) {
  return vehicles.map((v, idx) => {
    const vj = jobs.filter(j => j.v === v.key && show(j.cat)).sort((a, b) => a.s - b.s)
    const stops = []
    const legs = []
    vj.forEach(j => {
      const from = j.from
      const to = (j.to && j.to !== '—') ? j.to : null
      if (stops.length === 0) stops.push(from)
      else if (stops[stops.length - 1] !== from) { legs.push('move'); stops.push(from) }
      if (to && to !== stops[stops.length - 1]) { legs.push('job'); stops.push(to) }
    })
    return { v, color: ROUTE_COLORS[idx % ROUTE_COLORS.length], stops, legs }
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

// ルート詳細カード（線をタップで表示：区間・出発住所・到着住所・距離/時間）。
// 地図（概略図／実地図）の上に絶対配置する共通コンポーネント。
function RouteDetailCard({ detail, onClose, onReroute, note }) {
  if (!detail) return null
  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', gap: 8, fontSize: 11.5, padding: '3px 0', lineHeight: 1.5 }}>
      <span style={{ color: 'var(--muted)', flexShrink: 0, width: 58 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: 600, wordBreak: 'break-all' }}>{value || '—'}</span>
    </div>
  )
  return (
    <div style={{ position: 'absolute', left: 10, top: 10, zIndex: 30, width: 262, maxWidth: 'calc(100% - 20px)', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 34px rgba(0,0,0,.22)', padding: '10px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ width: 16, height: 4, borderRadius: 2, background: detail.color, flexShrink: 0 }} />
          <b style={{ fontSize: 13 }}>{detail.label}</b>
          {detail.cls && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{detail.cls}</span>}
        </div>
        <button onClick={onClose} title="閉じる" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 18, color: '#94A3B8', lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      <Row label="区間" value={detail.stops.join(' → ')} />
      <Row label="出発住所" value={detail.fromAddr} />
      <Row label="到着住所" value={detail.toAddr} />
      {(detail.distance || detail.duration) && <Row label="距離/時間" value={[detail.distance, detail.duration].filter(Boolean).join(' ・ ')} />}
      {onReroute && detail.altCount > 1 && (
        <button className="btn btn-outline btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={onReroute}>↻ 別ルートに変更（{detail.altIndex + 1}/{detail.altCount}）</button>
      )}
      {note && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>{note}</div>}
    </div>
  )
}

// 概略図モード（キー無し）：区の相対座標をSVGに投影して色分け表示
function SchematicMap({ routes }) {
  const W = 760, H = 360, pad = 46
  const [detail, setDetail] = useState(null)
  const g = useMemo(() => {
    // pts は座標が判る停車地のみ（未知地名は除外）。origIndex で元の stops/legs 上の位置を保持し、
    // 隣接する2点が元々隣り合っていた場合のみ legs の種別（'job'=実線／'move'=点線）を引き継ぐ。
    const withC = routes.map(r => {
      const pts = []
      r.stops.forEach((n, i) => {
        const c = coordOf(n)
        if (!c) return
        pts.push({ name: n, c, origIndex: i })
      })
      return { ...r, pts }
    }).filter(r => r.pts.length > 0)
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
      <div className="db-mapbox" style={{ position: 'relative' }}>
        <RouteDetailCard detail={detail} onClose={() => setDetail(null)}
          note="※ 概略図です。高速道路／有料道路の設定・実道路でのルート変更は、Googleマップキー設定時の実地図モードで利用できます。" />
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
            {/* ルート（白casing → 車両色。Googleの経路ラインに近づける）。
                案件の搬送区間(job)は実線、手配間の移動区間(move)は点線で区別する。 */}
            {g.withC.map((r, ri) => {
              const pts = r.pts.map(s => g.proj(s.c))
              const onClickDetail = () => setDetail({ color: r.color, label: r.v.ext ? '外注' : '#' + r.v.id, cls: r.v.cls, stops: r.stops, fromAddr: r.stops[0], toAddr: r.stops[r.stops.length - 1] })
              return (
                <g key={ri}>
                  {pts.slice(1).map((p, i) => {
                    const a = pts[i], b = p
                    const prev = r.pts[i], cur = r.pts[i + 1]
                    // 隣接する2点が元々連続していた場合のみ legs の種別を引き継ぐ（間引かれていれば移動区間扱い）
                    const isMove = cur.origIndex !== prev.origIndex + 1 || r.legs[cur.origIndex - 1] === 'move'
                    const d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)}`
                    const dash = isMove ? { strokeDasharray: '2 7' } : {}
                    return (
                      <g key={i}>
                        <path d={d} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={d} fill="none" stroke={r.color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" style={dash} />
                        {/* 透明な太い当たり判定パス：線をタップで詳細（区間・出発/到着）を表示 */}
                        <path d={d} fill="none" stroke="transparent" strokeWidth="18" strokeLinecap="round" style={{ cursor: 'pointer' }} onClick={onClickDetail}>
                          <title>タップでルート詳細</title>
                        </path>
                      </g>
                    )
                  })}
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
// ・線をタップ → 区間／出発住所／到着住所／距離・時間を表示
// ・高速道路／有料道路トグルで経路を再計算（ルート変更）
// ・複数経路がある場合は詳細カードの「別ルートに変更」で切替
function GoogleRouteMap({ routes }) {
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const overlays = useRef([])
  const resultRef = useRef({}) // 車両key -> { result, altCount }（別ルート切替用に最新結果を保持）
  const altRef = useRef({})    // 車両key -> 選択中の経路index
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [err, setErr] = useState('')
  const [avoidHighways, setAvoidHighways] = useState(false) // OFF=高速を使う（既定）
  const [avoidTolls, setAvoidTolls] = useState(false)       // OFF=有料を使う（既定）
  const [detail, setDetail] = useState(null)  // クリックしたルートの詳細
  const [redraw, setRedraw] = useState(0)      // 別ルート切替などで再描画
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

    // 元の停車順(names)における stopA→stopB が「案件の搬送区間(job)」か「手配間の移動区間(move)」かを判定。
    // optimizeWaypoints で訪問順が入れ替わった場合も、名前が元々隣接していたかどうかで判定する（隣接しなければ移動区間扱い）。
    const legTypeBetween = (names, legTypesOrig, a, b) => {
      const i = names.indexOf(a)
      if (i >= 0 && names[i + 1] === b) return legTypesOrig[i]
      return 'move'
    }

    const draw = (r) => new Promise((resolve) => {
      const names = r.stops
      const place = (result) => {
        if (cancelled || !result) return resolve()
        const altCount = result.routes.length
        let ai = altRef.current[r.v.key] || 0
        if (ai >= altCount) { ai = 0; altRef.current[r.v.key] = 0 }
        resultRef.current[r.v.key] = { result, altCount }
        const route0 = result.routes[ai]
        const legs = route0.legs
        // optimizeWaypoints で経由地が並び替えられた場合、実際に訪問した順の地名列を復元する。
        const wpOrder = route0.waypoint_order
        const orderedNames = wpOrder ? [names[0], ...wpOrder.map(i => names[1 + i]), names[names.length - 1]] : names
        const distM = legs.reduce((a, l) => a + ((l.distance && l.distance.value) || 0), 0)
        const durS = legs.reduce((a, l) => a + ((l.duration && l.duration.value) || 0), 0)
        const info = {
          key: r.v.key, color: r.color, cls: r.v.cls,
          label: r.v.ext ? '外注' : '#' + r.v.id,
          stops: r.stops,
          fromAddr: (legs[0] && legs[0].start_address) || r.stops[0],
          toAddr: (legs[legs.length - 1] && legs[legs.length - 1].end_address) || r.stops[r.stops.length - 1],
          distance: (distM / 1000).toFixed(1) + ' km',
          duration: Math.max(1, Math.round(durS / 60)) + ' 分',
          altIndex: ai, altCount,
        }
        // 案件区間(job)は実線、移動区間(move)は点線（casingは共通の白フチ）。
        legs.forEach((leg, i) => {
          const type = legTypeBetween(names, r.legs, orderedNames[i], orderedNames[i + 1])
          const legPath = leg.steps.flatMap(s => s.path)
          const casing = new g.maps.Polyline({ map, path: legPath, strokeColor: '#fff', strokeWeight: 8, strokeOpacity: 0.95, zIndex: 1 })
          const lineOpts = type === 'move'
            ? { map, path: legPath, strokeOpacity: 0, zIndex: 2, clickable: true, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: r.color, scale: 3.2 }, offset: '0', repeat: '11px' }] }
            : { map, path: legPath, strokeColor: r.color, strokeWeight: 5, strokeOpacity: 0.9, zIndex: 2, clickable: true }
          const line = new g.maps.Polyline(lineOpts)
          overlays.current.push(casing, line)
          g.maps.event.addListener(line, 'click', () => setDetail(info))
          if (i === 0) pin(leg.start_location, r.color, 9)
          pin(leg.end_location, r.color, 7)
        })
        route0.overview_path.forEach(p => bounds.extend(p))
        try { map.fitBounds(bounds) } catch {}
        resolve()
      }
      // 経路オプション（高速/有料の回避）ごとにキャッシュを分ける
      const cacheKey = names.join('>') + '|h' + (avoidHighways ? 1 : 0) + 't' + (avoidTolls ? 1 : 0)
      if (dirCache.has(cacheKey)) { place(dirCache.get(cacheKey)); return }
      if (names.length < 2) { // 単一地点：ジオコーディングして1ピン
        new g.maps.Geocoder().geocode({ address: names[0] + ' 福岡' }, (res, st) => {
          if (st === 'OK' && res[0]) { pin(res[0].geometry.location, r.color, 8); try { map.fitBounds(bounds) } catch {} }
          resolve()
        })
        return
      }
      const hasWaypoints = names.length > 2
      svc.route({
        origin: names[0] + ' 福岡', destination: names[names.length - 1] + ' 福岡',
        waypoints: names.slice(1, -1).map(n => ({ location: n + ' 福岡', stopover: true })),
        optimizeWaypoints: hasWaypoints,
        provideRouteAlternatives: !hasWaypoints, // 経由地なしのときだけ代替ルートを取得
        avoidHighways, avoidTolls,
        travelMode: g.maps.TravelMode.DRIVING,
      }, (result, st) => {
        if (st === 'OK') { dirCache.set(cacheKey, result); place(result) }
        else if (st === 'REQUEST_DENIED') { setErr('REQUEST_DENIED'); setStatus('error'); resolve() }
        else resolve() // ZERO_RESULTS 等は無視して次へ
      })
    })

    ;(async () => { for (const r of routes) { if (cancelled) break; await draw(r) } })() // 逐次実行でレート超過を回避
    return () => { cancelled = true }
  }, [status, sig, avoidHighways, avoidTolls, redraw])

  // 詳細カードの「別ルートに変更」：その車両の代替ルートindexを進めて再描画
  const reroute = () => {
    if (!detail) return
    const cur = resultRef.current[detail.key]
    if (!cur || cur.altCount <= 1) return
    altRef.current[detail.key] = ((altRef.current[detail.key] || 0) + 1) % cur.altCount
    setDetail(null)
    setRedraw(x => x + 1)
  }
  // トグル操作時は代替ルート選択をリセットして再計算
  const setHwy = () => { altRef.current = {}; setDetail(null); setAvoidHighways(v => !v) }
  const setToll = () => { altRef.current = {}; setDetail(null); setAvoidTolls(v => !v) }

  const pill = (on) => ({ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', userSelect: 'none', border: `1px solid ${on ? 'var(--blue)' : '#E2E8F0'}`, background: on ? '#EAF2FB' : '#fff', color: on ? 'var(--blue)' : '#94A3B8' })

  if (status === 'error') { // 失敗時は概略図にフォールバック
    return (
      <>
        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>Googleマップを表示できませんでした（{err}）。概略図を表示します。APIキー・請求先・リファラー制限をご確認ください。</div>
        <SchematicMap routes={routes} />
      </>
    )
  }
  return (
    <div>
      {/* ルート設定：高速道路／有料道路の使用ON/OFF（切替で経路を再計算＝ルート変更） */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>ルート設定</span>
        <span style={pill(!avoidHighways)} onClick={setHwy} title="クリックで高速道路の使用を切替（経路を再計算します）">🛣 高速道路を使う {avoidHighways ? 'OFF' : 'ON'}</span>
        <span style={pill(!avoidTolls)} onClick={setToll} title="クリックで有料道路の使用を切替（経路を再計算します）">💴 有料道路を使う {avoidTolls ? 'OFF' : 'ON'}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>👆 地図上の線をタップで区間・住所を表示</span>
      </div>
      <div className="db-maprow">
        <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div ref={mapRef} style={{ width: '100%', height: 340 }} />
          {status === 'loading' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#F1F5F9', fontSize: 12, color: 'var(--muted)' }}>地図を読み込み中…</div>}
          <RouteDetailCard detail={detail} onClose={() => setDetail(null)} onReroute={reroute}
            note={detail && detail.altCount > 1 ? '「別ルートに変更」で代替経路に切り替えられます。' : '高速/有料の設定を変えると経路が再計算されます。'} />
        </div>
        <RouteLegend routes={routes} note={'※ 巡回順は自動最適化。線は実際の道路に沿った経路です。線をタップで詳細、上部トグルで高速/有料を切替できます。'} />
      </div>
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
          {!hasKey && <span className="c-sub">区の相対位置に基づく概略図</span>}
          {hasKey && (
            <button type="button" onClick={toggle}
              title={gmapOn ? 'クリックでGoogleマップをOFFにします' : 'クリックでGoogleマップをONにします'}
              className={'db-gmap-toggle' + (gmapOn ? ' on' : '')}>
              <span className="knob" />
              <span className="lbl">Googleマップ {gmapOn ? 'ON' : 'OFF'}</span>
            </button>
          )}
        </div>
      </div>
      {/* OFF時（キーあり・トグルOFF）は本文を出さず、ヘッダーのトグルだけに畳む */}
      {!(hasKey && !gmapOn) && (
        <div className="card-body" style={{ padding: 12 }}>
          {routes.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 24 }}>表示できるルートがありません</div>
            : (useGmap ? <GoogleRouteMap routes={routes} /> : <SchematicMap routes={routes} />)}
        </div>
      )}
    </div>
  )
}

// ===== 車両／乗務員 設定モーダル =====
function VehicleModal({ vehicles, jobs, onClose, onApply }) {
  const [draft, setDraft] = useState(() => vehicles.map(v => ({ ...v })))
  const nextKey = useRef(1)
  const jobCount = (key) => jobs.filter(j => j.v === key).length

  const setField = (key, field, val) => setDraft(prev => prev.map(v => v.key === key ? { ...v, [field]: field === 'n' ? (parseInt(val, 10) || 0) : val } : v))
  const addRow = () => setDraft(prev => [...prev, { key: 'new' + (nextKey.current++) + '_' + Date.now(), id: '', cls: '2t', crew: '', n: 2 }])
  const removeRow = (key) => setDraft(prev => prev.filter(v => v.key !== key))

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
          <div><div style={{ fontSize: 15, fontWeight: 800 }}>車両の設定</div><div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>号車・車両クラスを登録します（乗務員はボード上でラベル割り当て）</div></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94A3B8' }}>×</button>
        </div>
        <div style={{ padding: '14px 18px', maxHeight: '60vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 90 }}>号車</th>
                <th style={th}>車両クラス</th>
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
                  <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9', textAlign: 'center' }}>
                    <button title={jobCount(v.key) ? '削除（配置済みは未手配へ戻る）' : '削除'}
                      onClick={() => removeRow(v.key)}
                      style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 7, width: 28, height: 28, cursor: 'pointer', fontSize: 13 }}>×</button>
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
            <div><label style={lb}>顧客名 *</label><input style={ip} value={name} onChange={e => setName(e.target.value)} placeholder="例）サンプル 太郎" /></div>
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
