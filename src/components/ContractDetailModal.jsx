// 成約詳細モーダル（成約管理／配車ボードで共用）
// リード詳細モーダル(LeadDetailModal)と同じレイアウト（ヘッダー＋セクション区切り＋編集トグル）に統一。
// onSave(patch)：保存時に呼ばれる。呼び出し元が /api/contracts への POST/PUT を担当する。
import { useEffect, useState } from 'react'
import { fetchStaffList, DEFAULT_STAFF } from '../lib/staff'
import { fcell, flab, fin, fval, fband, BAND, flabAddress, flabDetail, WORK_ITEMS, table4, COLS4 } from '../lib/detailStyles'

export const STATUS_LIST    = ['成約済み', '交渉中', '見積済み', '連絡待ち', '要追客', '失注']
export const STATUS_BADGE   = { '成約済み': 'bg', '交渉中': 'bb', '見積済み': 'bo', '連絡待ち': 'bp', '要追客': 'by', '失注': 'br' }
export const SOURCE_LIST    = ['サムライ', 'ズバッと', '価格.com', 'SUUMO', '直電', 'チラシ', '企業紹介', 'その他']
export const AIRCON_OPTS    = ['必要なし', '未依頼', '依頼済み'] // エアコンの手配状況（既定＝必要なし）
export const CARDBOARD_OPTS = ['必要なし', '要配達']            // 段ボールの手配状況（既定＝必要なし）

export const EMPTY_CONTRACT = {
  name: '', kana: '', phone: '', email: '',
  srcLabel: 'サムライ', salesDate: '', date: '', moveDateText: '', persons: '',
  fromAddress: '', toAddress: '', visitEstimateDate: '', route: '',
  amount: '', status: '交渉中', aircon: '必要なし', cardboard: '必要なし', timetree: false,
  staff: '', memo: '', works: {},
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const box     = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
const sectionBar = {
  background: '#F8FAFC', color: '#1E293B', fontSize: 12, fontWeight: 800,
  padding: '8px 14px', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0',
  borderLeft: '4px solid #1E5FA8', letterSpacing: '.04em',
}
const inp = { padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', width: '100%' }

// 手配状況（エアコン・段ボール）の色分けプルダウン。成約一覧の表示と同じ配色・幅で統一する。
function flagColors(val) {
  const bg = (val === '依頼済み') ? '#F0FDF4' : (val === '未依頼' || val === '要配達') ? '#FFF7ED' : '#F8FAFC'
  const color = (val === '依頼済み') ? '#15803D' : (val === '未依頼' || val === '要配達') ? '#C2410C' : '#94A3B8'
  const border = (val === '依頼済み') ? '#BBF7D0' : (val === '未依頼' || val === '要配達') ? '#FED7AA' : '#E2E8F0'
  return { bg, color, border }
}

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
  if (multiline) return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ ...fin, minHeight: 46, resize: 'vertical' }} />
  return <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} style={fin} />
}

// 編集／閲覧共通のフィールド行（LeadDetailModalと同じ体裁）
function Row({ label, value, edit, onChange, type = 'text', options, placeholder, wide, flagStyle }) {
  if (!edit && (value == null || value === '')) return null
  return (
    <div style={{ display: 'flex', fontSize: 13, borderBottom: '1px solid #F1F5F9', gridColumn: wide ? '1 / -1' : 'auto' }}>
      <div style={{ width: 110, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>{label}</div>
      <div style={{ padding: '6px 10px', wordBreak: 'break-all', flex: 1 }}>
        {edit ? (
          options ? (
            flagStyle ? (
              <select value={value ?? ''} onChange={e => onChange(e.target.value)}
                style={{ border: `1px solid ${flagColors(value).border}`, borderRadius: 6, padding: '3px 6px', fontFamily: 'inherit', fontSize: 12, cursor: 'pointer', background: flagColors(value).bg, color: flagColors(value).color, fontWeight: 700, width: 96, textAlign: 'center', textAlignLast: 'center' }}>
                {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
              </select>
            ) : (
              <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={inp}>
                {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
              </select>
            )
          ) : (
            <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''} style={inp} />
          )
        ) : flagStyle ? (
          <span style={{ display: 'inline-block', border: `1px solid ${flagColors(value).border}`, borderRadius: 6, padding: '3px 6px', fontSize: 12, background: flagColors(value).bg, color: flagColors(value).color, fontWeight: 700, width: 96, textAlign: 'center' }}>{value}</span>
        ) : (
          <div style={{ color: '#1E293B', fontWeight: 600, padding: '2px 0' }}>{value}</div>
        )}
      </div>
    </div>
  )
}

export default function ContractDetailModal({ item, isNew, onClose, onSave, onDelete }) {
  const [edit, setEdit] = useState(!!isNew)
  const [draft, setDraft] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [staffList, setStaffList] = useState(DEFAULT_STAFF)

  useEffect(() => { fetchStaffList().then(setStaffList) }, [])

  useEffect(() => {
    if (!item) return
    setDraft({ ...EMPTY_CONTRACT, ...item, amount: item.amount != null ? String(item.amount) : '' })
    setDirty(false)
    setEdit(!!isNew)
  }, [item && item.id, isNew])

  if (!item) return null

  const setField = (k, v) => { setDraft(p => ({ ...p, [k]: v })); setDirty(true) }
  const v = (k) => draft[k]
  // 依頼作業のチェック状態。未設定や旧データ（文字列）は空として扱う。
  const worksRaw = v('works')
  const works = (worksRaw && typeof worksRaw === 'object' && !Array.isArray(worksRaw)) ? worksRaw : {}
  const routeAuto = [v('fromAddress'), v('toAddress')].filter(Boolean).join(' → ')

  const save = async () => {
    if (!onSave || !v('name')) return
    setSaving(true)
    try {
      const payload = { ...draft, amount: Number(draft.amount) || 0, route: draft.route || routeAuto }
      await onSave(payload)
      setDirty(false)
      if (!isNew) setEdit(false)
    } catch (e) { console.error(e) }
    setSaving(false)
  }

  const statusSelectEl = (
    <select value={v('status') || ''} onChange={e => setField('status', e.target.value)}
      className={`badge ${STATUS_BADGE[v('status')] || 'bk'}`}
      style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}>
      {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  )

  return (
    // 枠外クリックでは閉じない（入力中の内容が消えないように）。閉じるはヘッダー/フッターのボタンから
    <div style={overlay}>
      <div style={box}>
        {/* ヘッダー */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{isNew ? '新規成約' : (v('name') || '（名前なし）')} {!isNew && <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>様</span>}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{v('srcLabel') || ''}{v('date') ? ` ／ 引越し日 ${v('date')}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isNew && (
              <button className={`btn btn-sm ${edit ? 'btn-outline' : 'btn-primary'}`} onClick={() => setEdit(e2 => !e2)}>
                {edit ? '閲覧に戻す' : '✏ 編集'}
              </button>
            )}
            {onDelete && !isNew && (
              <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={onDelete}>削除</button>
            )}
            <button className="btn btn-sm btn-outline" onClick={onClose}>閉じる</button>
          </div>
        </div>

        {/* 基本情報 */}
        {/* ── 顧客情報（帳票と同じ並び。中身は成約の項目）── */}
        <div style={{ padding: 12 }}>
          <table style={{ ...table4, ...fband(BAND.customer) }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flab}>フリガナ</td>
                <td style={fcell}><Cell edit={edit} value={v('kana')} onChange={x => setField('kana', x)} /></td>
                <td style={flab}>流入元</td>
                <td style={fcell}><Cell edit={edit} value={v('srcLabel')} onChange={x => setField('srcLabel', x)} options={SOURCE_LIST} /></td>
              </tr>
              <tr>
                <td style={flab}>顧客名 *</td>
                <td style={fcell}><Cell edit={edit} value={v('name')} onChange={x => setField('name', x)} /></td>
                <td style={flab}>引越し日</td>
                <td style={fcell}><Cell edit={edit} value={v('date')} onChange={x => setField('date', x)} type="date" /></td>
              </tr>
              <tr>
                <td style={flab}>電話番号</td>
                <td style={fcell}><Cell edit={edit} value={v('phone')} onChange={x => setField('phone', x)} /></td>
                <td style={flab}>希望日</td>
                <td style={fcell}><Cell edit={edit} value={v('moveDateText')} onChange={x => setField('moveDateText', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>メールアドレス</td>
                <td style={fcell}><Cell edit={edit} value={v('email')} onChange={x => setField('email', x)} type="email" /></td>
                <td style={flab}>引越し人数</td>
                <td style={fcell}><Cell edit={edit} value={v('persons')} onChange={x => setField('persons', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>担当者</td>
                <td style={fcell}><Cell edit={edit} value={v('staff')} onChange={x => setField('staff', x)} options={['', ...staffList]} /></td>
                <td style={flab}>売上登録日</td>
                <td style={fcell}><Cell edit={edit} value={v('salesDate')} onChange={x => setField('salesDate', x)} type="date" /></td>
              </tr>
            </tbody>
          </table>

          {/* ── 現住所 / 引越し先 ── */}
          <table style={{ ...table4, ...fband(BAND.address) }}>
            <colgroup>{COLS4.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <tbody>
              <tr>
                <td style={flabAddress} colSpan={2}>現住所（引越し元）</td>
                <td style={flabAddress} colSpan={2}>引越し先</td>
              </tr>
              <tr>
                <td style={flab}>住所</td><td style={fcell}><Cell edit={edit} value={v('fromAddress')} onChange={x => setField('fromAddress', x)} /></td>
                <td style={flab}>住所</td><td style={fcell}><Cell edit={edit} value={v('toAddress')} onChange={x => setField('toAddress', x)} /></td>
              </tr>
              <tr>
                <td style={flab}>区間（表示）</td>
                <td style={fcell}><Cell edit={edit} value={v('route') || routeAuto} onChange={x => setField('route', x)} /></td>
                <td style={flab}>訪問見積もり日</td>
                <td style={fcell}><Cell edit={edit} value={v('visitEstimateDate')} onChange={x => setField('visitEstimateDate', x)} type="date" /></td>
              </tr>
            </tbody>
          </table>

          {/* ── 詳細内容 ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, ...fband(BAND.detail) }}>
            <tbody>
              <tr><td style={flabDetail} colSpan={6}>詳細内容</td></tr>
              <tr>
                <td style={flab}>見積金額（円）</td>
                <td style={fcell} colSpan={5}><Cell edit={edit} value={v('amount')} onChange={x => setField('amount', x)} type="number" /></td>
              </tr>
              {/* 依頼作業：チェック形式 */}
              <tr>
                <td style={flab} rowSpan={2}>依頼作業</td>
                {WORK_ITEMS.slice(0, 5).map(w => (
                  <td key={w} style={{ ...fcell, textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, padding: '6px 4px', cursor: edit ? 'pointer' : 'default' }}>
                      <input type="checkbox" disabled={!edit} checked={!!works[w]}
                        onChange={e => setField('works', { ...works, [w]: e.target.checked })} />
                      {w}
                    </label>
                  </td>
                ))}
              </tr>
              <tr>
                {WORK_ITEMS.slice(5).map(w => (
                  <td key={w} style={{ ...fcell, textAlign: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10, padding: '6px 4px', cursor: edit ? 'pointer' : 'default' }}>
                      <input type="checkbox" disabled={!edit} checked={!!works[w]}
                        onChange={e => setField('works', { ...works, [w]: e.target.checked })} />
                      {w}
                    </label>
                  </td>
                ))}
                <td style={fcell} colSpan={5 - WORK_ITEMS.slice(5).length} />
              </tr>
              {/* 家財：リードから引き継いだぶんを数量1以上だけ表示 */}
              {(() => {
                const list = Array.isArray(item.kazai) ? item.kazai.filter(k => Number(k.qty) > 0) : []
                if (!list.length && !item.boxCount) return null
                return (
                  <tr>
                    <td style={flab}>家財</td>
                    <td style={fcell} colSpan={5}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6 }}>
                        {list.map((k, i) => (
                          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: '#EFF6FF', color: '#1D4ED8', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>
                            {k.name}×{k.qty}
                          </span>
                        ))}
                        {item.boxCount && <span style={{ fontSize: 11, color: '#64748B' }}>ダンボール {item.boxCount} 箱</span>}
                      </div>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>

          {/* ── 手配状況 ── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, ...fband('#7BC47F') }}>
            <tbody>
              <tr><td style={{ ...flab, background: '#EAF7EB' }} colSpan={4}>手配状況</td></tr>
              <tr>
                <td style={flab}>エアコン</td>
                <td style={fcell}><Cell edit={edit} value={v('aircon') || '必要なし'} onChange={x => setField('aircon', x)} options={AIRCON_OPTS} /></td>
                <td style={flab}>段ボール</td>
                <td style={fcell}><Cell edit={edit} value={v('cardboard') || '必要なし'} onChange={x => setField('cardboard', x)} options={CARDBOARD_OPTS} /></td>
              </tr>
              <tr>
                <td style={flab}>タイムツリー</td>
                <td style={fcell} colSpan={3}>
                  <div style={{ padding: '6px 8px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!v('timetree')} onChange={() => setField('timetree', !v('timetree'))}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0E8A7A' }} />
                    </label>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 対応・メモ（リード詳細と同じ形）── */}
        <div style={sectionBar}>対応・メモ</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Row label="ステータス" edit={false} value={statusSelectEl} wide />
          <div style={{ display: 'flex', fontSize: 13 }}>
            <div style={{ width: 110, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>メモ</div>
            <div style={{ flex: 1, padding: 8 }}>
              {edit ? (
                <textarea value={v('memo') || ''} onChange={e => setField('memo', e.target.value)}
                  placeholder="備考など" rows={3} style={{ ...inp, resize: 'vertical', minHeight: 60 }} />
              ) : (
                <div style={{ color: '#1E293B', fontWeight: 600, padding: '4px 2px', whiteSpace: 'pre-wrap' }}>{v('memo') || '—'}</div>
              )}
            </div>
          </div>
        </div>

        {/* 保存バー */}
        <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #EEF2F7', padding: '10px 14px', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 11, color: '#C2410C', marginRight: 'auto' }}>未保存の変更があります</span>}
          <button className="btn btn-outline btn-sm" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={(!isNew && !dirty) || saving || !v('name')} style={{ opacity: ((!isNew && !dirty) || !v('name')) ? .55 : 1 }}>
            {saving ? '保存中…' : isNew ? '追加する' : '変更を保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
