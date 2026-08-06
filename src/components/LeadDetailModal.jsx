// リード詳細モーダル（リード管理／架電ログで共用）
// 編集モード：✏ 編集ボタンで全項目を編集可能化（ステータス・家財・メモは常時編集可）
// onSave(item, patch)：空文字でもキーが含まれていれば送る（明示クリア対応）
// onCreateEstimate(item)：「📝 見積書を作成」で見積書タブへプリフィル遷移
import { useEffect, useState } from 'react'
import { fetchStaffList, DEFAULT_STAFF } from '../lib/staff'
import { fcell, flab, fin, fval, fband, BAND, flabAddress, flabDetail, WORK_ITEMS, table4, COLS4 } from '../lib/detailStyles'

const STATUS_LIST  = ['未架電', '架電済', '留守', '見積り', '要追客', '成約', '見送り']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', '見積り': 'bc', '要追客': 'bp', '成約': 'bg', '見送り': 'bk' }
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
  'toZip', 'toAddress', 'toType', 'toFloor', 'toElevator', 'toLayout', 'visitEstimateDate',
  // 詳細内容
  'request', 'option', 'referenceFee',
  // 対応・メモ
  'memo',
  // 依頼作業のチェック状態（査定サイトの依頼作業に対応。オブジェクトで保持）
  'works',
]

// 帳票レイアウトの表セル。編集中は入力欄、閲覧時は値をそのまま出す。
function Cell({ edit, value, onChange, type = 'text', options, multiline }) {
  if (!edit) return <div style={fval}>{value || ''}</div>
  if (options) {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={fin}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (multiline) {
    return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...fin, minHeight: 46, resize: 'vertical' }} />
  }
  return <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} style={fin} />
}

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
  const [customKazai, setCustomKazai] = useState(false) // 家財追加：自由入力モード（選択の度に1回だけ）
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
    setAddName(''); setAddQty(1); setCustomKazai(false)
    setDirty(false)
    setEdit(false)
  }, [item && item.id, item && item.phone])

  if (!item) return null

  const setField = (k, v) => { setDraft(p => ({ ...p, [k]: v })); setDirty(true) }
  const setQty = (i, q) => { setKazai(p => p.map((k, idx) => idx === i ? { ...k, qty: Math.max(0, Number(q) || 0) } : k)); setDirty(true) }
  const removeRow = (i) => { setKazai(p => p.filter((_, idx) => idx !== i)); setDirty(true) }
  // 家財の追加プルダウンで「✏ 自由入力」を選ぶと、その場だけ入力欄に切り替える
  const chooseAddName = (val) => {
    if (val === '__custom__') { setCustomKazai(true); setAddName('') }
    else { setCustomKazai(false); setAddName(val) }
  }
  const addRow = () => {
    if (!addName) return
    setKazai(p => {
      const idx = p.findIndex(k => k.name === addName)
      if (idx >= 0) { const c = [...p]; c[idx] = { ...c[idx], qty: (Number(c[idx].qty) || 0) + (Number(addQty) || 1) }; return c }
      return [...p, { name: addName, qty: Number(addQty) || 1 }]
    })
    setAddName(''); setAddQty(1); setCustomKazai(false); setDirty(true)
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
  // 依頼作業のチェック状態。未設定や旧データ（文字列）は空として扱う。
  const worksRaw = v('works')
  const works = (worksRaw && typeof worksRaw === 'object' && !Array.isArray(worksRaw)) ? worksRaw : {}

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

  // 印刷/PDF出力：どちらもブラウザの印刷ダイアログを使う（PDFは「PDFに保存」を選択するだけで同じ動作のため1ボタンに統一）。
  // タブタイトルを一時的にリード名にし、「PDFに保存」時の保存ファイル名の候補に反映させる。
  const doPrint = () => {
    const prevTitle = document.title
    document.title = `リード_${(v('name') || item.name || '名称未設定').replace(/\s+/g, '')}`
    window.print()
    setTimeout(() => { document.title = prevTitle }, 300)
  }

  return (
    // 枠外クリックでは閉じない（入力中の内容が消えないように）。閉じるはヘッダー/フッターのボタンから
    <div style={overlay}>
      <div style={box} className="print-area">
        {/* ヘッダー */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{v('name') || item.name || '（名前なし）'} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>様</span></div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{item.site || ''}{item.orderId ? ` ／ 依頼番号 ${item.orderId}` : ''}</div>
          </div>
          <div className="no-print" style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-outline" onClick={doPrint}>🖨 印刷/PDF</button>
            {onSave && (
              <button className={`btn btn-sm ${edit ? 'btn-outline' : 'btn-primary'}`}
                onClick={() => setEdit(e => !e)}>
                {edit ? '閲覧に戻す' : '✏ 編集'}
              </button>
            )}
            {onCreateContract && (
              (item.status === '成約' || item.contracted)
                ? <button className="btn btn-sm" disabled title="このリードは成約登録済みです。編集は成約管理で行えます。"
                    style={{ background: '#E2E8F0', color: '#64748B', fontWeight: 700, cursor: 'default' }}>✅ 成約済み</button>
                : <button className="btn btn-sm" style={{ background: '#16A34A', color: '#fff', fontWeight: 700 }} onClick={() => onCreateContract(item)}>✅ 成約登録</button>
            )}
            {onCreateEstimate && (
              <button className="btn btn-primary btn-sm" onClick={() => onCreateEstimate(item)}>📝 見積書を作成</button>
            )}
            <button className="btn btn-sm btn-outline" onClick={onClose}>閉じる</button>
          </div>
        </div>

        {/* 基本情報 */}
        {/* ── 顧客情報（帳票と同じ並び）── */}
        <div style={{ padding: 12 }}>
          <table style={{ ...table4, ...fband(BAND.customer) }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flab}>フリガナ</td>
                <td style={fcell}><Cell edit={edit} value={v('kana')} onChange={x => setField('kana', x)} /></td>
                <td style={flab}>依頼日</td>
                <td style={fcell}><Cell edit={edit} value={v('requestedAt') || item.receivedAt} onChange={x => setField('requestedAt', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>名前</td>
                <td style={fcell}><Cell edit={edit} value={v('name')} onChange={x => setField('name', x)} /></td>
                <td style={flab}>引越し日</td>
                <td style={fcell}><Cell edit={edit} value={v('moveDateDetail') || item.moveDate} onChange={x => setField('moveDateDetail', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>電話番号</td>
                <td style={fcell}><Cell edit={edit} value={v('phone')} onChange={x => setField('phone', x)} /></td>
                <td style={flab}>引越し時間</td>
                <td style={fcell}><Cell edit={edit} value={v('preferredTime')} onChange={x => setField('preferredTime', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>年代・性別</td>
                <td style={fcell}><Cell edit={edit} value={v('ageGender')} onChange={x => setField('ageGender', x)} /></td>
                <td style={flab}>引越し人数</td>
                <td style={fcell}><Cell edit={edit} value={v('count')} onChange={x => setField('count', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>職業</td>
                <td style={fcell}><Cell edit={edit} value={v('job')} onChange={x => setField('job', x)} /></td>
                <td style={flab}>メールアドレス</td>
                <td style={fcell}><Cell edit={edit} value={v('email')} onChange={x => setField('email', x)} /></td>
              </tr>
            </tbody>
          </table>

          {/* ── 現住所 / 引越し先 ── */}
          <table style={{ ...table4, ...fband(BAND.address) }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flabAddress} colSpan={2}>現住所</td>
                <td style={flabAddress} colSpan={2}>引越し先</td>
              </tr>
              <tr>
                <td style={flab}>郵便番号</td><td style={fcell}><Cell edit={edit} value={v('fromZip')} onChange={x => setField('fromZip', x)} /></td>
                <td style={flab}>郵便番号</td><td style={fcell}><Cell edit={edit} value={v('toZip')} onChange={x => setField('toZip', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>住所</td><td style={fcell}><Cell edit={edit} value={v('fromAddress')} onChange={x => setField('fromAddress', x)} /></td>
                <td style={flab}>住所</td><td style={fcell}><Cell edit={edit} value={v('toAddress')} onChange={x => setField('toAddress', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>建物種別</td><td style={fcell}><Cell edit={edit} value={v('fromType')} onChange={x => setField('fromType', x)} /></td>
                <td style={flab}>建物種別</td><td style={fcell}><Cell edit={edit} value={v('toType')} onChange={x => setField('toType', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>建物階数</td><td style={fcell}><Cell edit={edit} value={v('fromFloor')} onChange={x => setField('fromFloor', x)} /></td>
                <td style={flab}>建物階数</td><td style={fcell}><Cell edit={edit} value={v('toFloor')} onChange={x => setField('toFloor', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>エレベーター</td><td style={fcell}><Cell edit={edit} value={v('fromElevator')} onChange={x => setField('fromElevator', x)} options={YN} /></td>
                <td style={flab}>エレベーター</td><td style={fcell}><Cell edit={edit} value={v('toElevator')} onChange={x => setField('toElevator', x)} options={YN} /></td>
              </tr>
              <tr>
                <td style={flab}>間取り</td><td style={fcell}><Cell edit={edit} value={v('fromLayout')} onChange={x => setField('fromLayout', x)} /></td>
                <td style={flab}>間取り</td><td style={fcell}><Cell edit={edit} value={v('toLayout')} onChange={x => setField('toLayout', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>訪問見積もり日</td>
                <td style={fcell} colSpan={3}><Cell edit={edit} value={v('visitEstimateDate')} onChange={x => setField('visitEstimateDate', x)} type="date" /></td>
              </tr>
            </tbody>
          </table>

          {/* ── 詳細内容 ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, ...fband(BAND.detail) }}>
            <tbody>
              <tr><td style={flabDetail} colSpan={6}>詳細内容</td></tr>
              <tr>
                <td style={flab}>備考・その他希望</td>
                <td style={fcell} colSpan={5}><Cell edit={edit} value={v('request')} onChange={x => setField('request', x)} multiline /></td>
              </tr>
              <tr>
                <td style={flab}>料金</td>
                <td style={fcell} colSpan={5}><Cell edit={edit} value={v('referenceFee')} onChange={x => setField('referenceFee', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>対応状況</td>
                <td style={fcell} colSpan={5}>
                  <div style={fval}>{[item.telStatus, item.mailStatus].filter(Boolean).join(' / ') || '—'}</div>
                </td>
              </tr>
              {/* 依頼作業：チェック形式（サイト側の記載は下に併記） */}
              <tr>
                <td style={flab} rowSpan={2}>依頼作業</td>
                {WORK_ITEMS.slice(0, 5).map(w => (
                  <td key={w} style={{ ...fcell, textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, padding: '6px 4px', cursor: onSave ? 'pointer' : 'default' }}>
                      <input type="checkbox" disabled={!onSave} checked={!!works[w]}
                        onChange={e => setField('works', { ...works, [w]: e.target.checked })} />
                      {w}
                    </label>
                  </td>
                ))}
              </tr>
              <tr>
                {WORK_ITEMS.slice(5).map(w => (
                  <td key={w} style={{ ...fcell, textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, padding: '6px 4px', cursor: onSave ? 'pointer' : 'default' }}>
                      <input type="checkbox" disabled={!onSave} checked={!!works[w]}
                        onChange={e => setField('works', { ...works, [w]: e.target.checked })} />
                      {w}
                    </label>
                  </td>
                ))}
                <td style={fcell} colSpan={5 - WORK_ITEMS.slice(5).length} />
              </tr>
              {v('option') && (
                <tr>
                  <td style={flab}>サイト記載</td>
                  <td style={fcell} colSpan={5}><div style={{ ...fval, color: '#64748B' }}>{v('option')}</div></td>
                </tr>
              )}

              {/* 家財：数量1以上のものだけ。追加はリード管理と同じ「選ぶ→数量→追加」方式 */}
              {(() => {
                const cats = ['家具', '家電', 'その他', '重量物'].filter(c => grouped[c] && grouped[c].length > 0)
                const span = cats.length + (onSave ? 1 : 0) || 1
                return (
                  <>
                    {cats.map((cat, i) => (
                      <tr key={cat}>
                        {i === 0 && <td style={flab} rowSpan={span}>家財</td>}
                        <td style={{ ...flab, width: 64, background: '#FAFBFC' }}>{cat}</td>
                        <td style={fcell} colSpan={4}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6 }}>
                            {grouped[cat].map(k => (
                              <span key={k._idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#EFF6FF', color: '#1D4ED8', borderRadius: 6, padding: '3px 6px 3px 8px', fontWeight: 600 }}>
                                {k.name}×
                                {onSave ? (
                                  <input type="number" min={0} value={k.qty} onChange={e => setQty(k._idx, e.target.value)}
                                    style={{ width: 40, padding: '1px 4px', border: '1px solid #BFDBFE', borderRadius: 4, background: '#fff', color: '#1D4ED8', fontWeight: 700, fontSize: 12 }} />
                                ) : k.qty}
                                {onSave && <button onClick={() => removeRow(k._idx)} title="削除" style={{ background: 'none', border: 'none', color: '#1D4ED8', cursor: 'pointer', fontWeight: 700, fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2 }}>×</button>}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {onSave && (
                      <tr>
                        {cats.length === 0 && <td style={flab}>家財</td>}
                        <td style={fcell} colSpan={5}>
                          <div className="no-print" style={{ display: 'flex', gap: 6, padding: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            {customKazai ? (
                              <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                                <input type="text" autoFocus value={addName} onChange={e => setAddName(e.target.value)}
                                  placeholder="品名を入力…" style={{ ...inp, width: '100%', paddingRight: 26 }} />
                                <button type="button" onClick={() => { setCustomKazai(false); setAddName('') }} title="自由入力をキャンセル"
                                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1, padding: 4 }}>×</button>
                              </div>
                            ) : (
                              <select value={addName} onChange={e => chooseAddName(e.target.value)} style={{ ...inp, flex: 1, minWidth: 180, width: 'auto' }}>
                                <option value="">＋ 家財を追加…</option>
                                <option value="__custom__">✏ 自由入力（品名を直接入力）</option>
                                {Object.entries(KAZAI_CATEGORY).map(([cat, list]) => (
                                  <optgroup key={cat} label={cat}>{list.map(n => <option key={n} value={n}>{n}</option>)}</optgroup>
                                ))}
                              </select>
                            )}
                            <input type="number" min={1} value={addQty} onChange={e => setAddQty(e.target.value)} style={{ ...inp, width: 70, textAlign: 'center' }} />
                            <button className="btn btn-outline btn-sm" onClick={addRow} disabled={!addName}>追加</button>
                            <span style={{ fontSize: 11, color: '#64748B', marginLeft: 8 }}>ダンボール</span>
                            <input value={boxCount} onChange={e => { setBoxCount(e.target.value); setDirty(true) }} style={{ ...inp, width: 70, textAlign: 'center' }} />
                            <span style={{ fontSize: 11, color: '#94A3B8' }}>箱</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {!onSave && boxCount && (
                      <tr>
                        {cats.length === 0 && <td style={flab}>家財</td>}
                        <td style={fcell} colSpan={5}><div style={fval}>ダンボール {boxCount} 箱</div></td>
                      </tr>
                    )}
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>

        {/* ── 対応・メモ（従来のまま。ステータス・タイムツリー・メモ）── */}
        <div style={sectionBar}>対応・メモ</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Row label="ステータス" edit={false} value={statusSelect} wide />
          {onSave && (
            <div style={{ display: 'flex', fontSize: 13, borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ width: 110, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>タイムツリー</div>
              <div style={{ padding: '8px 10px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!item.timetree} onChange={() => onSave(item, { timetree: !item.timetree })}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0E8A7A' }} />
                </label>
              </div>
            </div>
          )}
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

        {item.memoUpdatedAt && (
          <div style={{ fontSize: 11, color: '#94A3B8', padding: '10px 14px', borderBottom: '1px solid #EEF2F7' }}>
            メモ最終更新: {new Date(item.memoUpdatedAt).toLocaleString('ja-JP')}
          </div>
        )}

        {/* 保存バー */}
        {onSave && (
          <div className="no-print" style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #EEF2F7', padding: '10px 14px', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
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

export function ConvertToContractModal({ lead, onClose, onConfirm, onGoCalendar }) {
  const today = new Date().toISOString().slice(0, 10)
  const [amount, setAmount]   = useState('')
  const [srcLabel, setSrcLabel] = useState('その他')
  const [date, setDate]       = useState(today)
  const [salesDate, setSalesDate] = useState(today) // 売り上げ登録日（成約/売上/スケジュール/見積の基準日）
  const [staff, setStaff]     = useState('')
  const [memo, setMemo]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [done, setDone]       = useState(false) // 登録完了→次工程ハンドオフ表示
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
    setDone(false)
  }, [lead && lead.id, lead && lead.phone])

  if (!lead) return null

  const route = (() => {
    const from = (lead.from || lead.fromAddress || '').replace(/^福岡県/, '').replace(/^福岡市/, '')
    const to   = (lead.to   || lead.toAddress   || '').replace(/^福岡県/, '').replace(/^福岡市/, '')
    return [from, to].filter(Boolean).join(' → ')
  })()

  const submit = async () => {
    if (!amount || !staff) return // 金額・担当者は必須
    setSaving(true)
    try {
      await onConfirm(lead, {
        amount: Number(amount) || 0,
        srcLabel, date, salesDate, staff, memo, route,
      })
      setDone(true) // 完了：閉じずに次工程へのハンドオフを表示
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const ov = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 }
  const bx = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
  const ip = { width: '100%', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff' }
  const lb = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, display: 'block' }
  const money = (n) => '¥' + (Number(n) || 0).toLocaleString('ja-JP')

  const formView = (
    // 枠外クリックでは閉じない（入力中の内容が消えないように）
    <div style={ov}>
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
            <label style={lb}>担当者 *</label>
            <select value={staff} onChange={e => setStaff(e.target.value)}
              style={{ ...ip, borderColor: staff ? '#E2E8F0' : '#FCA5A5' }}>
              <option value="">（担当者を選択）</option>
              {staffList.map(s => <option key={s} value={s}>{s}</option>)}
              {staff && !staffList.includes(staff) && <option value={staff}>{staff}</option>}
            </select>
            {!staff && <div style={{ fontSize: 10, color: '#DC2626', marginTop: 4 }}>担当者は必須です</div>}
          </div>
          <div>
            <label style={lb}>メモ</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} rows={3} style={{ ...ip, resize: 'vertical', minHeight: 60 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-outline" onClick={onClose}>キャンセル</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !amount || !staff} style={{ opacity: (!amount || !staff || saving) ? .55 : 1 }}>
              {saving ? '登録中…' : '成約管理に登録'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#94A3B8' }}>※ 登録するとリードのステータスは「成約」に。売り上げ登録日は成約管理・売上管理・スケジュール・見積書に反映されます。</div>
        </div>
      </div>
    </div>
  )

  // ---- 登録完了：次工程（配車の確認）へ気持ちよくつなぐハンドオフ ----
  const doneView = (
    <div style={ov} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={bx}>
        <div style={{ padding: '26px 22px 22px', textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', background: '#F0FDF4', color: '#16A34A', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>✓</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>成約を登録しました</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 1.6 }}>
            {lead.name || ''} 様 ／ {money(Number(amount) || 0)}<br />
            引越し日 {date} · 担当 {staff}
          </div>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', margin: '16px 0', fontSize: 11.5, color: '#475569', lineHeight: 1.6 }}>
            次は<b>引越し日の配車</b>を組み立てましょう。カレンダーで日付を開くと、その日の配車ボードに進めます。
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onGoCalendar && (
              <button className="btn btn-primary" onClick={() => onGoCalendar(date)} style={{ fontWeight: 700 }}>📅 カレンダーで配車を確認 →</button>
            )}
            <button className="btn btn-outline" onClick={onClose}>閉じて次のリードへ</button>
          </div>
        </div>
      </div>
    </div>
  )

  return done ? doneView : formView
}
