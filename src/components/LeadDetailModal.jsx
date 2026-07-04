// リード詳細モーダル（リード管理／架電ログで共用）
// 編集モード：✏ 編集ボタンで全項目を編集可能化（ステータス・家財・メモは常時編集可）
// onSave(item, patch)：空文字でもキーが含まれていれば送る（明示クリア対応）
// onCreateEstimate(item)：「📝 見積書を作成」で見積書タブへプリフィル遷移
import { useEffect, useState } from 'react'
import { fetchStaffList, DEFAULT_STAFF } from '../lib/staff'

const STATUS_LIST  = ['未架電', '架電済', '留守', '成約', '見送り']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', '成約': 'bg', '見送り': 'bk' }
const YN = ['', 'あり', 'なし']

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
function categoryOf(name) {
  for (const [cat, list] of Object.entries(KAZAI_CATEGORY)) if (list.includes(name)) return cat
  return 'その他'
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const box     = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
// セクション見出し：既存タブのカード見出し風（白背景＋青の左アクセント）に統一
const sectionBar = {
  background: '#F8FAFC', color: '#1E293B', fontSize: 12, fontWeight: 800,
  padding: '8px 14px', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0',
  borderLeft: '4px solid #1E5FA8', letterSpacing: '.04em',
}
const inp = { padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', width: '100%' }

// 「対応履歴以外」の編集対象キー一覧（保存時にこの集合だけ patch として送る）
const EDITABLE_KEYS = [
  // 基本
  'name', 'kana', 'phone', 'email', 'count', 'ageGender', 'job',
  'moveDateDetail', 'preferredTime', 'requestedAt',
  // 引越し元
  'fromZip', 'fromAddress', 'fromType', 'fromFloor', 'fromElevator', 'fromLayout',
  // 引越し先
  'toZip', 'toAddress', 'toType', 'toFloor', 'toElevator', 'toLayout',
  // 詳細内容
  'request', 'option', 'referenceFee',
  // 対応・金額・メモ
  'amount', 'memo',
]

// "06/26 21:22"（年なし・分まで）→ Date。未来になる場合は前年と解釈。
function parseSiteAt(s) {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})/)
  if (!m) return null
  const now = new Date()
  let y = now.getFullYear()
  const d = new Date(y, parseInt(m[1], 10) - 1, parseInt(m[2], 10), parseInt(m[3], 10), parseInt(m[4], 10), 0)
  if (d.getTime() > now.getTime() + 24 * 3600 * 1000) d.setFullYear(y - 1)
  return d
}
function captureLagSec(item) {
  const a = parseSiteAt(item && (item.receivedAt || item.requestedAt))
  const bRaw = item && (item.detectedAt || item.savedAt)
  const b = bRaw ? new Date(bRaw) : null
  if (!a || !b || isNaN(b.getTime())) return null
  const sec = Math.round((b.getTime() - a.getTime()) / 1000)
  return sec < 0 ? 0 : sec
}
function lagText(sec) {
  if (sec == null) return null
  if (sec < 60) return `${sec}秒`
  if (sec < 3600) return `${Math.floor(sec / 60)}分${sec % 60}秒`
  if (sec < 86400) return `${Math.floor(sec / 3600)}時間${Math.floor((sec % 3600) / 60)}分`
  return `${Math.floor(sec / 86400)}日`
}
function lagColor(sec) {
  if (sec == null) return '#94A3B8'
  if (sec <= 25) return '#15803D'
  if (sec <= 60) return '#C2410C'
  return '#B91C1C'
}
export { captureLagSec, lagText, lagColor }

// 編集／閲覧共通のフィールド行
function Row({ label, value, edit, onChange, type = 'text', options, placeholder, wide }) {
  // 閲覧時：値が空なら行を出さない（編集モードでは空でも入力欄を出す）
  if (!edit && (value == null || value === '')) return null
  return (
    <div style={{ display: 'flex', fontSize: 13, borderBottom: '1px solid #F1F5F9', gridColumn: wide ? '1 / -1' : 'auto' }}>
      <div style={{ width: 110, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>{label}</div>
      <div style={{ padding: '6px 10px', wordBreak: 'break-all', flex: 1 }}>
        {edit ? (
          options ? (
            <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={inp}>
              {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
            </select>
          ) : (
            <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''} style={inp} />
          )
        ) : (
          <div style={{ color: '#1E293B', fontWeight: 600, padding: '2px 0' }}>{value}</div>
        )}
      </div>
    </div>
  )
}

export default function LeadDetailModal({ item, onClose, onStatusChange, onSave, onCreateEstimate, onCreateContract }) {
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState({})
  const [kazai, setKazai] = useState([])
  const [boxCount, setBoxCount] = useState('')
  const [addName, setAddName] = useState('')
  const [addQty, setAddQty] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!item) return
    const d = {}
    EDITABLE_KEYS.forEach(k => { d[k] = item[k] != null ? item[k] : '' })
    // 古い基本データのみのリード（detail=falseなど）は from/to を引き継ぐ
    if (!d.fromAddress && item.from) d.fromAddress = item.from
    if (!d.toAddress && item.to) d.toAddress = item.to
    setDraft(d)
    setKazai(Array.isArray(item.kazai) ? item.kazai.map(k => ({ ...k })) : [])
    setBoxCount(item.boxCount || '')
    setAddName(''); setAddQty(1)
    setDirty(false)
    setEdit(false)
  }, [item && item.id, item && item.phone])

  if (!item) return null

  const setField = (k, v) => { setDraft(p => ({ ...p, [k]: v })); setDirty(true) }
  const setQty = (i, q) => { setKazai(p => p.map((k, idx) => idx === i ? { ...k, qty: Math.max(0, Number(q) || 0) } : k)); setDirty(true) }
  const removeRow = (i) => { setKazai(p => p.filter((_, idx) => idx !== i)); setDirty(true) }
  const addRow = () => {
    if (!addName) return
    setKazai(p => {
      const idx = p.findIndex(k => k.name === addName)
      if (idx >= 0) { const c = [...p]; c[idx] = { ...c[idx], qty: (Number(c[idx].qty) || 0) + (Number(addQty) || 1) }; return c }
      return [...p, { name: addName, qty: Number(addQty) || 1 }]
    })
    setAddName(''); setAddQty(1); setDirty(true)
  }

  const saveChanges = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      const patch = { ...draft,
        kazai: kazai.filter(k => k.name && Number(k.qty) > 0),
        kazaiCount: kazai.filter(k => Number(k.qty) > 0).length,
        kazaiUnknown: 0,
        boxCount,
      }
      await onSave(item, patch)
      setDirty(false); setEdit(false)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const v = (k) => draft[k]

  // 住所表示（閲覧時）
  const fromText = [v('fromZip'), v('fromAddress'), v('fromType') && `（${v('fromType')}）`].filter(Boolean).join(' ') || item.from
  const toText   = [v('toZip'),   v('toAddress'),   v('toType')   && `（${v('toType')}）`  ].filter(Boolean).join(' ') || item.to

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
            <div style={{ fontSize: 17, fontWeight: 800 }}>{v('name') || item.name || '（名前なし）'} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>様</span></div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{item.site || ''}{item.orderId ? ` ／ 依頼番号 ${item.orderId}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {onSave && (
              <button className={`btn btn-sm ${edit ? 'btn-outline' : 'btn-primary'}`}
                onClick={() => setEdit(e => !e)}>
                {edit ? '閲覧に戻す' : '✏ 編集'}
              </button>
            )}
            {onCreateContract && (
              <button className="btn btn-sm" style={{ background: '#16A34A', color: '#fff', fontWeight: 700 }} onClick={() => onCreateContract(item)}>✅ 成約登録</button>
            )}
            {onCreateEstimate && (
              <button className="btn btn-primary btn-sm" onClick={() => onCreateEstimate(item)}>📝 見積書を作成</button>
            )}
            <button className="btn btn-sm btn-outline" onClick={onClose}>閉じる</button>
          </div>
        </div>

        {/* 基本情報 */}
        <div style={sectionBar}>基本情報</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Row label="フリガナ"      edit={edit} value={v('kana')}     onChange={x => setField('kana', x)} />
          <Row label="名前"          edit={edit} value={v('name')}     onChange={x => setField('name', x)} />
          <Row label="電話番号"      edit={edit} value={v('phone')}    onChange={x => setField('phone', x)} placeholder="090-…" />
          <Row label="メールアドレス" edit={edit} value={v('email')}   onChange={x => setField('email', x)} type="email" />
          <Row label="年代・性別"    edit={edit} value={v('ageGender')} onChange={x => setField('ageGender', x)} placeholder="例：30代 男性" />
          <Row label="職業"          edit={edit} value={v('job')}      onChange={x => setField('job', x)} />
          <Row label="引越し人数"    edit={edit} value={v('count')}    onChange={x => setField('count', x)} placeholder="例：2人" />
          <Row label="依頼日"        edit={edit} value={v('requestedAt') || item.receivedAt} onChange={x => setField('requestedAt', x)} />
          <Row label="引越し希望日"  edit={edit} value={v('moveDateDetail') || item.moveDate} onChange={x => setField('moveDateDetail', x)} wide />
          <Row label="希望時間帯"    edit={edit} value={v('preferredTime')} onChange={x => setField('preferredTime', x)} placeholder="例：午前 / 13:00〜" wide />
        </div>

        {/* 引越し元 */}
        <div style={sectionBar}>現住所（引越し元）</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Row label="〒"            edit={edit} value={v('fromZip')}     onChange={x => setField('fromZip', x)} placeholder="815-0000" />
          <Row label="住所"          edit={edit} value={v('fromAddress')} onChange={x => setField('fromAddress', x)} placeholder="福岡市…" wide />
          <Row label="建物種別"      edit={edit} value={v('fromType')}    onChange={x => setField('fromType', x)} placeholder="マンション / 戸建て / アパート" />
          <Row label="建物階数"      edit={edit} value={v('fromFloor')}   onChange={x => setField('fromFloor', x)} placeholder="例：3階" />
          <Row label="エレベーター"  edit={edit} value={v('fromElevator')} onChange={x => setField('fromElevator', x)} options={YN} />
          <Row label="間取り"        edit={edit} value={v('fromLayout')}  onChange={x => setField('fromLayout', x)} placeholder="例：2LDK" />
          {!edit && !fromText && <div style={{ fontSize: 12, color: '#94A3B8', padding: 10, gridColumn: '1 / -1' }}>（未入力）</div>}
        </div>

        {/* 引越し先 */}
        <div style={sectionBar}>転居先（引越し先）</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Row label="〒"            edit={edit} value={v('toZip')}     onChange={x => setField('toZip', x)} />
          <Row label="住所"          edit={edit} value={v('toAddress')} onChange={x => setField('toAddress', x)} wide />
          <Row label="建物種別"      edit={edit} value={v('toType')}    onChange={x => setField('toType', x)} />
          <Row label="建物階数"      edit={edit} value={v('toFloor')}   onChange={x => setField('toFloor', x)} />
          <Row label="エレベーター"  edit={edit} value={v('toElevator')} onChange={x => setField('toElevator', x)} options={YN} />
          <Row label="間取り"        edit={edit} value={v('toLayout')}  onChange={x => setField('toLayout', x)} />
          {!edit && !toText && <div style={{ fontSize: 12, color: '#94A3B8', padding: 10, gridColumn: '1 / -1' }}>（未入力）</div>}
        </div>

        {/* 詳細内容 */}
        <div style={sectionBar}>詳細内容</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Row label="備考・要望"    edit={edit} value={v('request')} onChange={x => setField('request', x)} wide />
          <Row label="依頼作業"      edit={edit} value={v('option')}  onChange={x => setField('option', x)} placeholder="搬出/輸送/搬入 / 家具梱包 等" wide />
          <Row label="表示料金相場"  edit={edit} value={v('referenceFee')} onChange={x => setField('referenceFee', x)} placeholder="例：89,000円 〜 150,000円" wide />
          <Row label="対応状況"      edit={false} value={[item.telStatus, item.mailStatus].filter(Boolean).join(' / ')} wide />
        </div>

        {/* 家財（常時編集可） */}
        <div style={sectionBar}>家財{onSave ? '（編集可）' : ''}</div>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #EEF2F7' }}>
          {['家具', '家電', 'その他', '重量物'].map(cat => (
            grouped[cat] && grouped[cat].length > 0 && (
              <div key={cat} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 48, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748B', paddingTop: 6 }}>{cat}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {grouped[cat].map((k) => (
                    <span key={k._idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, background: '#EFF6FF', color: '#1D4ED8', borderRadius: 6, padding: '3px 6px 3px 8px', fontWeight: 600 }}>
                      {k.name}×
                      {onSave ? (
                        <input type="number" min={0} value={k.qty}
                          onChange={e => setQty(k._idx, e.target.value)}
                          style={{ width: 40, padding: '1px 4px', border: '1px solid #BFDBFE', borderRadius: 4, background: '#fff', color: '#1D4ED8', fontWeight: 700, fontSize: 12 }} />
                      ) : k.qty}
                      {onSave && (
                        <button onClick={() => removeRow(k._idx)} title="削除" style={{ background: 'none', border: 'none', color: '#1D4ED8', cursor: 'pointer', fontWeight: 700, fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>
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
          {onSave && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={addName} onChange={e => setAddName(e.target.value)} style={{ ...inp, flex: 1, minWidth: 180, width: 'auto' }}>
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
              <input value={boxCount} onChange={e => { setBoxCount(e.target.value); setDirty(true) }} placeholder="例：10" style={{ ...inp, width: 80, textAlign: 'center' }} />
              <span style={{ fontSize: 11, color: '#94A3B8' }}>箱</span>
            </div>
          )}
          {!onSave && boxCount && <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>ダンボール {boxCount}</div>}
        </div>

        {/* 対応・金額・メモ */}
        <div style={sectionBar}>対応・金額・メモ</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Row label="ステータス" edit={false} value={statusSelect} wide />
          <Row label="成約金額（円）" edit={edit} value={v('amount')} onChange={x => setField('amount', x)} type="number" placeholder="例：68000" wide />
          <div style={{ display: 'flex', fontSize: 13 }}>
            <div style={{ width: 110, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>メモ</div>
            <div style={{ flex: 1, padding: 8 }}>
              {onSave ? (
                <textarea value={v('memo') || ''} onChange={e => setField('memo', e.target.value)}
                  placeholder="メモを記入…" rows={3} style={{ ...inp, resize: 'vertical', minHeight: 60 }} />
              ) : (
                <div style={{ color: '#1E293B', fontWeight: 600, padding: '4px 2px', whiteSpace: 'pre-wrap' }}>{v('memo') || '—'}</div>
              )}
            </div>
          </div>
        </div>

        {/* 獲得スピード */}
        {(() => {
          const sec = captureLagSec(item)
          if (sec == null) return null
          return (
            <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #EEF2F7' }}>
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700 }}>獲得スピード</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: lagColor(sec) }}>{lagText(sec)}</div>
              <div style={{ fontSize: 10, color: '#94A3B8' }}>（目標 25秒以内）</div>
              {sec <= 25 && <span style={{ background: '#F0FDF4', color: '#15803D', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>✓ 達成</span>}
            </div>
          )
        })()}

        {/* 日時 */}
        <div style={{ fontSize: 11, color: '#94A3B8', padding: '10px 14px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {item.receivedAt && <span>ズバット登録: {item.receivedAt}</span>}
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

// =====================================================================
// 成約変換モーダル：リードのステータスを「成約」に変える際に金額入力させ、
// 同じ顧客情報を /api/contracts に新規追加するためのフォーム。
// 親は onConfirm(lead, payload) を実装して contracts API への保存とリードの
// status/amount 更新（/api/inbound PUT）を担当する。
// =====================================================================
const SRC_LIST = ['サムライ', 'ズバッと', '価格.com', 'SUUMO', '直電', 'チラシ', '企業紹介', 'その他']
const SITE_TO_SRC = { 'ズバット': 'ズバッと', 'ズバッと': 'ズバッと', '引越し侍': 'サムライ', '価格.com': '価格.com', 'SUUMO': 'SUUMO' }

export function ConvertToContractModal({ lead, onClose, onConfirm }) {
  const today = new Date().toISOString().slice(0, 10)
  const [amount, setAmount]   = useState('')
  const [srcLabel, setSrcLabel] = useState('その他')
  const [date, setDate]       = useState(today)
  const [salesDate, setSalesDate] = useState(today) // 売り上げ登録日（成約/売上/スケジュール/見積の基準日）
  const [staff, setStaff]     = useState('')
  const [memo, setMemo]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [staffList, setStaffList] = useState(DEFAULT_STAFF)

  useEffect(() => { fetchStaffList().then(setStaffList) }, [])

  useEffect(() => {
    if (!lead) return
    setAmount(lead.amount != null ? String(lead.amount) : '')
    setSrcLabel(SITE_TO_SRC[lead.site] || 'その他')
    setDate(today)
    setSalesDate(today)
    setStaff('')
    setMemo([lead.memo, lead.option, lead.request].filter(Boolean).join(' / '))
    setSaving(false)
  }, [lead && lead.id, lead && lead.phone])

  if (!lead) return null

  const route = (() => {
    const from = (lead.from || lead.fromAddress || '').replace(/^福岡県/, '').replace(/^福岡市/, '')
    const to   = (lead.to   || lead.toAddress   || '').replace(/^福岡県/, '').replace(/^福岡市/, '')
    return [from, to].filter(Boolean).join(' → ')
  })()

  const submit = async () => {
    setSaving(true)
    try {
      await onConfirm(lead, {
        amount: Number(amount) || 0,
        srcLabel, date, salesDate, staff, memo, route,
      })
      onClose()
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const ov = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }
  const bx = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
  const ip = { width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lb = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, display: 'block' }

  return (
    <div style={ov} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={bx}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>成約管理に登録</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{lead.name || '（名前なし）'} 様 ／ {lead.phone || ''}</div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onClose}>キャンセル</button>
        </div>
        <div style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lb}>成約金額（円） *</label>
              <input type="number" inputMode="numeric" min={0} autoFocus
                value={amount} onChange={e => setAmount(e.target.value)} placeholder="例：68000" style={ip} />
            </div>
            <div>
              <label style={lb}>売り上げ登録日 *</label>
              <input type="date" value={salesDate} onChange={e => setSalesDate(e.target.value)} style={ip} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lb}>流入元</label>
              <select value={srcLabel} onChange={e => setSrcLabel(e.target.value)} style={ip}>
                {SRC_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lb}>引越し日</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={ip} />
            </div>
          </div>
          <div>
            <label style={lb}>区間</label>
            <div style={{ ...ip, background: '#F8FAFC', color: '#1E293B', fontWeight: 600 }}>{route || '—'}</div>
          </div>
          <div>
            <label style={lb}>担当者</label>
            <select value={staff} onChange={e => setStaff(e.target.value)} style={ip}>
              <option value="">（未選択）</option>
              {staffList.map(s => <option key={s} value={s}>{s}</option>)}
              {staff && !staffList.includes(staff) && <option value={staff}>{staff}</option>}
            </select>
          </div>
          <div>
            <label style={lb}>メモ</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} style={{ ...ip, resize: 'vertical', minHeight: 60 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-outline" onClick={onClose}>キャンセル</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !amount} style={{ opacity: (!amount || saving) ? .55 : 1 }}>
              {saving ? '登録中…' : '成約管理に登録'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#94A3B8' }}>※ 登録するとリードのステータスは「成約」に。売り上げ登録日は成約管理・売上管理・スケジュール・見積書に反映されます。</div>
        </div>
      </div>
    </div>
  )
}
