import { useState, useEffect } from 'react'

const DEMO_DATA = [
  { id: '1', name: '田中 誠一', date: '2025-06-15', from: '福岡市東区', to: '博多区', layout: '2LDK', truck: '2t車', workers: 3, status: '完了', memo: 'エレベーターなし3F' },
  { id: '2', name: '中村 龍一', date: '2025-06-18', from: '糸島市', to: '西区', layout: '1LDK', truck: '軽トラ', workers: 2, status: '完了', memo: '荷物少なめ' },
  { id: '3', name: '山口 花子', date: '2025-06-20', from: '南区', to: '春日市', layout: '1K', truck: '軽トラ', workers: 2, status: '予定', memo: '8:00スタート' },
  { id: '4', name: '高橋 美咲', date: '2025-06-22', from: '博多区', to: '東区', layout: '2DK', truck: '2t車', workers: 3, status: '予定', memo: 'ピアノあり要確認' },
  { id: '5', name: '佐藤 健太', date: '2025-06-25', from: '北九州市', to: '中央区', layout: '3LDK', truck: '4t車', workers: 4, status: '調整中', memo: '県外長距離' },
]

const STATUS_LIST = ['予定', '完了', '調整中', '未確定', 'キャンセル']
const LAYOUT_LIST = ['1K', '1DK', '1LDK', '2K', '2DK', '2LDK', '3DK', '3LDK', '4LDK以上']
const TRUCK_LIST  = ['軽トラ', '1.5t車', '2t車', '3t車', '4t車']

const STATUS_BADGE = {
  '完了': 'bg', '予定': 'bb', '調整中': 'bo', '未確定': 'bk', 'キャンセル': 'br',
}

const EMPTY_FORM = { name: '', date: '', from: '', to: '', layout: '1LDK', truck: '2t車', workers: 2, status: '予定', memo: '' }

// モーダル共通スタイル
const modalOverlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, padding: 16,
}
const modalBox = {
  background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520,
  maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)',
}
const modalHead = (color) => ({
  padding: '16px 20px', borderBottom: '1px solid #E2E8F0',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  background: color, borderRadius: '14px 14px 0 0',
})
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #E2E8F0',
  borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
  outline: 'none', color: '#1E293B', background: '#fff',
}
const formRow = { marginBottom: 14 }
const formLabel = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, display: 'block' }
const twoCol = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }

export default function Cases({ user }) {
  const isDemo = user?.mode === 'demo'
  const [items, setItems]       = useState(isDemo ? DEMO_DATA : [])
  const [loading, setLoading]   = useState(!isDemo)
  const [modal, setModal]       = useState(null) // null | 'add' | 'edit'
  const [form, setForm]         = useState(EMPTY_FORM)
  const [editId, setEditId]     = useState(null)
  const [saving, setSaving]     = useState(false)
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Redisからデータ取得（liveモードのみ）
  useEffect(() => {
    if (isDemo) return
    fetchItems()
  }, [])

  const fetchItems = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cases')
      const data = await res.json()
      setItems(data.items || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setEditId(null)
    setModal('add')
  }

  const openEdit = (item) => {
    setForm({ ...item })
    setEditId(item.id)
    setModal('edit')
  }

  const closeModal = () => { setModal(null); setForm(EMPTY_FORM); setEditId(null) }

  const handleSave = async () => {
    if (!form.name || !form.date) return
    setSaving(true)
    if (isDemo) {
      // デモ：ローカルのみ
      if (modal === 'add') {
        const newItem = { ...form, id: Date.now().toString() }
        setItems(prev => [newItem, ...prev])
      } else {
        setItems(prev => prev.map(i => i.id === editId ? { ...form, id: editId } : i))
      }
      setSaving(false)
      closeModal()
      return
    }
    // live：Redis保存
    try {
      const method = modal === 'add' ? 'POST' : 'PUT'
      const body = modal === 'add' ? { ...form, id: Date.now().toString() } : { ...form, id: editId }
      await fetch('/api/cases', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      await fetchItems()
      closeModal()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const handleDelete = async (id) => {
    if (isDemo) { setItems(prev => prev.filter(i => i.id !== id)); setDeleteConfirm(null); return }
    try {
      await fetch('/api/cases', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      await fetchItems()
    } catch (e) { console.error(e) }
    setDeleteConfirm(null)
  }

  const f = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }))

  // フィルター
  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const matchQ = !q || i.name.toLowerCase().includes(q) || i.from.includes(q) || i.to.includes(q)
    const matchS = !filterStatus || i.status === filterStatus
    return matchQ && matchS
  })

  return (
    <div>
      <div className="page-hdr"><h1>案件管理</h1><p>引越し案件の詳細・作業内容を管理します</p></div>

      <div className="kpi-row kpi-3">
        <div className="kpi-card c-blue"><div className="kpi-label">総案件数</div><div className="kpi-val">{items.length}<span>件</span></div></div>
        <div className="kpi-card c-teal"><div className="kpi-label">予定</div><div className="kpi-val">{items.filter(i=>i.status==='予定').length}<span>件</span></div></div>
        <div className="kpi-card c-orange"><div className="kpi-label">調整中</div><div className="kpi-val">{items.filter(i=>i.status==='調整中').length}<span>件</span></div></div>
      </div>

      <div className="filter-row">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 顧客名・エリアで検索..." />
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="">全ステータス</option>
          {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ 案件追加</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <div className="card">
          <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
            <table>
              <thead>
                <tr>
                  <th>顧客名</th><th>引越し日</th><th>搬出元</th><th>搬入先</th>
                  <th>間取り</th><th>車両</th><th>人数</th><th>状況</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>案件がありません</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id}>
                    <td><b>{item.name}</b></td>
                    <td>{item.date}</td>
                    <td>{item.from}</td>
                    <td>{item.to}</td>
                    <td>{item.layout}</td>
                    <td>{item.truck}</td>
                    <td>{item.workers}名</td>
                    <td><span className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}>{item.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => openEdit(item)}>編集</button>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}
                          onClick={() => setDeleteConfirm(item.id)}
                        >削除</button>
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
            <div style={modalHead(modal === 'add' ? '#1E5FA8' : '#0E8A7A')}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {modal === 'add' ? '➕ 案件追加' : '✏️ 案件編集'}
              </span>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={formRow}>
                <label style={formLabel}>顧客名 *</label>
                <input style={inputStyle} value={form.name} onChange={e=>f('name')(e.target.value)} placeholder="例：田中 誠一" />
              </div>
              <div style={formRow}>
                <label style={formLabel}>引越し日 *</label>
                <input type="date" style={inputStyle} value={form.date} onChange={e=>f('date')(e.target.value)} />
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>搬出元（現住所）</label>
                  <input style={inputStyle} value={form.from} onChange={e=>f('from')(e.target.value)} placeholder="例：福岡市東区" />
                </div>
                <div>
                  <label style={formLabel}>搬入先（転居先）</label>
                  <input style={inputStyle} value={form.to} onChange={e=>f('to')(e.target.value)} placeholder="例：博多区" />
                </div>
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>間取り</label>
                  <select style={inputStyle} value={form.layout} onChange={e=>f('layout')(e.target.value)}>
                    {LAYOUT_LIST.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={formLabel}>車両</label>
                  <select style={inputStyle} value={form.truck} onChange={e=>f('truck')(e.target.value)}>
                    {TRUCK_LIST.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={twoCol}>
                <div>
                  <label style={formLabel}>作業員数</label>
                  <input type="number" style={inputStyle} min={1} max={10} value={form.workers} onChange={e=>f('workers')(Number(e.target.value))} />
                </div>
                <div>
                  <label style={formLabel}>ステータス</label>
                  <select style={inputStyle} value={form.status} onChange={e=>f('status')(e.target.value)}>
                    {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={formRow}>
                <label style={formLabel}>メモ</label>
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
                  value={form.memo} onChange={e=>f('memo')(e.target.value)}
                  placeholder="例：エレベーターなし3F、ピアノあり など"
                />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button className="btn btn-outline" onClick={closeModal}>キャンセル</button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.date}
                  style={{ opacity: (!form.name || !form.date) ? .5 : 1 }}
                >
                  {saving ? '保存中...' : modal === 'add' ? '追加する' : '保存する'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteConfirm && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div style={{ ...modalBox, maxWidth: 360 }}>
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>案件を削除しますか？</div>
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
