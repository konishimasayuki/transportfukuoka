import { useState, useEffect } from 'react'

const DEMO_DATA = [
  { id: '1', name: '田中 誠一', src: 'bb', srcLabel: '引越し侍', date: '2025-06-15', route: '東区→博多区', amount: 68000, badge: 'bg', status: '成約済み' },
  { id: '2', name: '佐藤 健太', src: 'bp', srcLabel: '比較ナビ',  date: '2025-06-22', route: '北九州→中央区', amount: 124000, badge: 'bb', status: '交渉中' },
  { id: '3', name: '山口 花子', src: 'bg', srcLabel: '価格.com', date: '2025-06-18', route: '南区→春日市', amount: 38500, badge: 'bo', status: '見積済み' },
  { id: '4', name: '高橋 美咲', src: 'bo', srcLabel: '自社HP',   date: '2025-06-20', route: '博多区→東区', amount: 52000, badge: 'bp', status: '連絡待ち' },
  { id: '5', name: '中村 龍一', src: 'bb', srcLabel: '引越し侍', date: '2025-06-25', route: '糸島市→西区', amount: 45000, badge: 'bg', status: '成約済み' },
  { id: '6', name: '小林 恵子', src: 'bg', srcLabel: '価格.com', date: '2025-07-02', route: '中央区→早良区', amount: 76000, badge: 'bb', status: '交渉中' },
  { id: '7', name: '加藤 浩二', src: 'bb', srcLabel: '引越し侍', date: '2025-06-30', route: '東区→粕屋町', amount: 58000, badge: 'br', status: '失注' },
]

const STATUS_LIST  = ['成約済み', '交渉中', '見積済み', '連絡待ち', '失注']
const SOURCE_LIST  = ['引越し侍', '価格.com', 'スーモ', '比較ナビ福岡', '自社HP', '紹介', 'その他']
const STATUS_BADGE = { '成約済み': 'bg', '交渉中': 'bb', '見積済み': 'bo', '連絡待ち': 'bp', '失注': 'br' }
const SRC_BADGE    = { '引越し侍': 'bb', '価格.com': 'bg', 'スーモ': 'bg', '比較ナビ福岡': 'bp', '自社HP': 'bo', '紹介': 'bk', 'その他': 'bk' }

const EMPTY_FORM = { name: '', srcLabel: '引越し侍', date: '', route: '', amount: '', status: '交渉中', memo: '' }

const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modalBox     = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
const modalHead    = (color) => ({ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: color, borderRadius: '14px 14px 0 0' })
const inputStyle   = { width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: '#1E293B' }
const formRow      = { marginBottom: 14 }
const formLabel    = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, display: 'block' }
const twoCol       = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }

export default function Contracts({ user }) {
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

  useEffect(() => { if (!isDemo) fetchItems() }, [])

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

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    return (!q || i.name.toLowerCase().includes(q) || (i.route||'').includes(q)) &&
           (!filterStatus || i.status === filterStatus)
  })

  const countBy = (s) => items.filter(i => i.status === s).length
  const totalAmount = items.filter(i => i.status === '成約済み').reduce((s, i) => s + (i.amount || 0), 0)

  return (
    <div>
      <div className="page-hdr"><h1>成約管理</h1><p>成約済み・交渉中・失注の案件を管理します</p></div>

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
                <tr><th>顧客名</th><th>流入元</th><th>引越し日</th><th>区間</th><th>見積金額</th><th>ステータス</th><th>操作</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>データがありません</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id}>
                    <td><b>{item.name}</b></td>
                    <td><span className={`badge ${SRC_BADGE[item.srcLabel] || 'bk'}`}>{item.srcLabel}</span></td>
                    <td>{item.date}</td>
                    <td>{item.route}</td>
                    <td>¥{(item.amount||0).toLocaleString()}</td>
                    <td><span className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}>{item.status}</span></td>
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
              <div style={formRow}>
                <label style={formLabel}>顧客名 *</label>
                <input style={inputStyle} value={form.name} onChange={e => f('name')(e.target.value)} placeholder="例：田中 誠一" />
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>流入元</label>
                  <select style={inputStyle} value={form.srcLabel} onChange={e => f('srcLabel')(e.target.value)}>
                    {SOURCE_LIST.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={formLabel}>引越し日</label>
                  <input type="date" style={inputStyle} value={form.date} onChange={e => f('date')(e.target.value)} />
                </div>
              </div>
              <div style={formRow}>
                <label style={formLabel}>区間（搬出元→搬入先）</label>
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
    </div>
  )
}
