// スケジュールタブ（TimeTreeの置き換え）
// - カレンダー(ジャンル)：引っ越し / 見積り / 段ボール配達。チップで表示を絞り込み（複数選択で重ね表示）
// - 月カレンダー表示（前月/翌月/今日）。日をクリックでその日の予定を下に一覧。
// - 予定の作成/編集：カレンダー選択・終日・開始/終了(日時)・ラベル色・場所・メモ・添付(プレビュー)
// - 永続化：/api/schedule（ライブ）。デモはサンプルをローカル表示。
import { useState, useEffect, useMemo, useRef } from 'react'
import DispatchBoard from '../components/DispatchBoard'
import { DEMO_CONTRACTS } from '../lib/demoData'

const GENRES = ['引っ越し', '見積り', '段ボール配達']
const GENRE_COLOR = { '引っ越し': '#1E5FA8', '見積り': '#EAB308', '段ボール配達': '#22C55E' }
// ジャンル（既存チップ）→ 配車ボードのカテゴリ。チップで両ビューを絞り込むための対応表。
const GENRE_TO_CAT = { '引っ越し': 'move', '見積り': 'quote', '段ボール配達': 'box' }

// ラベル（色）。値はキー、表示名と色を持つ。
const LABELS = [
  { key: 'yellow', name: '見積もり',     color: '#EAB308' },
  { key: 'green',  name: '段ボール配達', color: '#22C55E' },
  { key: 'blue',   name: 'ブルー',       color: '#3B82F6' },
  { key: 'red',    name: 'レッド',       color: '#EF4444' },
  { key: 'orange', name: 'オレンジ',     color: '#F97316' },
]
const labelColor = (key) => (LABELS.find(l => l.key === key) || LABELS[2]).color
const DEFAULT_LABEL_BY_CAL = { '引っ越し': 'blue', '見積り': 'yellow', '段ボール配達': 'green' }

const SAMPLE = [
  { id: 'seed1', calendar: '引っ越し', title: '田中様 引越し', allDay: false, start: '2026-06-30', startTime: '09:00', end: '2026-06-30', endTime: '12:00', label: 'blue',   location: '東区→博多区', memo: '2tショート / 作業2名', attachments: [] },
  { id: 'seed2', calendar: '引っ越し', title: '佐藤様 引越し', allDay: false, start: '2026-06-30', startTime: '13:30', end: '2026-06-30', endTime: '16:00', label: 'red',    location: '南区→春日市', memo: 'エアコン取外しあり', attachments: [] },
  { id: 'seed3', calendar: '引っ越し', title: '山口様 引越し', allDay: true,  start: '2026-07-01', startTime: '', end: '2026-07-01', endTime: '', label: 'orange', location: '西区', memo: '', attachments: [] },
  { id: 'seed4', calendar: '見積り',   title: '浜口様 見積り訪問', allDay: false, start: '2026-06-30', startTime: '10:00', end: '2026-06-30', endTime: '10:30', label: 'yellow', location: '中央区高砂', memo: '家族2名 2LDK', attachments: [] },
  { id: 'seed5', calendar: '見積り',   title: '高松様 見積り', allDay: false, start: '2026-06-29', startTime: '11:00', end: '2026-06-29', endTime: '', label: 'yellow', location: '', memo: '', attachments: [] },
  { id: 'seed6', calendar: '見積り',   title: '鈴木様 見積り', allDay: false, start: '2026-07-02', startTime: '14:00', end: '2026-07-02', endTime: '', label: 'yellow', location: '早良区', memo: '', attachments: [] },
  { id: 'seed7', calendar: '段ボール配達', title: '大川原様 段ボール配達', allDay: true, start: '2026-06-30', startTime: '', end: '2026-06-30', endTime: '', label: 'green', location: '東区', memo: '大10 / 小20', attachments: [] },
  { id: 'seed8', calendar: '段ボール配達', title: '長谷部様 配達', allDay: false, start: '2026-07-01', startTime: '15:00', end: '2026-07-01', endTime: '', label: 'green', location: '', memo: '', attachments: [] },
  { id: 'seed9', calendar: '段ボール配達', title: '庄司様 段ボール配達', allDay: true, start: '2026-06-28', startTime: '', end: '2026-06-28', endTime: '', label: 'green', location: '', memo: '', attachments: [] },
]

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const todayStr = () => ymd(new Date())

const MAX_FILE = 1.5 * 1024 * 1024 // 添付1ファイルの上限（Redis肥大化を避ける）

export default function Schedule({ user }) {
  const isDemo = user?.mode === 'demo'
  const now = new Date()
  const [items, setItems] = useState(isDemo ? SAMPLE : [])
  const [contracts, setContracts] = useState(isDemo ? DEMO_CONTRACTS : []) // 成約（カレンダー表示＋配車ボードの案件元）
  const [loading, setLoading] = useState(!isDemo)
  const [viewY, setViewY] = useState(now.getFullYear())
  const [viewM, setViewM] = useState(now.getMonth()) // 0-indexed
  const [view, setView] = useState('month')           // 'month'（月カレンダー）| 'board'（配車ボード）
  const [boardDate, setBoardDate] = useState(new Date()) // 配車ボードの対象日
  const [genres, setGenres] = useState([...GENRES])   // 表示中のジャンル（複数可）
  const [selDate, setSelDate] = useState(todayStr())
  const [modal, setModal] = useState(null)            // { mode:'add'|'edit', event }
  const [toast, setToast] = useState('')
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2400) }

  useEffect(() => { if (!isDemo) fetchItems() }, [isDemo])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const [sRes, cRes] = await Promise.all([
        fetch('/api/schedule').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/contracts').then(r => r.json()).catch(() => ({ items: [] })),
      ])
      setItems(sRes.items || [])
      setContracts(cRes.items || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  // 売り上げ登録日（無ければ引越し日）でその日の成約を返す
  const contractsOn = (dateStr) => contracts.filter(c => (c.salesDate || c.date) === dateStr)

  const toggleGenre = (g) => {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  const shown = useMemo(() => items.filter(e => genres.includes(e.calendar)), [items, genres])
  const eventsOn = (dateStr) => shown
    .filter(e => (e.start || '') <= dateStr && (e.end || e.start || '') >= dateStr)
    .sort((a, b) => (a.allDay === b.allDay ? String(a.startTime || '').localeCompare(String(b.startTime || '')) : (a.allDay ? -1 : 1)))

  // 月グリッド（前後の月を含む42セル）
  const cells = useMemo(() => {
    const first = new Date(viewY, viewM, 1)
    const gridStart = new Date(viewY, viewM, 1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d })
  }, [viewY, viewM])

  const gotoMonth = (delta) => {
    const d = new Date(viewY, viewM + delta, 1)
    setViewY(d.getFullYear()); setViewM(d.getMonth())
  }
  const gotoToday = () => { const d = new Date(); setViewY(d.getFullYear()); setViewM(d.getMonth()); setSelDate(todayStr()) }

  const openAdd = (dateStr) => {
    const cal = genres.length === 1 ? genres[0] : '引っ越し' // 1つだけ表示中ならそれを自動選択
    const day = dateStr || selDate || todayStr()
    setModal({ mode: 'add', event: {
      calendar: cal, title: '', allDay: true,
      start: day, startTime: '', end: day, endTime: '',
      label: DEFAULT_LABEL_BY_CAL[cal] || 'blue', location: '', memo: '', attachments: [],
    } })
  }
  const openEdit = (ev) => setModal({ mode: 'edit', event: { ...ev, attachments: ev.attachments || [] } })

  const saveEvent = async (ev) => {
    if (isDemo) {
      if (ev.id) setItems(prev => prev.map(i => i.id === ev.id ? ev : i))
      else setItems(prev => [{ ...ev, id: Date.now().toString() }, ...prev])
      setModal(null); showToast('保存しました（デモ：保存なし）'); return
    }
    try {
      if (ev.id) {
        await fetch('/api/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })
      } else {
        await fetch('/api/schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ev) })
      }
      await fetchItems(); setModal(null); showToast('保存しました')
    } catch (e) { console.error(e); showToast('保存に失敗しました') }
  }
  const deleteEvent = async (ev) => {
    if (isDemo) { setItems(prev => prev.filter(i => i.id !== ev.id)); setModal(null); return }
    try {
      await fetch('/api/schedule', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ev.id }) })
      await fetchItems(); setModal(null)
    } catch (e) { console.error(e) }
  }

  const monthLabel = `${viewY}年${viewM + 1}月`
  const tStr = todayStr()
  const selList = eventsOn(selDate)

  // 配車ボード用：チップ選択をカテゴリ絞り込みに変換
  const catFilter = { move: genres.includes('引っ越し'), quote: genres.includes('見積り'), box: genres.includes('段ボール配達') }
  // 配車ボードの日付ナビ（前日/今日/翌日）
  const shiftBoardDay = (delta) => { const d = new Date(boardDate); d.setDate(d.getDate() + delta); setBoardDate(d) }
  const boardDateLabel = `${boardDate.getMonth() + 1}月${boardDate.getDate()}日 (${WEEK[boardDate.getDay()]})`
  const boardIsToday = ymd(boardDate) === tStr

  // スタイル
  const chip = (active, color) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
    fontSize: 12, fontWeight: 700, cursor: 'pointer', userSelect: 'none',
    border: `1px solid ${active ? color : '#E2E8F0'}`,
    background: active ? color + '18' : '#fff', color: active ? color : '#94A3B8',
  })

  return (
    <div>
      <div className="page-hdr" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div><h1>スケジュール</h1><p>引っ越し・見積り・段ボール配達の予定を管理します</p></div>
        <button className="btn btn-primary btn-sm" onClick={() => openAdd()}>＋ 予定を作成</button>
      </div>

      {/* ジャンル切替チップ（複数選択で重ね表示）＋ 表示トグル */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        {GENRES.map(g => (
          <span key={g} style={chip(genres.includes(g), GENRE_COLOR[g])} onClick={() => toggleGenre(g)}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: GENRE_COLOR[g], display: 'inline-block' }} />
            {g}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <div className="db-seg">
          <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>🗓 月カレンダー</button>
          <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>🚚 配車ボード</button>
        </div>
        {!isDemo && view === 'month' && <button className="btn btn-outline btn-sm" onClick={fetchItems} disabled={loading}>⟳ 更新</button>}
      </div>

      {/* 日付ナビ：月ビュー＝前月/今日/翌月、ボードビュー＝前日/今日/翌日 */}
      {view === 'month' ? (
        <div className="filter-row" style={{ alignItems: 'center' }}>
          <button className="btn btn-outline btn-sm" onClick={() => gotoMonth(-1)}>‹ 前月</button>
          <button className="btn btn-outline btn-sm" onClick={gotoToday}>今日</button>
          <button className="btn btn-outline btn-sm" onClick={() => gotoMonth(1)}>翌月 ›</button>
          <div style={{ fontSize: 16, fontWeight: 900, marginLeft: 6 }}>{monthLabel}</div>
        </div>
      ) : (
        <div className="filter-row" style={{ alignItems: 'center' }}>
          <button className="btn btn-outline btn-sm" onClick={() => shiftBoardDay(-1)}>‹ 前日</button>
          <button className="btn btn-outline btn-sm" onClick={() => setBoardDate(new Date())}>今日</button>
          <button className="btn btn-outline btn-sm" onClick={() => shiftBoardDay(1)}>翌日 ›</button>
          <div style={{ fontSize: 16, fontWeight: 900, marginLeft: 6 }}>{boardDateLabel}</div>
          {boardIsToday && <span className="badge bb" style={{ marginLeft: 2 }}>今日</span>}
        </div>
      )}

      {/* ============ 配車ボード ============ */}
      {view === 'board' && <DispatchBoard filter={catFilter} onToast={showToast} contracts={contracts} boardDate={boardDate} isDemo={isDemo} />}

      {/* ============ 月カレンダー（既存）============ */}
      {view === 'month' && (loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="scroll-x">
            <div style={{ minWidth: 680 }}>
              {/* 曜日ヘッダ */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: '#F1F5FB' }}>
                {WEEK.map((w, i) => (
                  <div key={w} style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? '#DC2626' : i === 6 ? '#1E5FA8' : '#475569' }}>{w}</div>
                ))}
              </div>
              {/* 6週グリッド */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {cells.map((d, idx) => {
                  const ds = ymd(d)
                  const inMonth = d.getMonth() === viewM
                  const isToday = ds === tStr
                  const isSel = ds === selDate
                  const evs = eventsOn(ds)
                  return (
                    // 日付クリックでその日の配車ボードを開く
                    <div key={idx} onClick={() => { setSelDate(ds); setBoardDate(d); setView('board') }}
                      style={{
                        minHeight: 128, borderRight: '1px solid #EEF2F7', borderBottom: '1px solid #EEF2F7',
                        padding: 5, cursor: 'pointer', background: isSel ? '#EFF6FF' : inMonth ? '#fff' : '#FAFBFC',
                        opacity: inMonth ? 1 : 0.55,
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: 11, fontWeight: isToday ? 800 : 600,
                          color: isToday ? '#fff' : d.getDay() === 0 ? '#DC2626' : d.getDay() === 6 ? '#1E5FA8' : '#334155',
                          background: isToday ? '#1E5FA8' : 'transparent', borderRadius: 10, padding: isToday ? '0 6px' : 0, minWidth: 18, textAlign: 'center',
                        }}>{d.getDate()}</span>
                      </div>
                      <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {/* 成約（売り上げ登録日）を金色チップで表示 */}
                        {contractsOn(ds).map(c => (
                          <div key={'c_' + c.id} title={`成約 ${c.name} ¥${(c.amount || 0).toLocaleString()}`}
                            style={{ fontSize: 10, fontWeight: 700, color: '#7C4A03', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            💰 {c.name || '成約'} ¥{(c.amount || 0).toLocaleString()}
                          </div>
                        ))}
                        {evs.slice(0, 5).map(e => (
                          <div key={e.id} onClick={(ev) => { ev.stopPropagation(); openEdit(e) }}
                            style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: labelColor(e.label), borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {!e.allDay && e.startTime ? `${e.startTime} ` : ''}{e.title || '（無題）'}
                          </div>
                        ))}
                        {evs.length > 5 && <div style={{ fontSize: 9, color: '#94A3B8', fontWeight: 700 }}>＋{evs.length - 5}件</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* 選択日の予定一覧（月ビューのみ）*/}
      {view === 'month' && (
      <div className="card">
        <div className="card-head">
          <h3>{selDate.replace(/-/g, '/')} の予定</h3>
          <button className="btn btn-outline btn-sm" onClick={() => openAdd(selDate)}>＋ この日に追加</button>
        </div>
        <div className="card-body">
          {selList.length === 0 ? (
            <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 16 }}>予定はありません</div>
          ) : selList.map(e => (
            <div key={e.id} onClick={() => openEdit(e)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}>
              <span style={{ width: 6, height: 36, borderRadius: 3, background: labelColor(e.label), flexShrink: 0 }} />
              <div style={{ width: 84, flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#475569' }}>
                {e.allDay ? '終日' : (e.startTime || '') + (e.endTime ? `〜${e.endTime}` : '')}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title || '（無題）'}</div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>
                  <span style={{ color: GENRE_COLOR[e.calendar], fontWeight: 700 }}>{e.calendar}</span>
                  {e.location ? ` ・ ${e.location}` : ''}{e.attachments && e.attachments.length ? ` ・ 📎${e.attachments.length}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {modal && (
        <ScheduleModal
          mode={modal.mode}
          initial={modal.event}
          onClose={() => setModal(null)}
          onSave={saveEvent}
          onDelete={deleteEvent}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  )
}

// ===== 予定の作成／編集モーダル =====
function ScheduleModal({ mode, initial, onClose, onSave, onDelete }) {
  const [f, setF] = useState(initial)
  const [confirmDel, setConfirmDel] = useState(false)
  const fileRef = useRef(null)
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }))

  const onFiles = async (fileList) => {
    const files = [...(fileList || [])]
    const out = []
    for (const file of files) {
      if (file.size > MAX_FILE) { alert(`「${file.name}」は1.5MBを超えるため添付できません`); continue }
      try {
        const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) })
        out.push({ name: file.name, type: file.type, dataUrl })
      } catch {}
    }
    if (out.length) setF(p => ({ ...p, attachments: [...(p.attachments || []), ...out] }))
    if (fileRef.current) fileRef.current.value = ''
  }
  const removeFile = (i) => setF(p => ({ ...p, attachments: (p.attachments || []).filter((_, idx) => idx !== i) }))

  const submit = () => {
    if (!f.title || !f.title.trim()) { alert('タイトルを入力してください'); return }
    const ev = { ...f }
    if (ev.allDay) { ev.startTime = ''; ev.endTime = '' }
    if (!ev.end) ev.end = ev.start
    onSave(ev)
  }

  const ov = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: 16, overflowY: 'auto' }
  const bx = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, margin: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
  const ip = { width: '100%', padding: '9px 11px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1E293B' }
  const lb = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, display: 'block' }
  const row = { padding: '12px 0', borderBottom: '1px solid #F1F5F9' }

  return (
    <div style={ov} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={bx}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', borderRadius: '14px 14px 0 0' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{mode === 'add' ? '予定の作成' : '予定の編集'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94A3B8' }}>×</button>
        </div>

        <div style={{ padding: '6px 18px 18px' }}>
          <div style={row}>
            <input style={{ ...ip, fontSize: 16, fontWeight: 700, border: 'none', borderBottom: '2px solid #E2E8F0', borderRadius: 0, padding: '8px 2px' }}
              value={f.title} onChange={e => set('title')(e.target.value)} placeholder="予定のタイトル（入力必須）" autoFocus />
          </div>

          <div style={row}>
            <label style={lb}>カレンダー</label>
            <select style={ip} value={f.calendar} onChange={e => {
              const cal = e.target.value
              setF(p => ({ ...p, calendar: cal, label: DEFAULT_LABEL_BY_CAL[cal] || p.label }))
            }}>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div style={{ ...row, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ ...lb, margin: 0 }}>終日</label>
            <button onClick={() => set('allDay')(!f.allDay)}
              style={{ width: 46, height: 26, borderRadius: 20, border: 'none', cursor: 'pointer', background: f.allDay ? '#22C55E' : '#CBD5E1', position: 'relative', transition: 'background .15s' }}>
              <span style={{ position: 'absolute', top: 3, left: f.allDay ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
            </button>
          </div>

          <div style={row}>
            <label style={lb}>開始</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" style={ip} value={f.start} onChange={e => set('start')(e.target.value)} />
              {!f.allDay && <input type="time" style={{ ...ip, maxWidth: 130 }} value={f.startTime || ''} onChange={e => set('startTime')(e.target.value)} />}
            </div>
          </div>
          <div style={row}>
            <label style={lb}>終了</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" style={ip} value={f.end || f.start} onChange={e => set('end')(e.target.value)} />
              {!f.allDay && <input type="time" style={{ ...ip, maxWidth: 130 }} value={f.endTime || ''} onChange={e => set('endTime')(e.target.value)} />}
            </div>
          </div>

          <div style={row}>
            <label style={lb}>ラベル（色）</label>
            <select style={ip} value={f.label} onChange={e => set('label')(e.target.value)}>
              {LABELS.map(l => <option key={l.key} value={l.key}>{l.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {LABELS.map(l => (
                <span key={l.key} onClick={() => set('label')(l.key)} title={l.name}
                  style={{ width: 24, height: 24, borderRadius: '50%', background: l.color, cursor: 'pointer', border: f.label === l.key ? '3px solid #0F2A4A' : '2px solid #fff', boxShadow: '0 0 0 1px #E2E8F0' }} />
              ))}
            </div>
          </div>

          <div style={row}>
            <label style={lb}>場所</label>
            <input style={ip} value={f.location || ''} onChange={e => set('location')(e.target.value)} placeholder="住所・現場名など（自由記述）" />
          </div>
          <div style={row}>
            <label style={lb}>メモ</label>
            <textarea style={{ ...ip, resize: 'vertical', minHeight: 64 }} value={f.memo || ''} onChange={e => set('memo')(e.target.value)} placeholder="自由記述" />
          </div>

          <div style={row}>
            <label style={lb}>添付ファイル（1ファイル1.5MBまで）</label>
            <input ref={fileRef} type="file" multiple onChange={e => onFiles(e.target.files)}
              style={{ fontSize: 12 }} />
            {(f.attachments || []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {f.attachments.map((a, i) => (
                  <div key={i} style={{ position: 'relative', border: '1px solid #E2E8F0', borderRadius: 8, padding: 6, width: 92 }}>
                    {String(a.type || '').startsWith('image/')
                      ? <a href={a.dataUrl} target="_blank" rel="noreferrer"><img src={a.dataUrl} alt={a.name} style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 4, display: 'block' }} /></a>
                      : <a href={a.dataUrl} download={a.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 64, color: '#1E5FA8', textDecoration: 'none' }}><span style={{ fontSize: 24 }}>📎</span></a>}
                    <div style={{ fontSize: 9, color: '#64748B', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                    <button onClick={() => removeFile(i)} style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#DC2626', color: '#fff', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16 }}>
            <div>
              {mode === 'edit' && (
                confirmDel
                  ? <button className="btn" style={{ background: '#DC2626', color: '#fff' }} onClick={() => onDelete(f)}>本当に削除</button>
                  : <button className="btn btn-outline" style={{ color: '#DC2626', borderColor: '#FECACA' }} onClick={() => setConfirmDel(true)}>削除</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" onClick={onClose}>キャンセル</button>
              <button className="btn btn-primary" onClick={submit}>保存</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
