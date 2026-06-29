import { useState, useEffect } from 'react'
import LeadDetailModal, { captureLagSec, lagText, lagColor } from '../components/LeadDetailModal'

const STATUS_LIST  = ['未架電', '架電済', '留守', '成約', '見送り']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', '成約': 'bg', '見送り': 'bk' }

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

  useEffect(() => { if (!isDemo) fetchItems() }, [])

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
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status } : i)) // 楽観更新
    if (isDemo) return
    try {
      await fetch('/api/inbound', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key || item.phone, phone: item.phone, status }),
      })
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
    const SITE_TO_SRC = { 'ズバット': 'ズバット', '引越し侍': '引越し侍', '価格.com': '価格.com', 'SUUMO': 'SUUMO' }
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

  const filtered = items
    .filter(i => period === 'today' ? isToday(i) : true)
    .filter(i => {
      const q = search.toLowerCase()
      return !q || (i.name || '').toLowerCase().includes(q) || (i.phone || '').includes(q) || (i.from || '').includes(q) || (i.to || '').includes(q)
    })
    .filter(i => !filterStatus || i.status === filterStatus)
    .sort((a, b) => String(b.receivedAt || b.savedAt || '').localeCompare(String(a.receivedAt || a.savedAt || '')))

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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <div className="card">
          <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
            <table>
              <thead>
                <tr><th>受付日時</th><th>獲得</th><th>名前</th><th>電話</th><th>区間</th><th>人数</th><th>引越し希望日</th><th>サイト</th><th>ステータス</th><th>操作</th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94A3B8', padding: 32 }}>リードがありません</td></tr>
                ) : filtered.map(item => {
                  const lag = captureLagSec(item)
                  return (
                  <tr key={item.id} onClick={() => setDetailItem(item)} style={{ cursor: 'pointer' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{item.receivedAt || ''}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 800, color: lagColor(lag), fontSize: 11 }}>{lag != null ? lagText(lag) : '—'}</td>
                    <td><b>{item.name || '（名前なし）'}</b></td>
                    <td style={{ whiteSpace: 'nowrap' }}><a href={`tel:${item.phone}`} onClick={e => e.stopPropagation()} style={{ color: '#1E5FA8', textDecoration: 'none', fontWeight: 700 }}>{item.phone}</a></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{(item.from || '').replace('福岡県福岡市', '')} → {(item.to || '').replace('福岡県福岡市', '')}</td>
                    <td>{item.count}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{item.moveDate}</td>
                    <td><span className="badge bk">{item.site}</span></td>
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
        onStatusChange={(it, status) => { updateStatus(it, status); setDetailItem(d => ({ ...d, status })) }}
        onSave={savePatch}
        onCreateEstimate={createEstimateFromLead}
        onCreateContract={createContractFromLead}
      />

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
    </div>
  )
}
