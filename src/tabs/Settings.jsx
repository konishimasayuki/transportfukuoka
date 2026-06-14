import { useState } from 'react'

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
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>🔍 監視サイト</h3></div>
            <div className="card-body">
              <SettingRow label="引越し侍" desc="リロード間隔: 30秒"><Toggle defaultChecked /></SettingRow>
              <SettingRow label="価格.com" desc="リロード間隔: 45秒"><Toggle defaultChecked /></SettingRow>
              <SettingRow label="スーモ"   desc="リロード間隔: 60秒"><Toggle /></SettingRow>
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
                { label:'引越し侍', badge:'bb' },
                { label:'価格.com', badge:'bg' },
                { label:'スーモ',   badge:'bk' },
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
