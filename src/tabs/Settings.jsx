import { useState, useEffect } from 'react'

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

export default function Settings() {
  return (
    <div>
      <div className="page-hdr"><h1>設定</h1><p>システムの各種設定を管理します</p></div>

      <div className="two-col">
        <div>
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
