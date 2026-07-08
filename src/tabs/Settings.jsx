import { useState, useEffect, useRef } from 'react'
import { DEFAULT_STAFF } from '../lib/staff'
import { DEFAULT_FLEET, TRUCK_CLASSES, DEFAULT_CREW } from '../lib/fleet'

// 担当者設定：名前を入力→登録。成約管理・成約登録の担当者プルダウンに反映される。
function StaffSettings({ isDemo }) {
  const [list, setList]   = useState(DEFAULT_STAFF)
  const [name, setName]   = useState('')
  const [loading, setLoading] = useState(!isDemo)
  const [busy, setBusy]   = useState(false)
  const [msg, setMsg]     = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2000) }

  useEffect(() => {
    if (isDemo) { setList(DEFAULT_STAFF); setLoading(false); return }
    fetch('/api/staff')
      .then(r => r.json())
      .then(d => setList(Array.isArray(d.items) && d.items.length ? d.items : DEFAULT_STAFF))
      .catch(() => setList(DEFAULT_STAFF))
      .finally(() => setLoading(false))
  }, [isDemo])

  const add = async () => {
    const n = name.trim()
    if (!n) return
    if (list.includes(n)) { flash('すでに登録済みです'); return }
    if (isDemo) { setList(p => [...p, n]); setName(''); flash('追加しました（デモ：保存なし）'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })
      const d = await r.json()
      if (d.items) setList(d.items)
      setName(''); flash('追加しました')
    } catch { flash('追加に失敗しました') }
    setBusy(false)
  }

  const remove = async (n) => {
    if (isDemo) { setList(p => p.filter(s => s !== n)); return }
    setBusy(true)
    try {
      const r = await fetch('/api/staff', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n }) })
      const d = await r.json()
      if (d.items) setList(d.items)
    } catch { flash('削除に失敗しました') }
    setBusy(false)
  }

  return (
    <div className="card">
      <div className="card-head"><h3>👥 担当者設定</h3>{msg && <span className="c-sub" style={{ color: '#15803D' }}>{msg}</span>}</div>
      <div className="card-body">
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>
          名前を入力して「登録」すると、成約管理・成約登録の担当者プルダウンに表示されます。
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例：古賀"
            style={{ flex: 1, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
          <button className="btn btn-primary" onClick={add} disabled={busy || !name.trim()} style={{ opacity: !name.trim() ? .5 : 1, whiteSpace: 'nowrap' }}>登録</button>
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: '#94A3B8' }}>読み込み中...</div>
        ) : list.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94A3B8' }}>担当者が登録されていません。</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {list.map(s => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F1F5FB', borderRadius: 20, padding: '5px 6px 5px 12px', fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
                {s}
                <button onClick={() => remove(s)} disabled={busy} title="削除"
                  style={{ border: 'none', background: '#fff', color: '#DC2626', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', lineHeight: 1, fontSize: 13, fontWeight: 700 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 発信テスト：番号を入れて押すと /api/call が顧客に発信→自動音声→事務所へ転送
function CallTest() {
  const [phone, setPhone]     = useState('')
  const [ready, setReady]     = useState(null)   // null=確認中, true/false
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)   // { ok, msg }

  useEffect(() => {
    fetch('/api/call')
      .then(r => r.json())
      .then(d => setReady(!!d.ready))
      .catch(() => setReady(false))
  }, [])

  const placeTest = async () => {
    if (!phone) return
    setLoading(true); setResult(null)
    try {
      const r = await fetch('/api/call', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const d = await r.json()
      if (d.ok) setResult({ ok: true, msg: `発信しました（SID: ${d.sid || '-'} / 状態: ${d.status || '-'}）` })
      else setResult({ ok: false, msg: '失敗: ' + (d.error || `HTTP ${r.status}`) })
    } catch (e) {
      setResult({ ok: false, msg: '通信エラー: ' + (e && e.message ? e.message : String(e)) })
    }
    setLoading(false)
  }

  return (
    <div style={{ borderTop: '1px solid #E2E8F0', marginTop: 6, paddingTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>発信テスト</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          background: ready === null ? '#F1F5FB' : ready ? '#F0FDF4' : '#FEF2F2',
          color: ready === null ? '#64748B' : ready ? '#15803D' : '#B91C1C',
        }}>
          {ready === null ? '確認中…' : ready ? 'Twilio設定OK' : 'Twilio未設定'}
        </span>
      </div>
      <div style={{ fontSize: 10, color: '#64748B', marginBottom: 8 }}>
        入力した番号に発信し、応答後に自動音声→事務所へ転送します。まず自分の携帯で試してください。
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="090-1234-5678"
          style={{ flex: 1, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <button className="btn btn-primary" onClick={placeTest} disabled={loading || !phone || ready === false} style={{ opacity: (!phone || ready === false) ? .5 : 1, whiteSpace: 'nowrap' }}>
          {loading ? '発信中…' : 'テスト発信'}
        </button>
      </div>
      {ready === false && (
        <div style={{ fontSize: 10, color: '#B91C1C', marginTop: 6 }}>
          Vercelに TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM / OFFICE_PHONE を設定してください。
        </div>
      )}
      {result && (
        <div style={{ fontSize: 11, marginTop: 8, color: result.ok ? '#15803D' : '#B91C1C', wordBreak: 'break-all' }}>
          {result.ok ? '✓ ' : '✕ '}{result.msg}
        </div>
      )}
    </div>
  )
}

// 通知メッセージ送信：受信者はCRMを見られない前提なので、Windows通知の見た目を
// ライブプレビューで確認してから送信できる。/api/broadcast に保存され、子拡張・
// CRM(LeadNotifier)が ?recent 経由で拾って通知する。
function BroadcastSender({ isDemo }) {
  const ip = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }
  const lb = { fontSize: 11, fontWeight: 700, color: '#64748B', margin: '10px 0 4px', display: 'block' }
  const [title, setTitle] = useState('')
  const [body, setBody]   = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg]     = useState('')
  const [items, setItems] = useState([])
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  const load = async () => {
    if (isDemo) return
    try { const d = await fetch('/api/broadcast').then(r => r.json()); setItems(d.items || []) } catch { /* 無視 */ }
  }
  useEffect(() => { load() }, [isDemo])

  const send = async () => {
    const b = body.trim()
    if (!b) { flash('メッセージを入力してください'); return }
    if (isDemo) { flash('デモ：送信は無効です'); return }
    setSending(true)
    try {
      const r = await fetch('/api/broadcast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim(), body: b }) })
      const d = await r.json()
      if (d.ok) { setTitle(''); setBody(''); flash('✓ 送信しました（約12秒以内に通知）'); load() }
      else flash('送信失敗: ' + (d.error || `HTTP ${r.status}`))
    } catch (e) { flash('通信エラー: ' + (e && e.message ? e.message : String(e))) }
    setSending(false)
  }
  const remove = async (id) => { if (isDemo) return; try { await fetch('/api/broadcast', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }) } catch {} ; load() }
  const clearAll = async () => { if (!confirm('送信したメッセージを全消去しますか？（混ぜ込み分のみ・実リードは消えません）')) return; if (isDemo) return; try { await fetch('/api/broadcast', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }) } catch {} ; load() }

  // 実際の通知と同じ組み立て（子拡張・LeadNotifier と一致）
  const prevTitle = `🆕 新規リード（${title.trim() || 'お知らせ'}）`
  const prevBody  = '📢 ' + (body.trim() || '（ここに本文が入ります）')

  return (
    <div className="card">
      <div className="card-head"><h3>📢 通知メッセージ送信</h3>{msg && <span className="c-sub" style={{ color: '#15803D' }}>{msg}</span>}</div>
      <div className="card-body">
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>
          受信者がCRMを見られなくても、<b>Windows通知でこの内容が届きます</b>。下のプレビューで見た目を確認してから送信してください。
        </div>
        <label style={lb}>見出し（任意）</label>
        <input style={ip} value={title} onChange={e => setTitle(e.target.value)} placeholder="例：緊急 / 連絡" />
        <label style={lb}>メッセージ *</label>
        <textarea style={{ ...ip, resize: 'vertical', minHeight: 60 }} value={body} onChange={e => setBody(e.target.value)} placeholder="通知したい内容を入力" />

        {/* ライブプレビュー（実際の通知の見え方） */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', margin: '12px 0 6px' }}>通知プレビュー（実際の見え方）</div>
        <div style={{ display: 'flex', gap: 10, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 14px rgba(0,0,0,.06)' }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🆕</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{prevTitle}</div>
            <div style={{ fontSize: 12, color: '#334155', whiteSpace: 'pre-line', lineHeight: 1.5, wordBreak: 'break-word' }}>{prevBody}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6 }}>
          ※タイトルの「🆕 新規リード」は通知拡張(子)を更新できないため固定です。見出しはカッコ内、本文は📢付きで届きます。
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, opacity: (!body.trim() || isDemo) ? .5 : 1 }} onClick={send} disabled={sending || !body.trim() || isDemo}>
          {sending ? '送信中…' : 'この内容で送信'}
        </button>

        {items.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>送信済みメッセージ（混ぜ込み分）</span>
              <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={clearAll}>全消去</button>
            </div>
            {items.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #EEF2F7', fontSize: 12 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(m.title ? `[${m.title}] ` : '') + m.body}>{(m.title ? `[${m.title}] ` : '') + m.body}</span>
                <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => remove(m.id)}>削除</button>
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6 }}>※ 消せるのは送信メッセージ（混ぜ込み分）だけ。実リードには影響しません。</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Toggle({ defaultChecked }) {
  const [on, setOn] = useState(defaultChecked ?? false)
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={e => setOn(e.target.checked)} />
      <div className="ttrack" />
      <div className="tthumb" />
    </label>
  )
}

function SettingRow({ label, desc, children }) {
  return (
    <div className="setting-row">
      <div><div className="sr-label">{label}</div>{desc && <div className="sr-desc">{desc}</div>}</div>
      {children}
    </div>
  )
}

// Googleマップ設定：APIキーを localStorage(tf_gmaps_key) に保存し、配車ルートマップを実地図に切り替える。
// キーはクライアント側で使うもの（元々ブラウザに露出）。Google側でHTTPリファラー制限して保護する前提。
function GmapKeySettings() {
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { try { setSaved(localStorage.getItem('tf_gmaps_key') || '') } catch {} }, [])
  const mask = (k) => k ? (k.length > 8 ? k.slice(0, 4) + '••••' + k.slice(-4) : '設定済み') : ''
  const save = () => {
    const k = key.trim()
    if (!k) { setMsg('キーを入力してください'); return }
    try { localStorage.setItem('tf_gmaps_key', k) } catch {}
    setMsg('保存しました。反映のため再読み込みします…')
    setTimeout(() => { try { location.reload() } catch {} }, 900)
  }
  const clear = () => {
    try { localStorage.removeItem('tf_gmaps_key') } catch {}
    setMsg('解除しました。概略図に戻します…')
    setTimeout(() => { try { location.reload() } catch {} }, 900)
  }
  return (
    <div className="card">
      <div className="card-head"><h3>🗺 Googleマップ設定</h3>{msg && <span className="c-sub" style={{ color: '#15803D' }}>{msg}</span>}</div>
      <div className="card-body">
        <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 8, lineHeight: 1.6 }}>
          配車ルートマップを<b>実際のGoogleマップ＋実道路ルート</b>に切り替えます。未設定時は概略図で動作します。
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
          現在の状態：{saved ? <b style={{ color: '#15803D' }}>設定済み（{mask(saved)}）</b> : '未設定（概略図）'}
        </div>
        <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Google Maps APIキーを貼り付け"
          style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', marginBottom: 8, boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={save}>保存して反映</button>
          {saved && <button className="btn btn-outline btn-sm" onClick={clear}>解除（概略図に戻す）</button>}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.6 }}>
          ※ 必要API：Maps JavaScript API ／ Directions API（単一地点は Geocoding API）。<br />
          ※ セキュリティ：Google側でキーを「HTTPリファラー」制限してください。<br />
          ※ この設定は<b>このブラウザのみ</b>有効です。全端末に反映するには Vercel環境変数 <code>VITE_GOOGLE_MAPS_KEY</code> を設定して再デプロイしてください。
        </div>
      </div>
    </div>
  )
}

// トラック（車両）設定：号車・クラス・人数を登録。配車ボードのフリート(/api/dispatch の _fleet)に反映。
// 乗務員(班)はここでは登録しない（「乗務員設定」で登録し、配車ボードでラベル選択）。
function TruckSettings({ isDemo }) {
  const [list, setList] = useState(DEFAULT_FLEET)
  const [loading, setLoading] = useState(!isDemo)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const nextKey = useRef(1)
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2200) }

  useEffect(() => {
    if (isDemo) { setList(DEFAULT_FLEET); setLoading(false); return }
    fetch('/api/dispatch')
      .then(r => r.json())
      .then(d => { const f = d && d.data && d.data._fleet; setList(Array.isArray(f) && f.length ? f : DEFAULT_FLEET) })
      .catch(() => setList(DEFAULT_FLEET))
      .finally(() => setLoading(false))
  }, [isDemo])

  const setField = (key, field, val) => setList(prev => prev.map(v => v.key === key ? { ...v, [field]: field === 'n' ? (parseInt(val, 10) || 0) : val } : v))
  const addRow = () => setList(prev => [...prev, { key: 'v_new' + (nextKey.current++) + '_' + prev.length, id: '', cls: '2t', crew: '', n: 2 }]) // crewは配車ボードで割当
  const removeRow = (key) => setList(prev => prev.filter(v => v.key !== key))

  const save = async () => {
    // 号車が空の行は落とす（外注枠は除く）
    const cleaned = list.filter(v => String(v.id || '').trim() || v.ext).map(v => ({ ...v, id: String(v.id || '').trim() }))
    setList(cleaned)
    if (isDemo) { flash('保存しました（デモ：保存なし）'); return }
    setBusy(true)
    try {
      await fetch('/api/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fleet: cleaned }) })
      flash('保存しました（配車ボードに反映されます）')
    } catch { flash('保存に失敗しました') }
    setBusy(false)
  }

  const ip = { width: '100%', padding: '7px 9px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#fff', color: '#1E293B', boxSizing: 'border-box' }
  const th = { fontSize: 10, fontWeight: 700, color: '#64748B', textAlign: 'left', padding: '0 6px 6px' }

  return (
    <div className="card">
      <div className="card-head"><h3>🚚 トラック設定</h3>{msg && <span className="c-sub" style={{ color: '#15803D' }}>{msg}</span>}</div>
      <div className="card-body">
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10, lineHeight: 1.6 }}>
          自社トラック（号車・クラス）を登録します。<b>配車ボード</b>の車両行として使われます。
          乗務員は<b>「乗務員設定」</b>で登録し、配車ボードで各車両にラベル割り当てします。
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: '#94A3B8' }}>読み込み中...</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 110 }}>号車</th>
                  <th style={th}>クラス</th>
                  <th style={{ ...th, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {list.map(v => (
                  <tr key={v.key}>
                    <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9' }}><input style={ip} value={v.id} onChange={e => setField(v.key, 'id', e.target.value)} placeholder="831" /></td>
                    <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9' }}>
                      <select style={ip} value={v.cls} onChange={e => setField(v.key, 'cls', e.target.value)}>
                        {TRUCK_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: 4, borderBottom: '1px solid #F1F5F9', textAlign: 'center' }}>
                      <button title="削除" onClick={() => removeRow(v.key)}
                        style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 7, width: 26, height: 26, cursor: 'pointer', fontSize: 13 }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'space-between' }}>
              <button className="btn btn-outline btn-sm" onClick={addRow}>＋ トラックを追加</button>
              <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存する'}</button>
            </div>
            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 8, lineHeight: 1.5 }}>※ 号車が空の行は保存時に除外されます。{isDemo ? 'デモアカウントでは保存されません。' : '保存すると配車ボードの車両に反映されます。'}</div>
          </>
        )}
      </div>
    </div>
  )
}

// 乗務員(班)設定：ラベルを登録。配車ボードで各車両にドロップダウン割り当てする。
// 一覧は /api/dispatch の _crew に保存（フリートと同じ設定領域）。
function CrewSettings({ isDemo }) {
  const [list, setList] = useState(DEFAULT_CREW)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(!isDemo)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2000) }

  useEffect(() => {
    if (isDemo) { setList(DEFAULT_CREW); setLoading(false); return }
    fetch('/api/dispatch')
      .then(r => r.json())
      .then(d => { const c = d && d.data && d.data._crew; setList(Array.isArray(c) && c.length ? c : DEFAULT_CREW) })
      .catch(() => setList(DEFAULT_CREW))
      .finally(() => setLoading(false))
  }, [isDemo])

  const persist = async (next) => {
    setList(next)
    if (isDemo) { flash('保存しました（デモ：保存なし）'); return }
    setBusy(true)
    try {
      await fetch('/api/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ crew: next }) })
      flash('保存しました（配車ボードに反映されます）')
    } catch { flash('保存に失敗しました') }
    setBusy(false)
  }
  const add = () => { const n = name.trim(); if (!n) return; if (list.includes(n)) { flash('すでに登録済みです'); return } persist([...list, n]); setName('') }
  const remove = (n) => persist(list.filter(x => x !== n))

  return (
    <div className="card">
      <div className="card-head"><h3>👷 乗務員設定</h3>{msg && <span className="c-sub" style={{ color: '#15803D' }}>{msg}</span>}</div>
      <div className="card-body">
        <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10, lineHeight: 1.6 }}>
          乗務員（班）を登録します。<b>配車ボード</b>の各車両にラベルとして割り当てできます（例：「田中 / 佐藤」「高橋班」）。
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="例：田中 / 佐藤、高橋班"
            style={{ flex: 1, padding: '8px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          <button className="btn btn-primary" onClick={add} disabled={busy || !name.trim()} style={{ opacity: !name.trim() ? .5 : 1, whiteSpace: 'nowrap' }}>登録</button>
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: '#94A3B8' }}>読み込み中...</div>
        ) : list.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94A3B8' }}>乗務員が登録されていません。</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {list.map(s => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#F1F5FB', borderRadius: 20, padding: '5px 6px 5px 12px', fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
                {s}
                <button onClick={() => remove(s)} disabled={busy} title="削除"
                  style={{ border: 'none', background: '#fff', color: '#DC2626', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', lineHeight: 1, fontSize: 13, fontWeight: 700 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Settings({ user }) {
  const isDemo = user?.mode === 'demo'
  return (
    <div>
      <div className="page-hdr"><h1>設定</h1><p>システムの各種設定を管理します</p></div>

      <div className="two-col">
        <div>
          <BroadcastSender isDemo={isDemo} />

          <StaffSettings isDemo={isDemo} />

          <div className="card">
            <div className="card-head"><h3>📞 架電設定（Twilio）</h3></div>
            <div className="card-body">
              <SettingRow label="自動架電" desc="新規顧客検知で自動発信"><Toggle defaultChecked /></SettingRow>
              <SettingRow label="LINE通知も送信" desc="LINE Notifyで同時アラート"><Toggle defaultChecked /></SettingRow>
              <SettingRow label="架電間隔">
                <select className="setting-input"><option>30秒</option><option>1分</option><option>3分</option></select>
              </SettingRow>
              <SettingRow label="架電時間帯">
                <select className="setting-input"><option>9:00〜18:00</option><option>8:00〜20:00</option><option>常時</option></select>
              </SettingRow>
              <CallTest />
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>🔍 監視サイト</h3></div>
            <div className="card-body">
              <SettingRow label="ズバット"  desc="リロード間隔: 30秒"><Toggle defaultChecked /></SettingRow>
              <SettingRow label="引越し侍" desc="リロード間隔: 30秒"><Toggle defaultChecked /></SettingRow>
              <SettingRow label="価格.com" desc="リロード間隔: 45秒"><Toggle defaultChecked /></SettingRow>
              <SettingRow label="SUUMO"    desc="リロード間隔: 60秒"><Toggle /></SettingRow>
            </div>
          </div>
        </div>

        <div>
          <TruckSettings isDemo={isDemo} />

          <CrewSettings isDemo={isDemo} />

          <GmapKeySettings />

          <div className="card">
            <div className="card-head"><h3>🏢 会社情報</h3></div>
            <div className="card-body">
              <SettingRow label="会社名"><input className="setting-input" defaultValue="トランスポート福岡" /></SettingRow>
              <SettingRow label="代表電話番号"><input className="setting-input" defaultValue="092-XXX-XXXX" /></SettingRow>
              <SettingRow label="メール通知先"><input className="setting-input" defaultValue="info@transport.jp" /></SettingRow>
              <div style={{ marginTop:14, textAlign:'right' }}><button className="btn btn-primary">保存する</button></div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>📊 CSVインポート</h3></div>
            <div className="card-body">
              {[
                { label:'ズバット',  badge:'bo' },
                { label:'引越し侍', badge:'bb' },
                { label:'価格.com', badge:'bg' },
                { label:'SUUMO',    badge:'bk' },
              ].map(s => (
                <div key={s.label} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span className={`badge ${s.badge}`} style={{ minWidth:72, justifyContent:'center' }}>{s.label}</span>
                  <span style={{ fontSize:11, color:'#16A34A' }}>✓ 対応済み</span>
                  <button className="btn btn-outline btn-sm" style={{ marginLeft:'auto' }}>インポート</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
