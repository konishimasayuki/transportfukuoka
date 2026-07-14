// 成約詳細モーダル（成約管理／配車ボードで共用）
// リード詳細モーダル(LeadDetailModal)と同じレイアウト（ヘッダー＋セクション区切り＋編集トグル）に統一。
// onSave(patch)：保存時に呼ばれる。呼び出し元が /api/contracts への POST/PUT を担当する。
import { useEffect, useState } from 'react'
import { fetchStaffList, DEFAULT_STAFF } from '../lib/staff'

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
  staff: '', memo: '',
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const box     = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }
const sectionBar = {
  background: '#F8FAFC', color: '#1E293B', fontSize: 12, fontWeight: 800,
  padding: '8px 14px', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0',
  borderLeft: '4px solid #1E5FA8', letterSpacing: '.04em',
}
const inp = { padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', width: '100%' }

// 編集／閲覧共通のフィールド行（LeadDetailModalと同じ体裁）
function Row({ label, value, edit, onChange, type = 'text', options, placeholder, wide }) {
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
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
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
        <div style={sectionBar}>基本情報</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Row label="フリガナ"   edit={edit} value={v('kana')}     onChange={x => setField('kana', x)} />
          <Row label="顧客名 *"  edit={edit} value={v('name')}     onChange={x => setField('name', x)} placeholder="例：サンプル 太郎" />
          <Row label="電話番号"   edit={edit} value={v('phone')}    onChange={x => setField('phone', x)} placeholder="090-…" />
          <Row label="メールアドレス" edit={edit} value={v('email')} onChange={x => setField('email', x)} type="email" />
          <Row label="流入元"     edit={edit} value={v('srcLabel')} onChange={x => setField('srcLabel', x)} options={SOURCE_LIST} />
          <Row label="引越し人数" edit={edit} value={v('persons')}  onChange={x => setField('persons', x)} placeholder="例：2人" />
          <Row label="希望日"     edit={edit} value={v('moveDateText')} onChange={x => setField('moveDateText', x)} placeholder="例：7月中旬 平日" wide />
        </div>

        {/* 日程 */}
        <div style={sectionBar}>日程</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Row label="引越し日"   edit={edit} value={v('date')}      onChange={x => setField('date', x)} type="date" />
          <Row label="売上登録日" edit={edit} value={v('salesDate')} onChange={x => setField('salesDate', x)} type="date" />
          {!edit && <div style={{ fontSize: 10, color: '#94A3B8', padding: '6px 10px', gridColumn: '1 / -1' }}>※ 引越し日＝配車日（配車ボードに反映されます）</div>}
        </div>

        {/* 住所 */}
        <div style={sectionBar}>住所・区間</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Row label="引越し元"   edit={edit} value={v('fromAddress')} onChange={x => setField('fromAddress', x)} placeholder="福岡市…" wide />
          <Row label="引越し先"   edit={edit} value={v('toAddress')}   onChange={x => setField('toAddress', x)} placeholder="福岡市…" wide />
          <Row label="訪問見積もり日" edit={edit} value={v('visitEstimateDate')} onChange={x => setField('visitEstimateDate', x)} type="date" wide />
          <Row label="区間（表示）" edit={edit} value={v('route')} onChange={x => setField('route', x)} placeholder={routeAuto || '例：東区→博多区'} wide />
        </div>

        {/* 手配状況 */}
        <div style={sectionBar}>手配状況</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Row label="エアコン" edit={edit} value={v('aircon') || '必要なし'} onChange={x => setField('aircon', x)} options={AIRCON_OPTS} />
          <Row label="段ボール" edit={edit} value={v('cardboard') || '必要なし'} onChange={x => setField('cardboard', x)} options={CARDBOARD_OPTS} />
          <div style={{ display: 'flex', fontSize: 13, gridColumn: '1 / -1' }}>
            <div style={{ width: 110, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>タイムツリー</div>
            <div style={{ padding: '8px 10px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: v('timetree') ? '#0E8A7A' : '#94A3B8' }}>
                <input type="checkbox" checked={!!v('timetree')} onChange={() => setField('timetree', !v('timetree'))}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#0E8A7A' }} />
                {v('timetree') ? '登録済' : '未登録'}
              </label>
            </div>
          </div>
        </div>

        {/* 対応・金額・メモ */}
        <div style={sectionBar}>対応・金額・メモ</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Row label="ステータス" edit={false} value={statusSelectEl} wide />
          <Row label="見積金額（円）" edit={edit} value={v('amount')} onChange={x => setField('amount', x)} type="number" placeholder="例：68000" wide />
          <Row label="担当者" edit={edit} value={v('staff')} onChange={x => setField('staff', x)} options={['', ...staffList]} wide />
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
