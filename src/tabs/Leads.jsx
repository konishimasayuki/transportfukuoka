import { useState, useEffect, useRef } from 'react'
import LeadDetailModal, { ConvertToContractModal } from '../components/LeadDetailModal'
import { toCSV, parseCSV, downloadCSV } from '../lib/csv'
import { fetchStaffList, DEFAULT_STAFF } from '../lib/staff'
import { receivedAtMs } from '../lib/sortLeads'
import { SourceTag } from '../lib/source'
import { shortArea } from '../lib/area'

const pad2 = n => String(n).padStart(2, '0')
// 受付日時を「MM/DD HH:MM」に統一（価格.comの "2026/07/01 19:37:05" 等も他サイトに合わせる）
function fmtReceived(s) {
  s = String(s || '').trim()
  let m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})[ T]+(\d{1,2}):(\d{2})/)
  if (m) return `${pad2(m[2])}/${pad2(m[3])} ${pad2(m[4])}:${m[5]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/)
  if (m) return `${pad2(m[1])}/${pad2(m[2])} ${pad2(m[3])}:${m[4]}`
  return s
}
// リードの受付日を YYYY-MM-DD（ローカル）で返す（月/日フィルター用）
function leadDateStr(item) {
  const ms = receivedAtMs(item)
  if (!ms) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// 検索の日本語正規化：カタカナ→ひらがなに寄せ、全角/半角と大小文字を無視。
// これで「フリガナ（カタカナ）」に対してひらがな入力でも一致する。
function normJa(s) {
  return String(s || '')
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角英数→半角
    .replace(/\s+/g, '')
    .toLowerCase()
}

// リードの引越し希望日（例「2026年07月10日 午前中」「07月20日 午前中」）を
// 見積書用の日付(YYYY-MM-DD)とAM/PMに変換。年が無ければ当年（過ぎていれば翌年）。
function parseLeadMoveDate(raw) {
  const str = String(raw || '')
  const m = str.match(/(?:(\d{4})年)?\s*(\d{1,2})月\s*(\d{1,2})日/)
  if (!m) return { date: '', ap: '' }
  const now = new Date()
  let y = m[1] ? parseInt(m[1], 10) : now.getFullYear()
  const mm = parseInt(m[2], 10), dd = parseInt(m[3], 10)
  if (!m[1]) { const cand = new Date(y, mm - 1, dd); if (cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1 }
  const ap = /午後|PM|1[3-9]:|2[0-3]:/.test(str) ? 'PM' : (/午前|AM|0?[6-9]:|1[0-2]:/.test(str) ? 'AM' : '')
  return { date: `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`, ap }
}

const STATUS_LIST  = ['未架電', '架電済', '留守', '要追客', '成約', '見送り']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', '要追客': 'bp', '成約': 'bg', '見送り': 'bk' }

// CSV入出力の列定義
const CSV_COLUMNS = [
  { key: 'receivedAt', label: '受付日時' },
  { key: 'name', label: '名前' },
  { key: 'kana', label: 'フリガナ' },
  { key: 'phone', label: '電話' },
  { key: 'email', label: 'メール' },
  { key: 'site', label: 'サイト' },
  { key: 'from', label: '引越し元' },
  { key: 'to', label: '引越し先' },
  { key: 'count', label: '人数' },
  { key: 'moveDate', label: '引越し希望日' },
  { key: 'amount', label: '金額' },
  { key: 'status', label: 'ステータス' },
  { key: 'memo', label: 'メモ' },
]

// デモデータ：今回追加した機能（獲得スピード/詳細編集/見積書プリフィル）を試せる中身を含む
// receivedAt と detectedAt の差で「獲得スピード」が緑/橙/赤に色分けされる
// ※すべて架空のサンプル（氏名は「サンプル＋名」、電話は 090-0000-XXXX のダミー）。
export const DEMO_DATA = [
  // 緑（17秒で獲得・詳細あり・家財あり）
  {
    id: '1', site: 'ズバット', name: 'サンプル 太郎', kana: 'サンプル タロウ',
    phone: '090-0000-0001', email: 'sample01@example.com',
    from: '福岡県福岡市中央区', to: '福岡県福岡市西区', count: '2人',
    receivedAt: '06/26 09:00', moveDate: '07月10日 いつでも',
    detail: true,
    fromZip: '〒810-0001', fromAddress: '福岡市中央区天神1-2-3', fromType: 'マンション',
    toZip: '819-0006', toAddress: '福岡市西区姪浜駅南4-5', toType: '戸建て',
    moveDateDetail: '2026年07月10日 いつでも', requestedAt: '06/26 09:00', orderId: '11431999',
    telStatus: '未架電', mailStatus: '未メール',
    request: 'できれば午前に来てほしい', option: 'エアコン取り外し希望',
    memo: '電話1（折り返し連絡待ち）',
    kazai: [
      { name: '冷蔵庫（２ドア）', qty: 1 },
      { name: '洗濯機（縦型）', qty: 1 },
      { name: '電子レンジ', qty: 1 },
      { name: 'ベッド（シングル）', qty: 1 },
      { name: 'ソファ（2人掛け）', qty: 1 },
      { name: '本棚（中・小）', qty: 2 },
    ],
    boxCount: '15',
    detectedAt: '2026-06-26T00:00:17.000Z', // 09:00:17 JST → 17秒で獲得
    savedAt:    '2026-06-26T00:00:17.500Z',
    status: '未架電',
  },
  // 橙（47秒で獲得・詳細あり・家財少なめ）
  {
    id: '2', site: 'ズバット', name: 'サンプル 花子', kana: 'サンプル ハナコ',
    phone: '090-0000-0002', email: '',
    from: '福岡県福岡市城南区', to: '福岡県福岡市城南区', count: '1人',
    receivedAt: '06/26 08:15', moveDate: '08月08日 いつでも',
    detail: true,
    fromZip: '814-0111', fromAddress: '福岡市城南区別府2-1-1', fromType: 'アパート',
    toAddress: '福岡市城南区七隈', toType: 'マンション',
    moveDateDetail: '2026年08月08日 いつでも', requestedAt: '06/26 08:15', orderId: '11431950',
    telStatus: '架電済', mailStatus: '未メール',
    kazai: [
      { name: '冷蔵庫（3ドア）', qty: 1 },
      { name: '洗濯機（ドラム式）', qty: 1 },
      { name: 'ベッド（セミダブル）', qty: 1 },
    ],
    boxCount: '8',
    memo: '架電1 / 折り返し依頼',
    detectedAt: '2026-06-25T23:15:47.000Z', // 08:15:47 JST → 47秒で獲得
    savedAt:    '2026-06-25T23:15:48.000Z',
    status: '架電済',
  },
  // 既存に近いシンプルなレコード（詳細なし）
  { id: '3', site: 'ズバット', name: 'サンプル 一郎', phone: '090-0000-0003', from: '福岡県福岡市中央区', to: '福岡県福岡市中央区', count: '1人', receivedAt: '06/23 07:45', moveDate: '06月24日 いつでも', status: '成約' },
  // 追加のデモリード（すべて架空・当月中心）
  { id: '4', site: '引越し侍', name: 'サンプル 二郎', kana: 'サンプル ジロウ', phone: '090-0000-0004', email: 'sample04@example.com', from: '福岡県福岡市東区', to: '福岡県糟屋郡新宮町', count: '2人', receivedAt: '07/02 10:20', moveDate: '07月20日 午前中', status: '架電済' },
  { id: '5', site: '価格.com', name: 'サンプル 三郎', kana: 'サンプル サブロウ', phone: '090-0000-0005', from: '福岡県福岡市南区', to: '福岡県春日市', count: '1人', receivedAt: '07/03 14:05', moveDate: '07月28日 いつでも', status: '未架電' },
  { id: '6', site: '引越し侍', name: 'サンプル 桜', kana: 'サンプル サクラ', phone: '090-0000-0006', from: '福岡県福岡市早良区', to: '福岡県福岡市博多区', count: '3人', receivedAt: '07/05 09:12', moveDate: '08月03日 午後', status: '未架電' },
  { id: '7', site: 'ズバット', name: 'サンプル 陽子', phone: '090-0000-0007', from: '福岡県大野城市', to: '福岡県福岡市中央区', count: '1人', receivedAt: '07/06 08:40', moveDate: '07月19日 午前中', status: '成約' },
  { id: '8', site: '価格.com', name: 'サンプル 美咲', phone: '090-0000-0008', from: '福岡県福岡市西区', to: '福岡県糸島市', count: '2人', receivedAt: '07/07 16:55', moveDate: '08月10日 いつでも', status: '架電済' },
  { id: '9', site: '引越し侍', name: 'サンプル 健太', phone: '090-0000-0009', from: '福岡県筑紫野市', to: '福岡県福岡市南区', count: '1人', receivedAt: '07/08 11:30', moveDate: '07月25日 午後', status: '未架電' },
  { id: '10', site: 'ズバット', name: 'サンプル 楓', phone: '090-0000-0010', from: '福岡県福岡市城南区', to: '福岡県福岡市早良区', count: '2人', receivedAt: '07/09 13:18', moveDate: '08月01日 いつでも', status: '要追客' },
  { id: '11', site: '引越し侍', name: 'サンプル 蓮', phone: '090-0000-0011', from: '福岡県宗像市', to: '福岡県福岡市東区', count: '4人', receivedAt: '07/10 19:44', moveDate: '08月15日 午前中', status: '未架電' },
]

const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modalBox     = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }

const norm = (l) => ({ ...l, status: l.status || '未架電' })

export default function Leads({ user, switchTab }) {
  const isDemo = user?.mode === 'demo'
  const [items, setItems]       = useState(isDemo ? DEMO_DATA.map(norm) : [])
  const [loading, setLoading]   = useState(!isDemo)
  const [search, setSearch]     = useState('')
  const [dateFilter, setDateFilter] = useState({ type: 'all' }) // {type:'all'|'day'(date)|'month'(month)}
  const [filterStatus, setFilterStatus] = useState('')
  const [page, setPage] = useState(0) // リード一覧のページ（1ページ50件）
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [convertLead, setConvertLead] = useState(null) // ステータス「成約」変更時の登録モーダル
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState('')
  const [staffList, setStaffList] = useState(DEFAULT_STAFF)
  const fileRef = useRef(null)
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  useEffect(() => { if (!isDemo) fetchItems() }, [])
  useEffect(() => { if (isDemo) { setStaffList(DEFAULT_STAFF); return } fetchStaffList().then(setStaffList) }, [isDemo])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inbound')
      const data = await res.json()
      setItems((data.items || []).map(norm))
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  // 「本日」判定（受付日時 MM/DD を優先、無ければ保存日時）
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

  // 1リード＝1成約：一度成約登録したリードは再登録できない
  const isContracted = (l) => !!(l && (l.contracted || l.status === '成約'))

  const updateStatus = async (item, status) => {
    // 「成約」に変えたら金額入力モーダルを開き、確定時にまとめて保存する
    if (status === '成約') {
      if (isContracted(item)) { showToast('このリードは既に成約登録済みです。編集は成約管理で行えます。'); return }
      setConvertLead(item)
      return
    }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i)) // 楽観更新
    if (isDemo) {
      // デモは共有DBが無いため、他タブ（追客タブ等）が参照する DEMO_DATA 自体も更新して同期させる
      const idx = DEMO_DATA.findIndex(i => i.id === item.id)
      if (idx !== -1) DEMO_DATA[idx] = { ...DEMO_DATA[idx], status }
      return
    }
    try {
      await fetch('/api/inbound', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key || item.phone, phone: item.phone, status }),
      })
    } catch (e) { console.error(e) }
  }

  // 「成約管理に登録」確定：成約管理に POST しつつ、リードのステータス・金額も更新
  const confirmConvertToContract = async (lead, payload) => {
    const today = new Date().toISOString().slice(0, 10)
    const contract = {
      id: Date.now().toString(),
      name: lead.name || '',
      kana: lead.kana || '',
      phone: lead.phone || '',
      email: lead.email || '',
      srcLabel: payload.srcLabel,
      date: payload.date || today,
      salesDate: payload.salesDate || today,
      route: payload.route || '',
      fromAddress: lead.fromAddress || lead.from || '',
      toAddress: lead.toAddress || lead.to || '',
      persons: lead.count ? String(lead.count).replace(/[^0-9]/g, '') : '',
      amount: payload.amount,
      status: '成約済み',
      staff: payload.staff || '',
      memo: payload.memo || '',
      // 家財情報を成約に引き継ぐ（成約由来の見積書で家財が空にならないように）
      kazai: Array.isArray(lead.kazai) ? lead.kazai : [],
      boxCount: lead.boxCount || '',
      timetree: !!lead.timetree,
      leadKey: lead.key || lead.phone,
    }
    // ローカル楽観更新：リードのステータスと金額（contracted=1リード1成約の恒久フラグ）
    setItems(prev => prev.map(i => i.id === lead.id ? { ...i, status: '成約', amount: payload.amount, contracted: true } : i))
    setDetailItem(d => (d && d.id === lead.id ? { ...d, status: '成約', amount: payload.amount, contracted: true } : d))
    if (isDemo) return
    try {
      await Promise.all([
        fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contract) }),
        fetch('/api/inbound',   { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: lead.key || lead.phone, phone: lead.phone, status: '成約', amount: payload.amount, contracted: true }) }),
      ])
    } catch (e) { console.error(e) }
  }

  // 詳細モーダルからの編集（メモ・家財）を保存
  const savePatch = async (item, patch) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ...patch } : i)) // 楽観更新
    setDetailItem(d => (d ? { ...d, ...patch } : d))
    if (isDemo) return
    try {
      await fetch('/api/inbound', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key || item.phone, phone: item.phone, ...patch }),
      })
      // 金額を編集したら、紐づく成約（leadKey一致）にも反映（成約管理・売上管理に波及）
      if (patch.amount !== undefined) {
        await fetch('/api/contracts', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadKey: item.key || item.phone, amount: Number(patch.amount) || 0 }),
        })
      }
    } catch (e) { console.error(e) }
  }

  // 詳細から「成約登録」→ 成約管理タブの新規追加に自動プリフィル
  const createContractFromLead = (item) => {
    const today = new Date().toISOString().slice(0, 10)
    const SITE_TO_SRC = { 'ズバット': 'ズバッと', 'ズバッと': 'ズバッと', '引越し侍': 'サムライ', '価格.com': '価格.com', 'SUUMO': 'SUUMO' }
    const fromShort = (item.from || item.fromAddress || '').replace(/^福岡県/, '').replace(/^福岡市/, '')
    const toShort   = (item.to   || item.toAddress   || '').replace(/^福岡県/, '').replace(/^福岡市/, '')
    const prefill = {
      name: item.name || '',
      kana: item.kana || '',
      phone: item.phone || '',
      email: item.email || '',
      srcLabel: SITE_TO_SRC[item.site] || 'その他',
      date: today,
      moveDateText: item.moveDateDetail || item.moveDate || '',
      persons: item.count ? String(item.count).replace(/[^0-9]/g, '') : '',
      fromAddress: item.fromAddress || item.from || '',
      toAddress: item.toAddress || item.to || '',
      route: [fromShort, toShort].filter(Boolean).join(' → '),
      amount: '',
      status: '交渉中',
      staff: '',
      memo: [item.memo, item.option, item.request].filter(Boolean).join(' / '),
    }
    try { sessionStorage.setItem('tf_contract_prefill', JSON.stringify(prefill)) } catch {}
    setDetailItem(null)
    if (typeof switchTab === 'function') switchTab('contracts')
  }

  // 詳細から「見積書を作成」→ Estimate タブで使うプリフィルを保存して切替
  const createEstimateFromLead = (item) => {
    const md = parseLeadMoveDate(item.moveDateDetail || item.moveDate)
    const prefill = {
      name: item.name || '',
      kana: item.kana || '',
      fromZip: (item.fromZip || '').replace(/^〒/, ''),
      fromAddress: item.fromAddress || item.from || '',
      toZip: (item.toZip || '').replace(/^〒/, ''),
      toAddress: item.toAddress || item.to || '',
      fromTelMobile: item.phone || '',
      toTelMobile: item.phone || '', // 同一人物なので転居先の携帯も同じ番号で補完
      estimator: item.staff || '',   // 見積者は担当者で補完
      moveDate: md.date, // 引越し希望日を日付化（可能な場合）
      moveAP: md.ap || 'AM',
      kazai: Array.isArray(item.kazai) ? item.kazai : [],
      boxCount: item.boxCount || '',
      memo: [item.memo, item.request, item.option].filter(Boolean).join(' / '),
    }
    try { sessionStorage.setItem('tf_estimate_prefill', JSON.stringify(prefill)) } catch {}
    setDetailItem(null)
    if (typeof switchTab === 'function') switchTab('estimate')
  }

  const handleDelete = async (item) => {
    if (isDemo) { setItems(prev => prev.filter(i => i.id !== item.id)); setDeleteConfirm(null); return }
    try {
      await fetch('/api/inbound', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key || item.phone, phone: item.phone }),
      })
      await fetchItems()
    } catch (e) { console.error(e) }
    setDeleteConfirm(null)
  }

  // CSVエクスポート（現在の全リード）
  const handleExport = () => {
    const csv = toCSV(items, CSV_COLUMNS)
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCSV(`リード管理_${stamp}.csv`, csv)
  }

  // CSVインポート（/api/inbound に upsert）
  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const rows = parseCSV(text, CSV_COLUMNS)
        .map(r => ({
          ...r,
          site: r.site || 'インポート',
          status: r.status || '未架電',
          amount: r.amount ? (Number(String(r.amount).replace(/[^\d.-]/g, '')) || 0) : undefined,
        }))
        .filter(r => r.phone || (r.name && String(r.name).trim()))
      if (rows.length === 0) { showToast('取り込める行がありませんでした'); setImporting(false); return }
      if (isDemo) {
        const withIds = rows.map((r, i) => norm({ ...r, id: `${Date.now()}_${i}` }))
        setItems(prev => [...withIds, ...prev])
        showToast(`${rows.length}件を取り込みました（デモ：保存なし）`)
        setImporting(false); return
      }
      let ok = 0
      for (let i = 0; i < rows.length; i++) {
        try {
          await fetch('/api/inbound', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...rows[i], key: rows[i].phone || `${rows[i].site}:${rows[i].name}` }),
          })
          ok++
        } catch (err) { console.error(err) }
      }
      await fetchItems()
      showToast(`${ok}/${rows.length}件を取り込みました`)
    } catch (err) {
      console.error(err); showToast('インポートに失敗しました')
    }
    setImporting(false)
  }

  const filtered = items
    .filter(i => {
      if (dateFilter.type === 'day') return leadDateStr(i) === dateFilter.date
      if (dateFilter.type === 'month') return leadDateStr(i).startsWith(dateFilter.month)
      return true
    })
    .filter(i => {
      const q = normJa(search)
      if (!q) return true
      // フリガナ(カタカナ)もひらがなに正規化して対象に含める → ひらがな検索でヒット
      const hay = normJa(`${i.name || ''} ${i.kana || ''} ${i.phone || ''} ${i.from || ''} ${i.to || ''}`)
      return hay.includes(q)
    })
    .filter(i => !filterStatus || i.status === filterStatus)
    .sort((a, b) => receivedAtMs(b) - receivedAtMs(a))

  const countBy = (s) => items.filter(i => i.status === s).length

  // ページング：直近50件ずつ表示（受付日時の新しい順）。以降は「次へ」で移動。
  const PAGE_SIZE = 50
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  // 検索・フィルタが変わったら1ページ目へ戻す
  useEffect(() => { setPage(0) }, [search, filterStatus, dateFilter])

  return (
    <div>
      <div className="page-hdr"><h1>リード管理</h1><p>一括査定サイトから取得した新規リードを管理します</p></div>

      <div className="kpi-row kpi-3">
        <div className="kpi-card c-blue"><div className="kpi-label">総リード数</div><div className="kpi-val">{items.length}<span>件</span></div></div>
        <div className="kpi-card c-teal"><div className="kpi-label">本日</div><div className="kpi-val">{items.filter(isToday).length}<span>件</span></div></div>
        <div className="kpi-card c-orange"><div className="kpi-label">未架電</div><div className="kpi-val">{countBy('未架電')}<span>件</span></div></div>
      </div>

      <div className="filter-row">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 名前・フリガナ(ひらがな可)・電話・エリアで検索..." />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全ステータス</option>
          {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-outline btn-sm" onClick={fetchItems} disabled={isDemo}>⟳ 更新</button>
      </div>

      {/* 月選択 ＋ 日付フィルター（今日〜10日前） */}
      {(() => {
        const now = new Date()
        const monthOpts = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); return { key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`, label: `${d.getFullYear()}年${d.getMonth() + 1}月` } })
        const dayChips = Array.from({ length: 11 }, (_, i) => { const d = new Date(now); d.setDate(d.getDate() - i); const ds = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; return { i, ds, label: i === 0 ? '今日' : `${d.getMonth() + 1}/${d.getDate()}` } })
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <select value={dateFilter.type === 'month' ? dateFilter.month : ''}
              onChange={e => setDateFilter(e.target.value ? { type: 'month', month: e.target.value } : { type: 'all' })}
              style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}>
              <option value="">全期間（月）</option>
              {monthOpts.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {dayChips.map(c => (
                <button key={c.i}
                  className={`btn btn-sm ${dateFilter.type === 'day' && dateFilter.date === c.ds ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setDateFilter(dateFilter.type === 'day' && dateFilter.date === c.ds ? { type: 'all' } : { type: 'day', date: c.ds })}
                  style={{ padding: '4px 9px' }}>{c.label}</button>
              ))}
            </div>
            {dateFilter.type !== 'all' && <button className="btn btn-outline btn-sm" onClick={() => setDateFilter({ type: 'all' })}>クリア</button>}
            {/* CSV出力・取込はフィルターと同じ行に（右寄せ） */}
            <div style={{ flex: 1 }} />
            <button className="btn btn-outline btn-sm" onClick={handleExport}>⬇ CSV出力</button>
            <button className="btn btn-outline btn-sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={importing}>
              {importing ? '取込中…' : '⬆ CSV取込'}
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: 'none' }} />
          </div>
        )
      })()}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <div className="card">
          <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
            <table>
              <thead>
                <tr><th>受付日時</th><th>流入元</th><th>名前</th><th>電話</th><th>区間</th><th>人数</th><th>引越し希望日</th><th>訪問見積もり日</th><th>タイムツリー</th><th>メモ</th><th>ステータス</th><th>担当者</th><th>操作</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={13} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>リードがありません</td></tr>
                ) : paged.map(item => {
                  return (
                  <tr key={item.id} onClick={() => setDetailItem(item)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtReceived(item.receivedAt || item.requestedAt || '')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><SourceTag site={item.site} /></td>
                    <td><b>{item.name || '（名前なし）'}</b></td>
                    <td style={{ whiteSpace: 'nowrap' }}><a href={`tel:${item.phone}`} onClick={e => e.stopPropagation()} style={{ color: '#1E5FA8', textDecoration: 'none', fontWeight: 700 }}>{item.phone}</a></td>
                    <td title={`${item.from || item.fromAddress || ''} → ${item.to || item.toAddress || ''}`}>
                      <div style={{ maxWidth: 92, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shortArea(item.from || item.fromAddress)} → {shortArea(item.to || item.toAddress)}
                      </div>
                    </td>
                    <td>{item.count}</td>
                    <td title={item.moveDate || item.moveDateDetail || ''}>
                      <div style={{ maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.moveDate || item.moveDateDetail || ''}
                      </div>
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                      <input type="date" value={item.visitEstimateDate || ''} onChange={e => savePatch(item, { visitEstimateDate: e.target.value })}
                        style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: '3px 5px', fontFamily: 'inherit', fontSize: 12, color: item.visitEstimateDate ? '#1E293B' : '#94A3B8', background: '#fff' }} />
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: item.timetree ? '#0E8A7A' : '#94A3B8', whiteSpace: 'nowrap' }} title="TimeTreeに登録済みかを記録">
                        <input type="checkbox" checked={!!item.timetree} onChange={() => savePatch(item, { timetree: !item.timetree })}
                          style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0E8A7A' }} />
                        {item.timetree ? '登録済' : '未登録'}
                      </label>
                    </td>
                    <td title={item.memo || ''}>
                      <div style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748B' }}>
                        {item.memo || ''}
                      </div>
                    </td>
                    <td>
                      <select
                        value={item.status}
                        onClick={e => e.stopPropagation()}
                        onChange={e => updateStatus(item, e.target.value)}
                        className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}
                        style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}
                      >
                        {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <select
                        value={item.staff || ''}
                        onClick={e => e.stopPropagation()}
                        onChange={e => savePatch(item, { staff: e.target.value })}
                        style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: '3px 6px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', background: '#fff', color: item.staff ? '#1E293B' : '#94A3B8' }}
                      >
                        <option value="">未割当</option>
                        {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                        {item.staff && !staffList.includes(item.staff) && <option value={item.staff}>{item.staff}</option>}
                      </select>
                    </td>
                    <td>
                      <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={e => { e.stopPropagation(); setDeleteConfirm(item) }}>削除</button>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* ページング：1ページ50件。以降は「次へ」で移動 */}
          {filtered.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                {filtered.length}件中 <b style={{ color: '#1E293B' }}>{safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, safePage * PAGE_SIZE + PAGE_SIZE)}</b> 件を表示
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage <= 0} style={{ opacity: safePage <= 0 ? 0.5 : 1 }}>‹ 前へ</button>
                <span style={{ fontSize: 12, color: '#64748B', minWidth: 64, textAlign: 'center' }}>{safePage + 1} / {pageCount} ページ</span>
                <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} style={{ opacity: safePage >= pageCount - 1 ? 0.5 : 1 }}>次へ ›</button>
              </div>
            </div>
          )}
        </div>
      )}

      <LeadDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onStatusChange={(it, status) => {
          if (status === '成約') {
            if (isContracted(it)) { showToast('このリードは既に成約登録済みです。編集は成約管理で行えます。'); return }
            setConvertLead(it); return
          }
          updateStatus(it, status)
          setDetailItem(d => ({ ...d, status }))
        }}
        onSave={savePatch}
        onCreateEstimate={createEstimateFromLead}
        onCreateContract={(it) => setConvertLead(it)}
      />

      {convertLead && (
        <ConvertToContractModal
          lead={convertLead}
          onClose={() => setConvertLead(null)}
          onConfirm={confirmConvertToContract}
          onGoCalendar={(moveDate) => {
            try { if (moveDate) sessionStorage.setItem('tf_schedule_focus', moveDate) } catch {}
            setConvertLead(null); setDetailItem(null)
            if (typeof switchTab === 'function') switchTab('schedule')
          }}
        />
      )}

      {deleteConfirm && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div style={modalBox}>
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>このリードを削除しますか？</div>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 20 }}>{deleteConfirm.name}（{deleteConfirm.phone}）</div>
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
