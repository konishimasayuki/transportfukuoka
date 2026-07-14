import { useState, useEffect, useRef } from 'react'
import { toCSV, parseCSV, downloadCSV } from '../lib/csv'
import { fetchStaffList, DEFAULT_STAFF } from '../lib/staff'
import { SourceTag } from '../lib/source'
import { shortArea, splitRoute } from '../lib/area'

// すべて架空のサンプル（氏名は「サンプル＋名」で実在しないと一目でわかる形）。
const DEMO_DATA = [
  { id: '1', name: 'サンプル 太郎', src: 'bb', srcLabel: '引越し侍', date: '2025-06-15', route: '東区→博多区', amount: 68000, badge: 'bg', status: '成約済み' },
  { id: '2', name: 'サンプル 花子', src: 'bp', srcLabel: '比較ナビ',  date: '2025-06-22', route: '北九州→中央区', amount: 124000, badge: 'bb', status: '交渉中' },
  { id: '3', name: 'サンプル 一郎', src: 'bg', srcLabel: '価格.com', date: '2025-06-18', route: '南区→春日市', amount: 38500, badge: 'bo', status: '見積済み' },
  { id: '4', name: 'サンプル 二郎', src: 'bo', srcLabel: '自社HP',   date: '2025-06-20', route: '博多区→東区', amount: 52000, badge: 'bp', status: '連絡待ち' },
  { id: '5', name: 'サンプル 三郎', src: 'bb', srcLabel: '引越し侍', date: '2025-06-25', route: '糸島市→西区', amount: 45000, badge: 'bg', status: '成約済み' },
  { id: '6', name: 'サンプル 桜',   src: 'bg', srcLabel: '価格.com', date: '2025-07-02', route: '中央区→早良区', amount: 76000, badge: 'bb', status: '交渉中' },
  { id: '7', name: 'サンプル 陽子', src: 'bb', srcLabel: '引越し侍', date: '2025-06-30', route: '東区→粕屋町', amount: 58000, badge: 'br', status: '失注' },
]

const STATUS_LIST  = ['成約済み', '交渉中', '見積済み', '連絡待ち', '失注']
const SOURCE_LIST  = ['サムライ', 'ズバッと', '価格.com', 'SUUMO', '直電', 'チラシ', '企業紹介', 'その他']
const STATUS_BADGE = { '成約済み': 'bg', '交渉中': 'bb', '見積済み': 'bo', '連絡待ち': 'bp', '失注': 'br' }
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

const EMPTY_FORM = {
  name: '', kana: '', phone: '', email: '',
  srcLabel: 'サムライ', salesDate: '', date: '', moveDateText: '', persons: '',
  fromAddress: '', toAddress: '', route: '',
  amount: '', status: '交渉中',
  staff: '', memo: '',
}

const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modalBox     = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
const modalHead    = (color) => ({ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: color, borderRadius: '14px 14px 0 0' })
const inputStyle   = { width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1E293B' }
const formRow      = { marginBottom: 14 }
const formLabel    = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, display: 'block' }
const twoCol       = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }

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

export default function Contracts({ user, switchTab }) {
  const isDemo = user?.mode === 'demo'
  const [items, setItems]     = useState(isDemo ? DEMO_DATA : [])
  const [loading, setLoading] = useState(!isDemo)
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState(EMPTY_FORM)
  const [editId, setEditId]   = useState(null)
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [staffList, setStaffList] = useState(DEFAULT_STAFF)
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState('')
  const fileRef = useRef(null)
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  useEffect(() => { if (!isDemo) fetchItems() }, [])
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
    setForm({ ...EMPTY_FORM, ...p })
    setEditId(null)
    setModal('add')
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

  const openAdd  = () => { setForm(EMPTY_FORM); setEditId(null); setModal('add') }
  const openEdit = (item) => { setForm({ ...item, amount: String(item.amount) }); setEditId(item.id); setModal('edit') }
  const closeModal = () => { setModal(null); setForm(EMPTY_FORM); setEditId(null) }
  const f = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSave = async () => {
    if (!form.name) return
    setSaving(true)
    const payload = { ...form, amount: Number(form.amount) || 0 }
    if (isDemo) {
      if (modal === 'add') setItems(prev => [{ ...payload, id: Date.now().toString() }, ...prev])
      else setItems(prev => prev.map(i => i.id === editId ? { ...payload, id: editId } : i))
      setSaving(false); closeModal(); return
    }
    try {
      const method = modal === 'add' ? 'POST' : 'PUT'
      const body = modal === 'add' ? { ...payload, id: Date.now().toString() } : { ...payload, id: editId }
      await fetch('/api/contracts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      await fetchItems(); closeModal()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (isDemo) { setItems(prev => prev.filter(i => i.id !== id)); setDeleteConfirm(null); return }
    try {
      await fetch('/api/contracts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      await fetchItems()
    } catch (e) { console.error(e) }
    setDeleteConfirm(null)
  }

  // 一覧から担当者をインライン変更（全項目を保持して保存）
  const updateContractStaff = async (item, staff) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, staff } : i))
    if (isDemo) return
    try {
      await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, staff }) })
    } catch (e) { console.error(e) }
  }

  const updateContractStatus = async (item, status) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i))
    if (isDemo) return
    try {
      await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...item, status }) })
    } catch (e) { console.error(e) }
  }

  // エアコン/段ボールの要否トグル（デフォルト＝必要なし、押すと必要あり）。全項目を保持して保存。
  const toggleContractFlag = async (item, field) => {
    const updated = { ...item, [field]: !item[field] }
    setItems(prev => prev.map(i => i.id === item.id ? updated : i))
    if (isDemo) return
    try {
      await fetch('/api/contracts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
    } catch (e) { console.error(e) }
  }
  // 「必要あり/必要なし」トグルボタン
  const flagBtn = (item, field) => {
    const on = !!item[field]
    return (
      <button onClick={() => toggleContractFlag(item, field)} title="クリックで切替"
        style={{
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, borderRadius: 6,
          padding: '4px 10px', whiteSpace: 'nowrap',
          border: `1px solid ${on ? '#1E5FA8' : '#E2E8F0'}`,
          background: on ? '#EFF6FF' : '#F8FAFC',
          color: on ? '#1E5FA8' : '#94A3B8',
        }}>
        {on ? '必要あり' : '必要なし'}
      </button>
    )
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
      if (isDemo) {
        const withIds = rows.map((r, i) => ({ ...r, id: `${Date.now()}_${i}` }))
        setItems(prev => [...withIds, ...prev])
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
      await fetchItems()
      showToast(`${ok}/${rows.length}件を取り込みました`)
    } catch (err) {
      console.error(err); showToast('インポートに失敗しました')
    }
    setImporting(false)
  }

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    return (!q || i.name.toLowerCase().includes(q) || (i.route||'').includes(q)) &&
           (!filterStatus || i.status === filterStatus)
  })

  const countBy = (s) => items.filter(i => i.status === s).length
  const totalAmount = items.filter(i => i.status === '成約済み').reduce((s, i) => s + (i.amount || 0), 0)

  return (
    <div>
      <div className="page-hdr" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div><h1>成約管理</h1><p>成約済み・交渉中・失注の案件を管理します</p></div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-outline btn-sm" onClick={handleExport}>⬇ CSV出力</button>
          <button className="btn btn-outline btn-sm" onClick={() => fileRef.current && fileRef.current.click()} disabled={importing}>
            {importing ? '取込中…' : '⬆ CSV取込'}
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleImportFile} style={{ display: 'none' }} />
        </div>
      </div>

      <div className="kpi-row kpi-4">
        <div className="kpi-card c-green"><div className="kpi-label">成約済み</div><div className="kpi-val">{countBy('成約済み')}<span>件</span></div><div className="kpi-change up">¥{totalAmount.toLocaleString()}</div></div>
        <div className="kpi-card c-blue"><div className="kpi-label">交渉中</div><div className="kpi-val">{countBy('交渉中')}<span>件</span></div></div>
        <div className="kpi-card c-orange"><div className="kpi-label">連絡待ち</div><div className="kpi-val">{countBy('連絡待ち')}<span>件</span></div></div>
        <div className="kpi-card c-red"><div className="kpi-label">失注</div><div className="kpi-val">{countBy('失注')}<span>件</span></div></div>
      </div>

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
                <tr><th>顧客名</th><th>流入元</th><th>売上登録日</th><th>引越し日</th><th>区間</th><th>見積金額</th><th>エアコン</th><th>段ボール</th><th>ステータス</th><th>担当者</th><th>操作</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>データがありません</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id}>
                    <td><b>{item.name}</b></td>
                    <td><SourceTag label={item.srcLabel} /></td>
                    <td>{item.salesDate || '—'}</td>
                    <td>{item.date}</td>
                    <td title={contractRoute(item).full}>
                      <div style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contractRoute(item).short}</div>
                    </td>
                    <td>¥{(item.amount||0).toLocaleString()}</td>
                    <td>{flagBtn(item, 'aircon')}</td>
                    <td>{flagBtn(item, 'cardboard')}</td>
                    <td>
                      <select value={item.status || ''} onChange={e => updateContractStatus(item, e.target.value)}
                        className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}
                        style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}>
                        {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                        {item.status && !STATUS_LIST.includes(item.status) && <option value={item.status}>{item.status}</option>}
                      </select>
                    </td>
                    <td>
                      <select
                        value={item.staff || ''}
                        onChange={e => updateContractStaff(item, e.target.value)}
                        style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: '3px 6px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', background: '#fff', color: item.staff ? '#1E293B' : '#94A3B8' }}
                      >
                        <option value="">未割当</option>
                        {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                        {item.staff && !staffList.includes(item.staff) && <option value={item.staff}>{item.staff}</option>}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>編集</button>
                        <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => setDeleteConfirm(item.id)}>削除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 追加・編集モーダル */}
      {modal && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && closeModal()}>
          <div style={modalBox}>
            <div style={modalHead(modal === 'add' ? '#16A34A' : '#0E8A7A')}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{modal === 'add' ? '➕ 新規追加' : '✏️ 編集'}</span>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>顧客名 *</label>
                  <input style={inputStyle} value={form.name} onChange={e => f('name')(e.target.value)} placeholder="例：サンプル 太郎" />
                </div>
                <div>
                  <label style={formLabel}>フリガナ</label>
                  <input style={inputStyle} value={form.kana || ''} onChange={e => f('kana')(e.target.value)} placeholder="例：タナカ セイイチ" />
                </div>
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>電話</label>
                  <input style={inputStyle} value={form.phone || ''} onChange={e => f('phone')(e.target.value)} placeholder="090-…" />
                </div>
                <div>
                  <label style={formLabel}>メール</label>
                  <input style={inputStyle} value={form.email || ''} onChange={e => f('email')(e.target.value)} placeholder="example@…" />
                </div>
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>流入元</label>
                  <select style={inputStyle} value={form.srcLabel} onChange={e => f('srcLabel')(e.target.value)}>
                    {SOURCE_LIST.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={formLabel}>引越し日（＝配車日・配車ボードに反映）</label>
                  <input type="date" style={inputStyle} value={form.date} onChange={e => f('date')(e.target.value)} />
                </div>
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>売上登録日</label>
                  <input type="date" style={inputStyle} value={form.salesDate || ''} onChange={e => f('salesDate')(e.target.value)} />
                </div>
                <div>
                  <label style={formLabel}>希望日（自由記入）</label>
                  <input style={inputStyle} value={form.moveDateText || ''} onChange={e => f('moveDateText')(e.target.value)} placeholder="例：7月中旬 平日" />
                </div>
                <div>
                  <label style={formLabel}>引越し人数</label>
                  <input style={inputStyle} value={form.persons || ''} onChange={e => f('persons')(e.target.value)} placeholder="例：2人" />
                </div>
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>引越し元（住所）</label>
                  <input style={inputStyle} value={form.fromAddress || ''} onChange={e => f('fromAddress')(e.target.value)} placeholder="福岡市東区…" />
                </div>
                <div>
                  <label style={formLabel}>引越し先（住所）</label>
                  <input style={inputStyle} value={form.toAddress || ''} onChange={e => f('toAddress')(e.target.value)} placeholder="福岡市博多区…" />
                </div>
              </div>
              <div style={formRow}>
                <label style={formLabel}>区間（短縮表示）</label>
                <input style={inputStyle} value={form.route} onChange={e => f('route')(e.target.value)} placeholder="例：東区→博多区" />
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>見積金額（円）</label>
                  <input type="number" style={inputStyle} value={form.amount} onChange={e => f('amount')(e.target.value)} placeholder="例：68000" />
                </div>
                <div>
                  <label style={formLabel}>ステータス</label>
                  <select style={inputStyle} value={form.status} onChange={e => f('status')(e.target.value)}>
                    {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={formRow}>
                <label style={formLabel}>担当者</label>
                <select style={inputStyle} value={form.staff || ''} onChange={e => f('staff')(e.target.value)}>
                  <option value="">（未選択）</option>
                  {staffList.map(s => <option key={s} value={s}>{s}</option>)}
                  {form.staff && !staffList.includes(form.staff) && <option value={form.staff}>{form.staff}</option>}
                </select>
              </div>
              <div style={formRow}>
                <label style={formLabel}>メモ</label>
                <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} value={form.memo || ''} onChange={e => f('memo')(e.target.value)} placeholder="備考など" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={closeModal}>キャンセル</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name} style={{ opacity: !form.name ? .5 : 1 }}>
                  {saving ? '保存中...' : modal === 'add' ? '追加する' : '保存する'}
                </button>
              </div>
            </div>
          </div>
        </div>
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
