import { useState, useEffect, useRef } from 'react'
import LeadDetailModal, { ConvertToContractModal } from '../components/LeadDetailModal'
import { toCSV, parseCSV, downloadCSV } from '../lib/csv'
import { fetchStaffList, DEFAULT_STAFF } from '../lib/staff'
import { receivedAtMs } from '../lib/sortLeads'
import { SourceTag } from '../lib/source'

const STATUS_LIST  = ['未架電', '架電済', '留守', '成約', '見送り']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', '成約': 'bg', '見送り': 'bk' }

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
const DEMO_DATA = [
  // 緑（17秒で獲得・詳細あり・家財あり）
  {
    id: '1', site: 'ズバット', name: '山根 真桜', kana: 'ヤマネ マオ',
    phone: '090-1351-8204', email: 'maomao@example.com',
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
    id: '2', site: 'ズバット', name: '米盛 紀久子', kana: 'ヨネモリ キクコ',
    phone: '090-9597-7557', email: '',
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
  { id: '3', site: 'ズバット', name: '稗田 和子', phone: '090-8356-3208', from: '福岡県福岡市中央区', to: '福岡県福岡市中央区', count: '1人', receivedAt: '06/23 07:45', moveDate: '06月24日 いつでも', status: '成約' },
]

const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modalBox     = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }

const norm = (l) => ({ ...l, status: l.status || '未架電' })

export default function Leads({ user, switchTab }) {
  const isDemo = user?.mode === 'demo'
  const [items, setItems]       = useState(isDemo ? DEMO_DATA.map(norm) : [])
  const [loading, setLoading]   = useState(!isDemo)
  const [search, setSearch]     = useState('')
  const [period, setPeriod]     = useState('all')      // all | today
  const [filterStatus, setFilterStatus] = useState('')
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

  const updateStatus = async (item, status) => {
    // 「成約」に変えたら金額入力モーダルを開き、確定時にまとめて保存する
    if (status === '成約') {
      setConvertLead(item)
      return
    }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i)) // 楽観更新
    if (isDemo) return
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
      route: payload.route || '',
      fromAddress: lead.fromAddress || lead.from || '',
      toAddress: lead.toAddress || lead.to || '',
      persons: lead.count ? String(lead.count).replace(/[^0-9]/g, '') : '',
      amount: payload.amount,
      status: '成約済み',
      staff: payload.staff || '',
      memo: payload.memo || '',
      leadKey: lead.key || lead.phone,
    }
    // ローカル楽観更新：リードのステータスと金額
    setItems(prev => prev.map(i => i.id === lead.id ? { ...i, status: '成約', amount: payload.amount } : i))
    setDetailItem(d => (d && d.id === lead.id ? { ...d, status: '成約', amount: payload.amount } : d))
    if (isDemo) return
    try {
      await Promise.all([
        fetch('/api/contracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contract) }),
        fetch('/api/inbound',   { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: lead.key || lead.phone, phone: lead.phone, status: '成約', amount: payload.amount }) }),
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
    const prefill = {
      name: item.name || '',
      kana: item.kana || '',
      fromZip: (item.fromZip || '').replace(/^〒/, ''),
      fromAddress: item.fromAddress || item.from || '',
      toZip: (item.toZip || '').replace(/^〒/, ''),
      toAddress: item.toAddress || item.to || '',
      fromTelMobile: item.phone || '',
      moveDate: '', // 希望日は文字列のため日付化はユーザーに任せる
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
    .filter(i => period === 'today' ? isToday(i) : true)
    .filter(i => {
      const q = search.toLowerCase()
      return !q || (i.name || '').toLowerCase().includes(q) || (i.phone || '').includes(q) || (i.from || '').includes(q) || (i.to || '').includes(q)
    })
    .filter(i => !filterStatus || i.status === filterStatus)
    .sort((a, b) => receivedAtMs(b) - receivedAtMs(a))

  const countBy = (s) => items.filter(i => i.status === s).length

  return (
    <div>
      <div className="page-hdr"><h1>リード管理</h1><p>一括査定サイトから取得した新規リードを管理します</p></div>

      <div className="kpi-row kpi-3">
        <div className="kpi-card c-blue"><div className="kpi-label">総リード数</div><div className="kpi-val">{items.length}<span>件</span></div></div>
        <div className="kpi-card c-teal"><div className="kpi-label">本日</div><div className="kpi-val">{items.filter(isToday).length}<span>件</span></div></div>
        <div className="kpi-card c-orange"><div className="kpi-label">未架電</div><div className="kpi-val">{countBy('未架電')}<span>件</span></div></div>
      </div>

      <div className="filter-row">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 名前・電話・エリアで検索..." />
        <select value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="all">全期間</option>
          <option value="today">本日のみ</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">全ステータス</option>
          {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-outline btn-sm" onClick={fetchItems} disabled={isDemo}>⟳ 更新</button>
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn btn-outline btn-sm" onClick={handleExport}>⬇ CSV出力</button>
        <button className="btn btn-outline btn-sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={importing}>
          {importing ? '取込中…' : '⬆ CSV取込'}
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: 'none' }} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <div className="card">
          <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
            <table>
              <thead>
                <tr><th>受付日時</th><th>流入元</th><th>名前</th><th>電話</th><th>区間</th><th>人数</th><th>引越し希望日</th><th style={{ textAlign: 'right' }}>金額</th><th>ステータス</th><th>担当者</th><th>操作</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>リードがありません</td></tr>
                ) : filtered.map(item => {
                  return (
                  <tr key={item.id} onClick={() => setDetailItem(item)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{item.receivedAt || ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}><SourceTag site={item.site} /></td>
                    <td><b>{item.name || '（名前なし）'}</b></td>
                    <td style={{ whiteSpace: 'nowrap' }}><a href={`tel:${item.phone}`} onClick={e => e.stopPropagation()} style={{ color: '#1E5FA8', textDecoration: 'none', fontWeight: 700 }}>{item.phone}</a></td>
                    <td>
                      <div style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={`${item.from || ''} → ${item.to || ''}`}>
                        {(item.from || '').replace('福岡県福岡市', '')} → {(item.to || '').replace('福岡県福岡市', '')}
                      </div>
                    </td>
                    <td>{item.count}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{item.moveDate}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 700 }}>{item.amount ? `¥${Number(item.amount).toLocaleString('ja-JP')}` : '—'}</td>
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
        </div>
      )}

      <LeadDetailModal
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onStatusChange={(it, status) => {
          if (status === '成約') { setConvertLead(it); return }
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
