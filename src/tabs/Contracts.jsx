import { useState, useEffect, useRef } from 'react'
import { toCSV, parseCSV, downloadCSV } from '../lib/csv'
import { fetchStaffList, DEFAULT_STAFF } from '../lib/staff'
import { SourceTag } from '../lib/source'
import { shortArea, splitRoute } from '../lib/area'
import ContractDetailModal, { STATUS_LIST, STATUS_BADGE, SOURCE_LIST, AIRCON_OPTS, CARDBOARD_OPTS, EMPTY_CONTRACT } from '../components/ContractDetailModal'
import LeadDetailModal from '../components/LeadDetailModal'
import { DEMO_DATA as DEMO_LEADS } from './Leads'

// すべて架空のサンプル（氏名は「サンプル＋名」で実在しないと一目でわかる形）。
export const DEMO_DATA = [
  { id: '1', name: 'サンプル 太郎', src: 'bb', srcLabel: '引越し侍', date: '2025-06-15', route: '東区→博多区', amount: 68000, badge: 'bg', status: '成約済み', aircon: '未依頼', cardboard: '要配達' },
  { id: '2', name: 'サンプル 花子', src: 'bp', srcLabel: '比較ナビ',  date: '2025-06-22', route: '北九州→中央区', amount: 124000, badge: 'bb', status: '交渉中' },
  { id: '3', name: 'サンプル 一郎', src: 'bg', srcLabel: '価格.com', date: '2025-06-18', route: '南区→春日市', amount: 38500, badge: 'bo', status: '見積済み', aircon: '依頼済み' },
  { id: '4', name: 'サンプル 二郎', src: 'bo', srcLabel: '自社HP',   date: '2025-06-20', route: '博多区→東区', amount: 52000, badge: 'bp', status: '連絡待ち', cardboard: '要配達' },
  { id: '5', name: 'サンプル 三郎', src: 'bb', srcLabel: '引越し侍', date: '2025-06-25', route: '糸島市→西区', amount: 45000, badge: 'bg', status: '成約済み', aircon: '未依頼' },
  { id: '6', name: 'サンプル 桜',   src: 'bg', srcLabel: '価格.com', date: '2025-07-02', route: '中央区→早良区', amount: 76000, badge: 'bb', status: '要追客' },
  { id: '7', name: 'サンプル 陽子', src: 'bb', srcLabel: '引越し侍', date: '2025-06-30', route: '東区→粕屋町', amount: 58000, badge: 'br', status: '失注' },
]

// 成約管理を絞り込んだワークリストビュー（追客／エアコン依頼／段ボール配達）。
// 依頼タブは「必要なし以外（未依頼＋依頼済み、または要配達）」を表示する。
const MODE_META = {
  follow:    { title: '追客',         sub: '追客が必要な成約（要追客）を管理します',                 match: (i) => i.status === '要追客' },
  aircon:    { title: 'エアコン依頼',  sub: 'エアコンの取付・取外し手配を管理します（未依頼・依頼済み）', match: (i) => (i.aircon || '必要なし') !== '必要なし' },
  cardboard: { title: '段ボール配達',  sub: '段ボール配達が必要な成約を管理します（要配達）',           match: (i) => (i.cardboard || '必要なし') !== '必要なし' },
}
const SRC_BADGE    = { 'サムライ': 'bb', 'ズバッと': 'bo', '価格.com': 'bg', 'SUUMO': 'bp', '直電': 'by', 'チラシ': 'bk', '企業紹介': 'bk', 'その他': 'bk' }

// CSV入出力の列定義（ラベルは日本語ヘッダ。インポート時もこのラベルでキー対応）
const CSV_COLUMNS = [
  { key: 'name', label: '顧客名' },
  { key: 'kana', label: 'フリガナ' },
  { key: 'phone', label: '電話' },
  { key: 'email', label: 'メール' },
  { key: 'srcLabel', label: '流入元' },
  { key: 'salesDate', label: '売上登録日' },
  { key: 'date', label: '引越し日' },
  { key: 'moveDateText', label: '希望日' },
  { key: 'persons', label: '人数' },
  { key: 'fromAddress', label: '引越し元' },
  { key: 'toAddress', label: '引越し先' },
  { key: 'route', label: '区間' },
  { key: 'amount', label: '見積金額' },
  { key: 'status', label: 'ステータス' },
  { key: 'staff', label: '担当者' },
  { key: 'memo', label: 'メモ' },
]

const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modalBox     = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }

// 成約の区間を「短縮エリア → 短縮エリア」で表示（リード管理と同じ体裁）。
// 住所(fromAddress/toAddress)があれば優先、無ければ route 文字列を分解して短縮する。
function contractRoute(item) {
  let from = item.fromAddress || '', to = item.toAddress || ''
  if (!from && !to) { const [a, b] = splitRoute(item.route); from = a; to = b }
  const sf = shortArea(from), st = shortArea(to)
  const short = (!sf && !st) ? (item.route || '—') : `${sf || '—'} → ${st || '—'}`
  const full = (!from && !to) ? (item.route || '') : `${from || ''} → ${to || ''}`
  return { short, full }
}

// メモ最終更新日時の短縮表示（追客タブ）：MM/DD HH:MM
function fmtMemoTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function Contracts({ user, mode, onFollowDelta }) {
  const isDemo = user?.mode === 'demo'
  const meta = MODE_META[mode] || null       // 依頼/追客ビューのメタ（null＝通常の成約管理）
  const modeMatch = meta ? meta.match : () => true
  const [items, setItems]     = useState(isDemo ? DEMO_DATA : [])
  const [loading, setLoading] = useState(!isDemo)
  const [modalItem, setModalItem] = useState(null) // 開いている成約詳細モーダルの対象（null＝非表示）
  const [isNewModal, setIsNewModal] = useState(false)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [staffList, setStaffList] = useState(DEFAULT_STAFF)
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState('')
  const [followLeads, setFollowLeads] = useState([]) // 追客タブ用：ステータス「要追客」のリード（未成約）
  const [leadDetailItem, setLeadDetailItem] = useState(null) // 追客タブ：クリックしたリード行の詳細（リード管理と同じモーダル）
  const fileRef = useRef(null)
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  useEffect(() => { if (!isDemo) fetchItems() }, [])

  // 追客タブ：リード管理で「要追客」にしたリード（まだ成約登録していないもの）も合わせて表示する
  useEffect(() => {
    if (mode !== 'follow') return
    if (isDemo) { setFollowLeads(DEMO_LEADS.filter(l => l.status === '要追客')); return }
    fetch('/api/inbound').then(r => r.json()).then(d => {
      setFollowLeads((d.items || []).filter(l => l.status === '要追客'))
    }).catch(() => setFollowLeads([]))
  }, [mode, isDemo])
  useEffect(() => {
    if (isDemo) { setStaffList(DEFAULT_STAFF); return }
    fetchStaffList().then(setStaffList)
  }, [isDemo])

  // リード/架電タブの詳細モーダルから「✅ 成約登録」で渡されたプリフィルを取り込み、新規追加モーダルを開く
  useEffect(() => {
    let raw = null
    try { raw = sessionStorage.getItem('tf_contract_prefill') } catch {}
    if (!raw) return
    let p = null
    try { p = JSON.parse(raw) } catch { return }
    try { sessionStorage.removeItem('tf_contract_prefill') } catch {}
    if (!p) return
    setModalItem({ ...EMPTY_CONTRACT, ...p })
    setIsNewModal(true)
  }, [])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/contracts')
      const data = await res.json()
      setItems(data.items || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const openAdd  = () => { setModalItem({ ...EMPTY_CONTRACT }); setIsNewModal(true) }
  const openEdit = (item) => { setModalItem(item); setIsNewModal(false) }
  const closeModal = () => { setModalItem(null); setIsNewModal(false) }

  // ContractDetailModal からの保存（新規／編集を統一）
  const handleModalSave = async (payload) => {
    if (isNewModal) {
      const newItem = { ...payload, id: Date.now().toString(), ...(payload.memo ? { memoUpdatedAt: new Date().toISOString() } : {}) }
      if (newItem.status === '要追客') onFollowDelta?.(1)
      setItems(prev => [newItem, ...prev])
      if (!isDemo) {
        try { await fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem) }); await fetchItems() }
        catch (e) { console.error(e) }
      }
    } else {
      const id = modalItem.id
      // メモを変更した回だけメモの最終更新日時を記録する
      const finalPayload = (payload.memo !== undefined && payload.memo !== modalItem.memo)
        ? { ...payload, memoUpdatedAt: new Date().toISOString() }
        : payload
      onFollowDelta?.((finalPayload.status === '要追客' ? 1 : 0) - (modalItem.status === '要追客' ? 1 : 0))
      setItems(prev => prev.map(i => i.id === id ? { ...finalPayload, id } : i))
      if (!isDemo) {
        try { await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...finalPayload, id }) }); await fetchItems() }
        catch (e) { console.error(e) }
      }
    }
  }

  const handleDelete = async (id) => {
    const target = items.find(i => i.id === id)
    if (target && target.status === '要追客') onFollowDelta?.(-1)
    if (isDemo) { setItems(prev => prev.filter(i => i.id !== id)); setDeleteConfirm(null); return }
    try {
      await fetch('/api/contracts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      await fetchItems()
    } catch (e) { console.error(e) }
    setDeleteConfirm(null)
  }
  const handleModalDelete = () => { if (modalItem) { closeModal(); setDeleteConfirm(modalItem.id) } }

  // 一覧から担当者をインライン変更（全項目を保持して保存）
  const updateContractStaff = async (item, staff) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, staff } : i))
    if (isDemo) return
    try {
      await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, staff }) })
    } catch (e) { console.error(e) }
  }

  const updateContractStatus = async (item, status) => {
    onFollowDelta?.((status === '要追客' ? 1 : 0) - (item.status === '要追客' ? 1 : 0))
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i))
    if (isDemo) return
    try {
      await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, status }) })
    } catch (e) { console.error(e) }
  }

  // エアコン/段ボールの手配状況（必要なし／未依頼／依頼済み）。全項目を保持して保存。
  const updateContractField = async (item, field, value) => {
    const updated = { ...item, [field]: value }
    setItems(prev => prev.map(i => i.id === item.id ? updated : i))
    if (isDemo) return
    try {
      await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
    } catch (e) { console.error(e) }
  }
  // 手配状況プルダウン（必要なし＝グレー／未依頼・要配達＝オレンジ／依頼済み＝グリーン）。既定は「必要なし」。
  // エアコン・段ボールで選択肢の文字数が異なっても幅が揃うよう固定幅・中央寄せにしてデザインを統一する。
  const flagSelect = (item, field, opts) => {
    const val = item[field] || '必要なし'
    const bg = (val === '依頼済み') ? '#F0FDF4' : (val === '未依頼' || val === '要配達') ? '#FFF7ED' : '#F8FAFC'
    const color = (val === '依頼済み') ? '#15803D' : (val === '未依頼' || val === '要配達') ? '#C2410C' : '#94A3B8'
    const border = (val === '依頼済み') ? '#BBF7D0' : (val === '未依頼' || val === '要配達') ? '#FED7AA' : '#E2E8F0'
    return (
      <select value={val} onChange={e => updateContractField(item, field, e.target.value)}
        style={{ border: `1px solid ${border}`, borderRadius: 6, padding: '3px 6px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', background: bg, color, fontWeight: 700, width: 96, textAlign: 'center', textAlignLast: 'center' }}>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  // タイムツリー登録チェック（TimeTreeカレンダーに登録済みかを記録）
  const ttCheckbox = (item) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }} title="TimeTreeに登録済みかを記録">
      <input type="checkbox" checked={!!item.timetree} onChange={() => updateContractField(item, 'timetree', !item.timetree)}
        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0E8A7A' }} />
    </label>
  )

  // 追客タブ：未成約リード（status==='要追客'）を成約行と同じ形に変換して一覧に混ぜて表示する。
  // 成約前のためエアコン/段ボールは対象外（「—」表示）。行クリックでリード管理と同じ詳細モーダルを開く。
  const leadToRow = (lead) => ({
    id: 'lead:' + lead.id, _isLead: true, _lead: lead,
    name: lead.name || '（名前なし）', srcLabel: lead.site || '',
    date: lead.moveDate || lead.moveDateDetail || '',
    fromAddress: lead.from || lead.fromAddress || '', toAddress: lead.to || lead.toAddress || '', route: '',
    amount: lead.amount || 0, status: lead.status || '要追客', staff: lead.staff || '',
    memo: lead.memo || '', memoUpdatedAt: lead.memoUpdatedAt || '', timetree: !!lead.timetree,
  })
  // リード由来行の担当者をインライン変更（/api/inbound を更新）
  const updateLeadStaff = async (row, staff) => {
    setFollowLeads(prev => prev.map(l => l.id === row._lead.id ? { ...l, staff } : l))
    if (isDemo) return
    try {
      await fetch('/api/inbound', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: row._lead.key || row._lead.phone, phone: row._lead.phone, staff }) })
    } catch (e) { console.error(e) }
  }
  // リード由来行のタイムツリー登録チェックをインライン変更（/api/inbound を更新）
  const updateLeadTimetree = async (row, timetree) => {
    setFollowLeads(prev => prev.map(l => l.id === row._lead.id ? { ...l, timetree } : l))
    if (isDemo) {
      const idx = DEMO_LEADS.findIndex(l => l.id === row._lead.id)
      if (idx !== -1) DEMO_LEADS[idx] = { ...DEMO_LEADS[idx], timetree }
      return
    }
    try {
      await fetch('/api/inbound', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: row._lead.key || row._lead.phone, phone: row._lead.phone, timetree }) })
    } catch (e) { console.error(e) }
  }
  const leadTtCheckbox = (item) => (
    <label onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }} title="TimeTreeに登録済みかを記録">
      <input type="checkbox" checked={!!item.timetree} onChange={() => updateLeadTimetree(item, !item.timetree)}
        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0E8A7A' }} />
    </label>
  )
  // リード由来行のステータスをインライン変更（成約管理と同じステータス一覧を使用。要追客を選び直すと一覧から外れる）
  const updateLeadStatus = async (row, status) => {
    onFollowDelta?.((status === '要追客' ? 1 : 0) - (row.status === '要追客' ? 1 : 0))
    setFollowLeads(prev => prev.map(l => l.id === row._lead.id ? { ...l, status } : l))
    if (isDemo) {
      const idx = DEMO_LEADS.findIndex(l => l.id === row._lead.id)
      if (idx !== -1) DEMO_LEADS[idx] = { ...DEMO_LEADS[idx], status }
      return
    }
    try {
      await fetch('/api/inbound', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: row._lead.key || row._lead.phone, phone: row._lead.phone, status }) })
    } catch (e) { console.error(e) }
  }
  // リード詳細モーダル（リード管理と同じ）からの保存。メモを変更した回だけメモの最終更新日時を記録する。
  const saveLeadPatch = async (lead, patchIn) => {
    const patch = (patchIn.memo !== undefined && patchIn.memo !== lead.memo)
      ? { ...patchIn, memoUpdatedAt: new Date().toISOString() }
      : patchIn
    setFollowLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...patch } : l))
    setLeadDetailItem(d => (d && d.id === lead.id ? { ...d, ...patch } : d))
    if (isDemo) {
      const idx = DEMO_LEADS.findIndex(l => l.id === lead.id)
      if (idx !== -1) DEMO_LEADS[idx] = { ...DEMO_LEADS[idx], ...patch }
      return
    }
    try {
      await fetch('/api/inbound', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: lead.key || lead.phone, phone: lead.phone, ...patch }) })
    } catch (e) { console.error(e) }
  }

  // CSVエクスポート（現在の一覧をすべて）
  const handleExport = () => {
    const csv = toCSV(items, CSV_COLUMNS)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCSV(`成約管理_${stamp}.csv`, csv)
  }

  // CSVインポート（ファイル選択 → 各行を成約管理に登録）
  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (fileRef.current) fileRef.current.value = '' // 同じファイルを連続選択できるように
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCSV(text, CSV_COLUMNS)
        .map(r => ({
          ...r,
          amount: Number(String(r.amount).replace(/[^\d.-]/g, '')) || 0,
          status: r.status || '成約済み',
          srcLabel: r.srcLabel || 'その他',
        }))
        .filter(r => (r.name && String(r.name).trim()) || r.phone)
      if (rows.length === 0) { showToast('取り込める行がありませんでした'); setImporting(false); return }
      // 取り込んだ行のうち「要追客」件数だけ残追客数に加算
      const addedFollowCount = rows.filter(r => r.status === '要追客').length
      if (isDemo) {
        const withIds = rows.map((r, i) => ({ ...r, id: `${Date.now()}_${i}` }))
        setItems(prev => [...withIds, ...prev])
        if (addedFollowCount) onFollowDelta?.(addedFollowCount)
        showToast(`${rows.length}件を取り込みました（デモ：保存なし）`)
        setImporting(false); return
      }
      let ok = 0
      for (let i = 0; i < rows.length; i++) {
        try {
          await fetch('/api/contracts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...rows[i], id: `${Date.now()}_${i}` }),
          })
          ok++
        } catch (err) { console.error(err) }
      }
      if (addedFollowCount) onFollowDelta?.(addedFollowCount)
      await fetchItems()
      showToast(`${ok}/${rows.length}件を取り込みました`)
    } catch (err) {
      console.error(err); showToast('インポートに失敗しました')
    }
    setImporting(false)
  }

  // 追客タブは成約由来（要追客）＋リード由来（未成約・要追客）を1つの一覧に統合する
  const leadRows = mode === 'follow' ? followLeads.map(leadToRow) : []
  const combined = mode === 'follow' ? [...items, ...leadRows] : items

  const filtered = combined.filter(i => {
    const q = search.toLowerCase()
    return modeMatch(i) &&
           (!q || i.name.toLowerCase().includes(q) || (i.route||'').includes(q) || (i.fromAddress||'').includes(q) || (i.toAddress||'').includes(q)) &&
           (!filterStatus || i.status === filterStatus)
  }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))) // 引越し日の新しい順（上が最新）

  const countBy = (s) => items.filter(i => i.status === s).length
  const totalAmount = items.filter(i => i.status === '成約済み').reduce((s, i) => s + (i.amount || 0), 0)
  // ワークリスト用の集計（対象＝mode一致。追客タブは成約＋リードの合計）
  const modeItems = combined.filter(modeMatch)
  const flagCount = (field, val) => modeItems.filter(i => (i[field] || '必要なし') === val).length

  return (
    <div>
      <div className="page-hdr" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1>{meta ? meta.title : '成約管理'}</h1>
          <p>{meta ? meta.sub : '成約済み・交渉中・失注の案件を管理します'}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-outline btn-sm" onClick={handleExport}>⬇ CSV出力</button>
          <button className="btn btn-outline btn-sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={importing}>
            {importing ? '取込中…' : '⬆ CSV取込'}
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: 'none' }} />
        </div>
      </div>

      {mode === 'follow' ? (
        <div className="kpi-row kpi-3">
          <div className="kpi-card c-orange"><div className="kpi-label">追客対象（合計）</div><div className="kpi-val">{modeItems.length}<span>件</span></div></div>
          <div className="kpi-card c-purple"><div className="kpi-label">うちリード（未成約）</div><div className="kpi-val">{leadRows.length}<span>件</span></div></div>
          <div className="kpi-card c-green"><div className="kpi-label">成約済み（全体）</div><div className="kpi-val">{countBy('成約済み')}<span>件</span></div></div>
        </div>
      ) : (mode === 'aircon' || mode === 'cardboard') ? (
        <div className="kpi-row kpi-3">
          <div className="kpi-card c-blue"><div className="kpi-label">対象</div><div className="kpi-val">{modeItems.length}<span>件</span></div></div>
          <div className="kpi-card c-orange"><div className="kpi-label">未依頼</div><div className="kpi-val">{flagCount(mode, '未依頼')}<span>件</span></div></div>
          <div className="kpi-card c-green"><div className="kpi-label">依頼済み</div><div className="kpi-val">{flagCount(mode, '依頼済み')}<span>件</span></div></div>
        </div>
      ) : (
        <div className="kpi-row kpi-4">
          <div className="kpi-card c-green"><div className="kpi-label">成約済み</div><div className="kpi-val">{countBy('成約済み')}<span>件</span></div><div className="kpi-change up">¥{totalAmount.toLocaleString()}</div></div>
          <div className="kpi-card c-blue"><div className="kpi-label">交渉中</div><div className="kpi-val">{countBy('交渉中')}<span>件</span></div></div>
          <div className="kpi-card c-orange"><div className="kpi-label">連絡待ち</div><div className="kpi-val">{countBy('連絡待ち')}<span>件</span></div></div>
          <div className="kpi-card c-red"><div className="kpi-label">失注</div><div className="kpi-val">{countBy('失注')}<span>件</span></div></div>
        </div>
      )}

      <div className="filter-row">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 顧客名・エリアで検索..." />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全ステータス</option>
          {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ 新規追加</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <div className="card">
          <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
            <table>
              <thead>
                <tr>
                  <th>顧客名</th><th>流入元</th><th>引越し日</th><th>区間</th><th>見積金額</th>
                  {mode === 'follow' ? <><th>メモ</th><th>メモ最終更新日時</th></> : <><th>エアコン</th><th>段ボール</th></>}
                  <th>タイムツリー</th><th>ステータス</th><th>担当者</th>{mode !== 'follow' && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={mode === 'follow' ? 10 : 11} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>データがありません</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id}
                    onClick={() => item._isLead && setLeadDetailItem(item._lead)}
                    style={item._isLead ? { cursor: 'pointer' } : undefined}>
                    <td><b>{item.name}</b></td>
                    <td><SourceTag label={item.srcLabel} /></td>
                    <td>{item.date}</td>
                    <td title={contractRoute(item).full}>
                      <div style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contractRoute(item).short}</div>
                    </td>
                    <td>{item.amount ? `¥${item.amount.toLocaleString()}` : '—'}</td>
                    {mode === 'follow' ? (
                      <>
                        <td title={item.memo || ''}>
                          <div style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748B' }}>{item.memo || ''}</div>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', color: '#94A3B8', fontSize: 12 }}>{fmtMemoTime(item.memoUpdatedAt)}</td>
                      </>
                    ) : (
                      <>
                        <td>{item._isLead ? <span style={{ color: '#CBD5E1' }}>—</span> : flagSelect(item, 'aircon', AIRCON_OPTS)}</td>
                        <td>{item._isLead ? <span style={{ color: '#CBD5E1' }}>—</span> : flagSelect(item, 'cardboard', CARDBOARD_OPTS)}</td>
                      </>
                    )}
                    <td>{item._isLead ? leadTtCheckbox(item) : ttCheckbox(item)}</td>
                    <td>
                      {item._isLead ? (
                        <select value={item.status || ''} onClick={e => e.stopPropagation()} onChange={e => updateLeadStatus(item, e.target.value)}
                          className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}
                          style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}>
                          {STATUS_LIST.filter(s => s !== '要追客').map(s => <option key={s} value={s}>{s}</option>)}
                          {item.status && !STATUS_LIST.filter(s => s !== '要追客').includes(item.status) && <option value={item.status}>{item.status}</option>}
                        </select>
                      ) : (
                        <select value={item.status || ''} onChange={e => updateContractStatus(item, e.target.value)}
                          className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}
                          style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}>
                          {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                          {item.status && !STATUS_LIST.includes(item.status) && <option value={item.status}>{item.status}</option>}
                        </select>
                      )}
                    </td>
                    <td>
                      <select
                        value={item.staff || ''}
                        onClick={e => e.stopPropagation()}
                        onChange={e => item._isLead ? updateLeadStaff(item, e.target.value) : updateContractStaff(item, e.target.value)}
                        style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: '3px 6px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', background: '#fff', color: item.staff ? '#1E293B' : '#94A3B8' }}
                      >
                        <option value="">未割当</option>
                        {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                        {item.staff && !staffList.includes(item.staff) && <option value={item.staff}>{item.staff}</option>}
                      </select>
                    </td>
                    {mode !== 'follow' && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>編集</button>
                          <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => setDeleteConfirm(item.id)}>削除</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 成約詳細モーダル（新規追加／編集を統一。リード管理と同じレイアウト） */}
      {modalItem && (
        <ContractDetailModal
          item={modalItem}
          isNew={isNewModal}
          onClose={closeModal}
          onSave={handleModalSave}
          onDelete={!isNewModal ? handleModalDelete : undefined}
        />
      )}

      {/* 追客タブ：リード行クリックで開くリード詳細モーダル（リード管理と同じレイアウト） */}
      {leadDetailItem && (
        <LeadDetailModal
          item={leadDetailItem}
          onClose={() => setLeadDetailItem(null)}
          onSave={saveLeadPatch}
        />
      )}

      {/* 削除確認 */}
      {deleteConfirm && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div style={{ ...modalBox, maxWidth: 360 }}>
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>削除しますか？</div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 20 }}>この操作は元に戻せません</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>キャンセル</button>
                <button className="btn" style={{ background: '#DC2626', color: '#fff' }} onClick={() => handleDelete(deleteConfirm)}>削除する</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  )
}
