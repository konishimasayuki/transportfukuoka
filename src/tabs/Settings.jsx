import { useState, useEffect } from 'react'
import { DEFAULT_STAFF } from '../lib/staff'

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
            onKeyDown={e => { if (e.key === 'Enter') add() }}
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
