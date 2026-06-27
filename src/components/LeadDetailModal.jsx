// リード詳細モーダル（リード管理／架電ログで共用）
// 編集可能：ステータス（onStatusChange）、メモ（onSave）、家財（onSave）
// onCreateEstimate を渡すと「📝 見積書を作成」ボタンを表示し、押下時にリード情報を渡す。
import { useEffect, useState } from 'react'

const STATUS_LIST  = ['未架電', '架電済', '留守', '成約', '見送り']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', '成約': 'bg', '見送り': 'bk' }

// 家財のカテゴリ分け（追加候補プルダウンと表示の両方で使用）
const KAZAI_CATEGORY = {
  家具: ['ソファ', 'ソファ（1人掛け）', 'ソファ（2人掛け）', 'ソファ（3人掛け）', 'サイドボード・テレビ台',
    'チェスト（大）', 'チェスト（中・小）', 'リビングテーブル', 'ダイニングテーブルセット', 'シャンデリア・スタンド',
    'こたつ', '絨毯・カーペット', '絨毯・カーペット（10畳未満）', '絨毯・カーペット（10畳以上）',
    'ベッド', 'ベッド（シングル）', 'ベッド（セミダブル）', 'ベッド（ダブル）', '布団類',
    'タンス', 'タンス（中・小）', 'タンス（大）', '本棚', '本棚（中・小）', '本棚（大）', '衣装ケース',
    '机/椅子', '机', '椅子', 'ドレッサー', '食器棚', '食器棚（中・小）', '食器棚（大）'],
  家電: ['テレビ', 'テレビ（40インチ未満）', 'テレビ（40インチ以上）', 'ステレオ・コンポ類', 'ステレオ', 'ミニコンポ',
    'デスクトップパソコン', '冷蔵庫', '冷蔵庫（２ドア）', '冷蔵庫（3ドア）',
    '洗濯機', '洗濯機（縦型）', '洗濯機（ドラム式）', '乾燥機', '電子レンジ', 'エアコン', 'ストーブ・ヒーター', '扇風機'],
  その他: ['自転車', '物干し竿', '植木鉢・観葉植物', 'ゴルフセット', 'スキー用品', '仏壇'],
  重量物: ['ピアノ類', '小型ピアノ・エレクトーン', '大型ピアノ', 'バイク', '車'],
}
const KAZAI_OPTIONS = Object.values(KAZAI_CATEGORY).flat()
function categoryOf(name) {
  for (const [cat, list] of Object.entries(KAZAI_CATEGORY)) if (list.includes(name)) return cat
  return 'その他'
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const box     = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
const sectionBar = { background: 'linear-gradient(90deg,#EA580C,#FB923C)', color: '#fff', fontSize: 12, fontWeight: 800, padding: '6px 14px', letterSpacing: '.04em' }
const inp = { padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }

function Field({ label, value, wide }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', fontSize: 13, borderBottom: '1px solid #F1F5F9', gridColumn: wide ? '1 / -1' : 'auto' }}>
      <div style={{ width: 96, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>{label}</div>
      <div style={{ color: '#1E293B', fontWeight: 600, padding: '8px 10px', wordBreak: 'break-all', flex: 1 }}>{value}</div>
    </div>
  )
}

export default function LeadDetailModal({ item, onClose, onStatusChange, onSave, onCreateEstimate }) {
  const [memo, setMemo] = useState('')
  const [kazai, setKazai] = useState([])
  const [boxCount, setBoxCount] = useState('')
  const [addName, setAddName] = useState('')
  const [addQty, setAddQty] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // モーダルを開くたびに現在値で初期化
  useEffect(() => {
    if (!item) return
    setMemo(item.memo || '')
    setKazai(Array.isArray(item.kazai) ? item.kazai.map(k => ({ ...k })) : [])
    setBoxCount(item.boxCount || '')
    setAddName(''); setAddQty(1)
    setDirty(false)
  }, [item && item.id, item && item.phone])

  if (!item) return null

  const markDirty = () => setDirty(true)
  const setQty = (i, q) => { setKazai(p => p.map((k, idx) => idx === i ? { ...k, qty: Math.max(0, Number(q) || 0) } : k)); markDirty() }
  const removeRow = (i) => { setKazai(p => p.filter((_, idx) => idx !== i)); markDirty() }
  const addRow = () => {
    if (!addName) return
    setKazai(p => {
      const idx = p.findIndex(k => k.name === addName)
      if (idx >= 0) { const c = [...p]; c[idx] = { ...c[idx], qty: (Number(c[idx].qty) || 0) + (Number(addQty) || 1) }; return c }
      return [...p, { name: addName, qty: Number(addQty) || 1 }]
    })
    setAddName(''); setAddQty(1); markDirty()
  }

  const saveChanges = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      const patch = {
        memo,
        kazai: kazai.filter(k => k.name && Number(k.qty) > 0),
        kazaiCount: kazai.filter(k => Number(k.qty) > 0).length,
        kazaiUnknown: 0,
        boxCount,
      }
      await onSave(item, patch)
      setDirty(false)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const fromText = item.detail
    ? [item.fromZip, item.fromAddress, item.fromType && `（${item.fromType}）`].filter(Boolean).join(' ') || item.from
    : item.from
  const toText = item.detail
    ? [item.toZip, item.toAddress, item.toType && `（${item.toType}）`].filter(Boolean).join(' ') || item.to
    : item.to

  // 編集中の家財をカテゴリ別にまとめる
  const grouped = {}
  kazai.forEach((k, idx) => {
    const c = categoryOf(k.name)
    ;(grouped[c] = grouped[c] || []).push({ ...k, _idx: idx })
  })

  const statusSelect = onStatusChange ? (
    <select value={item.status || '未架電'} onChange={e => onStatusChange(item, e.target.value)}
      className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}
      style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}>
      {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  ) : <span className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}>{item.status || '未架電'}</span>

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        {/* ヘッダー */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{item.name || '（名前なし）'} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>様</span></div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{item.site || ''}{item.orderId ? ` ／ 依頼番号 ${item.orderId}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {onCreateEstimate && (
              <button className="btn btn-primary btn-sm" onClick={() => onCreateEstimate(item)}>📝 見積書を作成</button>
            )}
            <button className="btn btn-sm btn-outline" onClick={onClose}>閉じる</button>
          </div>
        </div>

        {/* 基本情報 */}
        <div style={sectionBar}>基本情報</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Field label="フリガナ" value={item.kana} />
          <Field label="電話" value={<a href={`tel:${item.phone}`} style={{ color: '#1E5FA8', fontWeight: 700, textDecoration: 'none' }}>{item.phone || '—'}</a>} />
          <Field label="メール" value={item.email && <a href={`mailto:${item.email}`} style={{ color: '#1E5FA8', fontWeight: 700, textDecoration: 'none' }}>{item.email}</a>} />
          <Field label="人数" value={item.count} />
          <Field label="受付日時" value={item.receivedAt} />
          <Field label="依頼日" value={item.requestedAt} />
          <Field label="引越し希望日" value={item.moveDateDetail || item.moveDate} wide />
        </div>

        {/* 住所 */}
        <div style={sectionBar}>住所</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Field label="引越し元" value={fromText} wide />
          <Field label="引越し先" value={toText} wide />
        </div>

        {/* 詳細内容（ズバット詳細がある時のみ） */}
        {item.detail && (item.option || item.request || item.telStatus || item.mailStatus) && (
          <>
            <div style={sectionBar}>詳細内容</div>
            <div style={{ borderBottom: '1px solid #EEF2F7' }}>
              <Field label="依頼作業" value={item.option} wide />
              <Field label="ご要望" value={item.request} wide />
              <Field label="対応状況" value={[item.telStatus, item.mailStatus].filter(Boolean).join(' / ')} wide />
            </div>
          </>
        )}

        {/* 家財（編集可） */}
        <div style={sectionBar}>家財{onSave ? '（編集可）' : ''}</div>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #EEF2F7' }}>
          {['家具', '家電', 'その他', '重量物'].map(cat => (
            grouped[cat] && grouped[cat].length > 0 && (
              <div key={cat} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 48, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748B', paddingTop: 6 }}>{cat}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {grouped[cat].map((k) => (
                    <span key={k._idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#FFF7ED', color: '#C2410C', borderRadius: 6, padding: '3px 6px 3px 8px', fontWeight: 600 }}>
                      {k.name}×
                      {onSave ? (
                        <input type="number" min={0} value={k.qty}
                          onChange={e => setQty(k._idx, e.target.value)}
                          style={{ width: 40, padding: '1px 4px', border: '1px solid #FED7AA', borderRadius: 4, background: '#fff', color: '#C2410C', fontWeight: 700, fontSize: 12 }} />
                      ) : k.qty}
                      {onSave && (
                        <button onClick={() => removeRow(k._idx)} title="削除" style={{ background: 'none', border: 'none', color: '#C2410C', cursor: 'pointer', fontWeight: 700, fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )
          ))}
          {item.kazaiUnknown > 0 && !onSave && (
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>他{item.kazaiUnknown}品（詳細ページを開くと品名表示）</div>
          )}
          {/* 追加 */}
          {onSave && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={addName} onChange={e => setAddName(e.target.value)} style={{ ...inp, flex: 1, minWidth: 180 }}>
                <option value="">＋ 家財を追加…</option>
                {Object.entries(KAZAI_CATEGORY).map(([cat, list]) => (
                  <optgroup key={cat} label={cat}>
                    {list.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                ))}
              </select>
              <input type="number" min={1} value={addQty} onChange={e => setAddQty(e.target.value)} style={{ ...inp, width: 70, textAlign: 'center' }} />
              <button className="btn btn-outline btn-sm" onClick={addRow} disabled={!addName}>追加</button>
              <div style={{ flexBasis: '100%' }} />
              <span style={{ fontSize: 11, color: '#64748B' }}>ダンボール</span>
              <input value={boxCount} onChange={e => { setBoxCount(e.target.value); markDirty() }} placeholder="例：10" style={{ ...inp, width: 80, textAlign: 'center' }} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>箱</span>
            </div>
          )}
          {!onSave && boxCount && <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>ダンボール {boxCount}</div>}
        </div>

        {/* 対応・メモ（メモは編集可） */}
        <div style={sectionBar}>対応・メモ</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Field label="ステータス" value={statusSelect} wide />
          <div style={{ display: 'flex', fontSize: 13 }}>
            <div style={{ width: 96, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>メモ</div>
            <div style={{ flex: 1, padding: 8 }}>
              {onSave ? (
                <textarea value={memo} onChange={e => { setMemo(e.target.value); markDirty() }}
                  placeholder="メモを記入…" rows={3}
                  style={{ ...inp, width: '100%', resize: 'vertical', minHeight: 60 }} />
              ) : (
                <div style={{ color: '#1E293B', fontWeight: 600, padding: '4px 2px', whiteSpace: 'pre-wrap' }}>{memo || '—'}</div>
              )}
            </div>
          </div>
        </div>

        {/* 取得/登録日時 */}
        <div style={{ fontSize: 11, color: '#94A3B8', padding: '10px 14px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {item.detectedAt && <span>取得日時（拡張検知）: {new Date(item.detectedAt).toLocaleString('ja-JP')}</span>}
          {item.savedAt && <span>登録日時（CRM保存）: {new Date(item.savedAt).toLocaleString('ja-JP')}</span>}
          {item.updatedAt && <span>更新: {new Date(item.updatedAt).toLocaleString('ja-JP')}</span>}
        </div>

        {/* 保存バー */}
        {onSave && (
          <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #EEF2F7', padding: '10px 14px', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            {dirty && <span style={{ fontSize: 11, color: '#C2410C', marginRight: 'auto' }}>未保存の変更があります</span>}
            <button className="btn btn-outline btn-sm" onClick={onClose}>閉じる</button>
            <button className="btn btn-primary btn-sm" onClick={saveChanges} disabled={!dirty || saving} style={{ opacity: (!dirty || saving) ? .55 : 1 }}>
              {saving ? '保存中…' : '変更を保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
