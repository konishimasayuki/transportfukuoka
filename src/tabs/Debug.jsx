// デバッグタブ（架電テスト用・本番と完全分離）
// 申込フォーム → デバッグ用リード（/api/debug）→ 各リードから 📞架電（/api/call = Twilio発信）
// ここのデータは本番のリード/成約/売上に一切影響しません。自分の携帯番号でテストしてください。
import { useState, useEffect } from 'react'

const STATUS_LIST = ['未架電', '架電済', '留守', 'テスト完了']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', 'テスト完了': 'bg' }

const EMPTY = { name: 'テスト太郎', phone: '', from: '福岡市中央区', to: '福岡市博多区', persons: '2人', moveDate: '来月上旬', memo: 'デバッグ申込' }
const DEFAULT_MSG = 'お電話ありがとうございます。トランスポート福岡です。担当者におつなぎしますので、少々お待ちください。'
const DEFAULT_VM = 'トランスポート福岡です。引越しのお見積りを拝見しました。他社より安くご案内いたします。恐れ入りますが、折り返しご連絡いただけますようお願いいたします。'
// Twilioの通話ステータス → 日本語
const CALL_STATUS_JA = { queued: '発信待ち', initiated: '発信中', ringing: '呼出中', 'in-progress': '通話中', completed: '完了', busy: '話中', 'no-answer': '不在', failed: '失敗', canceled: '取消' }

const ip = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }
const lb = { fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4, display: 'block' }
// 秒数 → 「m分s秒」表記
const fmtDur = (s) => { const n = Number(s); if (!isFinite(n)) return '-'; const m = Math.floor(n / 60), ss = n % 60; return m ? `${m}分${ss}秒` : `${ss}秒` }
// epoch(ms) → HH:MM:SS
const fmtClock = (ms) => (ms ? new Date(ms).toLocaleTimeString('ja-JP', { hour12: false }) : '-')
// 円換算レート（参考表示用）。Twilioの請求はUSD建てのため、円は概算表示。
const JPY_PER_USD = 162.67
const JPY_RATE_NOTE = '¥162.67/$（2026/7/1時点）'
// 留守電判定(MachineDetection=DetectMessageEnd)の追加料金。Twilio回答値: $0.0075/通話。
// Twilioのcall.priceは通話分のみで本アドオンは含まないため、別途加算する。
const AMD_FEE_USD = 0.0075

export default function Debug({ user }) {
  const isDemo = user?.mode === 'demo'
  const [form, setForm] = useState(EMPTY)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(!isDemo)
  const [ready, setReady] = useState(null) // Twilio ready
  const [autoCall, setAutoCall] = useState(false) // 申込と同時に即発信
  const [voiceMsg, setVoiceMsg] = useState('')     // 人が出た時の音声（空＝既定）
  const [vmMsg, setVmMsg] = useState('')           // 留守電/機械が出た時の音声（空＝既定）
  const [callingId, setCallingId] = useState(null)
  const [toast, setToast] = useState('')
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 3000) }
  const f = (k) => (v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!isDemo) fetchItems()
    fetch('/api/call').then(r => r.json()).then(d => setReady(!!d.ready)).catch(() => setReady(false))
  }, [isDemo])

  const fetchItems = async () => {
    setLoading(true)
    try { const d = await fetch('/api/debug').then(r => r.json()); setItems(d.items || []) } catch (e) { console.error(e) }
    setLoading(false)
  }

  const submit = async () => {
    if (!form.phone) { showToast('電話番号を入力してください'); return }
    const lead = { ...form, site: 'デバッグ' }
    if (isDemo) {
      setItems(p => [{ ...lead, id: Date.now().toString(), status: '未架電' }, ...p])
      showToast(autoCall ? '申込しました（デモ：発信は無効）' : '申込しました（デモ：保存なし）')
      return
    }
    try {
      const r = await fetch('/api/debug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
      const d = await r.json()
      await fetchItems()
      if (autoCall && d.item) {
        showToast('申込 → 即発信します')
        await call(d.item) // 申込と同時に発信（本番の自動架電フローをテスト）
      } else {
        showToast('デバッグリードに申込を追加しました')
      }
    } catch (e) { console.error(e); showToast('追加に失敗しました') }
  }

  const call = async (item) => {
    if (isDemo) { showToast('デモモードでは発信できません'); return }
    if (ready === false) { showToast('Twilio未設定のため発信できません（設定タブを確認）'); return }
    if (!item.phone) { showToast('電話番号がありません'); return }
    setCallingId(item.id)
    try {
      const startedAt = Date.now() // 架電開始時刻（経過時間の計測基準）
      const body = { phone: item.phone }
      if (voiceMsg.trim()) body.message = voiceMsg.trim()   // 人が出た時の音声（空＝既定）
      if (vmMsg.trim()) body.voicemail = vmMsg.trim()       // 留守電/機械が出た時の音声（空＝既定）
      const r = await fetch('/api/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.ok) {
        showToast(`発信しました（SID: ${d.sid || '-'}）`)
        const callPatch = { status: '架電済', callSid: d.sid, callStatus: d.status, callStartAt: startedAt, callEndAt: null, elapsedSec: null, callCost: null, callCostComplete: false }
        setItems(p => p.map(i => i.id === item.id ? { ...i, ...callPatch } : i))
        // callSid をRedisに保存（更新・別端末でも「結果確認」できるように）
        if (!isDemo) fetch('/api/debug', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, ...callPatch }) }).catch(() => {})
      } else showToast('発信失敗: ' + (d.error || `HTTP ${r.status}`))
    } catch (e) { showToast('通信エラー: ' + (e && e.message ? e.message : String(e))) }
    setCallingId(null)
  }

  // 通話結果の確認（SID→Twilioの状態を取得）
  const checkResult = async (item) => {
    if (!item.callSid) return
    try {
      const d = await fetch(`/api/call?sid=${encodeURIComponent(item.callSid)}`).then(r => r.json())
      if (d.ok) {
        const ja = CALL_STATUS_JA[d.status] || d.status
        // 経過はTwilioの実通話時刻（開始→終了）から算出。通話終了時点で確定するので
        // 何回「結果確認」しても値は変わらない（＝止まる）。取得できない場合のみ null。
        const cl = d.customerLeg || {}
        const twStart = cl.startTime ? Date.parse(cl.startTime) : null
        const twEnd = cl.endTime ? Date.parse(cl.endTime) : null
        const startAt = (twStart && isFinite(twStart)) ? twStart : (item.callStartAt || null)
        const endedAt = (twEnd && isFinite(twEnd)) ? twEnd : null
        const elapsedSec = (startAt && endedAt) ? Math.round((endedAt - startAt) / 1000) : null
        const dur = d.duration ? `（通話${d.duration}秒）` : ''
        const el = elapsedSec != null ? ` / 経過${fmtDur(elapsedSec)}` : ''
        // Twilioの実請求額（両レッグ合算・確定分）。priceComplete=false は一部未確定。
        const cost = typeof d.totalPrice === 'number' ? d.totalPrice : null
        const costComplete = !!d.priceComplete
        const grand = cost != null ? cost + AMD_FEE_USD : null // 通話料＋留守電判定
        const cs = grand != null && costComplete ? ` / 料金$${grand.toFixed(4)}(約¥${Math.round(grand * JPY_PER_USD)})` : (cost != null ? ' / 料金確定待ち' : '')
        const patch = {
          callSid: item.callSid, callStatus: d.status, callDuration: d.duration,
          callStartAt: startAt, callEndAt: endedAt, elapsedSec,
          callCost: cost, callCostComplete: costComplete, callCostUnit: d.priceUnit || 'USD',
          customerLeg: d.customerLeg || null, officeLegs: d.officeLegs || [],
        }
        setItems(p => p.map(i => i.id === item.id ? { ...i, ...patch } : i))
        if (!isDemo) fetch('/api/debug', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, ...patch }) }).catch(() => {})
        showToast(`通話結果：${ja}${dur}${el}${cs}`)
      } else showToast('結果取得失敗: ' + (d.error || ''))
    } catch (e) { showToast('通信エラー: ' + (e && e.message ? e.message : String(e))) }
  }

  // 診断: Twilioの生データ（price/status）を取得して表示（確定待ちの原因切り分け用）
  const showRaw = async (item) => {
    if (!item.callSid) return
    try {
      const d = await fetch(`/api/call?sid=${encodeURIComponent(item.callSid)}&raw=1`).then(r => r.json())
      if (d.ok) {
        const txt = JSON.stringify(d.raw, null, 2)
        console.log('Twilio raw:', d.raw)
        alert('Twilio 生データ（price/status）:\n\n' + txt)
      } else alert('取得失敗: ' + (d.error || ''))
    } catch (e) { alert('通信エラー: ' + (e && e.message ? e.message : String(e))) }
  }

  const updateStatus = async (item, status) => {
    setItems(p => p.map(i => i.id === item.id ? { ...i, status } : i))
    if (isDemo) return
    try { await fetch('/api/debug', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, status }) }) } catch (e) { console.error(e) }
  }

  const remove = async (item) => {
    setItems(p => p.filter(i => i.id !== item.id))
    if (isDemo) return
    try { await fetch('/api/debug', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) }) } catch (e) { console.error(e) }
  }

  const clearAll = async () => {
    if (!confirm('デバッグリードを全件削除しますか？')) return
    setItems([])
    if (isDemo) return
    try { await fetch('/api/debug', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) }) } catch (e) { console.error(e) }
  }

  return (
    <div>
      <div className="page-hdr"><h1>🧪 デバッグ（架電テスト）</h1><p>本番と完全分離。申込フォーム→デバッグリード→架電で一連の流れをテストします</p></div>

      <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', color: '#92400E', borderRadius: 8, padding: '8px 12px', fontSize: 12, marginBottom: 14 }}>
        ⚠ ここのデータは本番のリード／成約／売上に影響しません。<b>自分の携帯番号</b>で発信テストしてください。
      </div>

      <div className="two-col">
        {/* 申込フォーム */}
        <div className="card">
          <div className="card-head"><h3>📝 デバッグ申込フォーム</h3></div>
          <div className="card-body">
            <div style={{ marginBottom: 12 }}>
              <label style={lb}>電話番号 *（自分の携帯）</label>
              <input style={ip} value={form.phone} onChange={e => f('phone')(e.target.value)} placeholder="090-1234-5678" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={lb}>名前</label><input style={ip} value={form.name} onChange={e => f('name')(e.target.value)} /></div>
              <div><label style={lb}>人数</label><input style={ip} value={form.persons} onChange={e => f('persons')(e.target.value)} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={lb}>引越し元</label><input style={ip} value={form.from} onChange={e => f('from')(e.target.value)} /></div>
              <div><label style={lb}>引越し先</label><input style={ip} value={form.to} onChange={e => f('to')(e.target.value)} /></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lb}>引越し希望日</label><input style={ip} value={form.moveDate} onChange={e => f('moveDate')(e.target.value)} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lb}>メモ</label><input style={ip} value={form.memo} onChange={e => f('memo')(e.target.value)} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: autoCall ? '#B91C1C' : '#334155' }}>
              <input type="checkbox" checked={autoCall} onChange={e => setAutoCall(e.target.checked)} />
              ⚡ 申込と同時に即発信する（本番の自動架電をテスト）
            </label>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={submit}>
              {autoCall ? '申し込む＋即発信' : '申し込む（デバッグリードに追加）'}
            </button>
          </div>
        </div>

        {/* デバッグ架電の状態 */}
        <div className="card">
          <div className="card-head"><h3>📞 デバッグ架電</h3>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: ready === null ? '#F1F5FB' : ready ? '#F0FDF4' : '#FEF2F2',
              color: ready === null ? '#64748B' : ready ? '#15803D' : '#B91C1C' }}>
              {ready === null ? '確認中…' : ready ? 'Twilio設定OK' : 'Twilio未設定'}
            </span>
          </div>
          <div className="card-body">
            <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.7 }}>
              下のリスト各行の <b>📞架電</b> を押すと、その番号に発信します（応答後に自動音声→事務所へ転送）。<br />
              まず<b>自分の携帯</b>で申込→架電し、着信〜転送まで確認してください。
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={lb}>① 人が出た時の音声（テスト用・空欄なら既定）</label>
              <textarea style={{ ...ip, resize: 'vertical', minHeight: 64 }} value={voiceMsg}
                onChange={e => setVoiceMsg(e.target.value)} placeholder={DEFAULT_MSG} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setVoiceMsg(DEFAULT_MSG)}>既定文を入れる</button>
                <button className="btn btn-outline btn-sm" onClick={() => setVoiceMsg('')}>クリア（既定を使用）</button>
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6 }}>
                人が出た時：この音声を再生 → 事務所へ接続（ブリッジ）。本番の CALL_MESSAGE 相当。
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={lb}>② 留守電が出た時の音声（テスト用・空欄なら既定）</label>
              <textarea style={{ ...ip, resize: 'vertical', minHeight: 64 }} value={vmMsg}
                onChange={e => setVmMsg(e.target.value)} placeholder={DEFAULT_VM} />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setVmMsg(DEFAULT_VM)}>既定文を入れる</button>
                <button className="btn btn-outline btn-sm" onClick={() => setVmMsg('')}>クリア（既定を使用）</button>
              </div>
              <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6 }}>
                留守電/機械が出た時：この音声を残して切断（事務所には繋ぎません）。本番の CALL_VOICEMAIL_MESSAGE 相当。
              </div>
            </div>

            {ready === false && (
              <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 10 }}>
                Vercelに TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM / OFFICE_PHONE を設定してください。
              </div>
            )}
          </div>
        </div>
      </div>

      {/* デバッグリード一覧 */}
      <div className="card">
        <div className="card-head"><h3>デバッグリード一覧</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#94A3B8' }}>料金はTwilio実請求(USD) ／ 円換算 {JPY_RATE_NOTE}</span>
            {!isDemo && <button className="btn btn-outline btn-sm" onClick={fetchItems}>⟳ 更新</button>}
            <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={clearAll}>全削除</button>
          </div>
        </div>
        <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#64748B' }}>読み込み中...</div>
          ) : (
            <table>
              <thead><tr><th>名前</th><th>電話</th><th>区間</th><th>人数</th><th>希望日</th><th>ステータス</th><th>通話結果</th><th>操作</th></tr></thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94A3B8', padding: 28 }}>デバッグリードがありません。左のフォームから申し込んでください。</td></tr>
                ) : items.map(item => (
                  <tr key={item.id}>
                    <td><b>{item.name || '（名前なし）'}</b></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{item.phone}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{item.from} → {item.to}</td>
                    <td>{item.persons}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{item.moveDate}</td>
                    <td>
                      <select value={item.status} onChange={e => updateStatus(item, e.target.value)}
                        className={`badge ${STATUS_BADGE[item.status] || 'bk'}`} style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}>
                        {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {item.callSid ? (
                        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                          <div>
                            {CALL_STATUS_JA[item.callStatus] || item.callStatus || '—'}
                            {item.callDuration ? <span style={{ color: '#64748B' }}>（顧客{item.callDuration}秒{item.officeLegs && item.officeLegs.length ? ` / 事務所${item.officeLegs.reduce((s, l) => s + (l.duration || 0), 0)}秒` : ''}）</span> : ''}
                          </div>
                          {item.callCost != null && item.callCostComplete && (
                            <>
                              <div style={{ fontSize: 11, color: '#B45309', fontWeight: 700 }}>
                                料金 ${(item.callCost + AMD_FEE_USD).toFixed(4)}（約¥{Math.round((item.callCost + AMD_FEE_USD) * JPY_PER_USD)}）
                              </div>
                              <div style={{ fontSize: 10, color: '#94A3B8' }}>
                                内訳: 通話${item.callCost.toFixed(4)} ＋ 留守電判定${AMD_FEE_USD}
                              </div>
                            </>
                          )}
                          {item.callCost != null && !item.callCostComplete && (
                            <>
                              <div style={{ fontSize: 10, color: '#94A3B8' }}>
                                料金確定待ち（数分後に再度「結果確認」）
                              </div>
                              <div style={{ fontSize: 10, color: '#94A3B8' }}>
                                顧客: {item.customerLeg && item.customerLeg.price != null ? `$${item.customerLeg.price.toFixed(4)}` : '確定待ち'}
                                {' / '}事務所: {(item.officeLegs && item.officeLegs.length)
                                  ? item.officeLegs.map(l => l.price != null ? `$${l.price.toFixed(4)}` : '確定待ち').join(', ')
                                  : '—'}
                              </div>
                            </>
                          )}
                          {item.elapsedSec != null && (
                            <div style={{ fontSize: 10, color: '#0F766E', fontWeight: 700 }}>
                              経過 {fmtDur(item.elapsedSec)}
                            </div>
                          )}
                          {item.callStartAt && (
                            <div style={{ fontSize: 10, color: '#94A3B8' }}>
                              {fmtClock(item.callStartAt)} → {item.callEndAt ? fmtClock(item.callEndAt) : '（結果確認待ち）'}
                            </div>
                          )}
                        </div>
                      ) : <span style={{ color: '#CBD5E1' }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => call(item)} disabled={callingId === item.id || ready === false || isDemo}>
                          {callingId === item.id ? '発信中…' : '📞架電'}
                        </button>
                        {item.callSid && (
                          <button className="btn btn-outline btn-sm" onClick={() => checkResult(item)}>結果確認</button>
                        )}
                        {item.callSid && (
                          <button className="btn btn-outline btn-sm" onClick={() => showRaw(item)} title="Twilio生データ">🔍</button>
                        )}
                        <button className="btn btn-sm" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }} onClick={() => remove(item)}>削除</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  )
}
