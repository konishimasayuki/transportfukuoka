export default function Sales({ user }) {
  const isDemo = user?.mode === 'demo'

  if (!isDemo) {
    return (
      <div>
        <div className="page-hdr"><h1>売上管理</h1><p>売上・経費データを管理します</p></div>
        <div className="kpi-row kpi-3">
          <div className="kpi-card c-blue"><div className="kpi-label">今月の売上合計</div><div className="kpi-val">¥0</div></div>
          <div className="kpi-card c-green"><div className="kpi-label">一括査定手数料合計</div><div className="kpi-val">¥0</div></div>
          <div className="kpi-card c-orange"><div className="kpi-label">粗利益</div><div className="kpi-val">¥0</div></div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign:'center', padding:'48px 0', color:'#94A3B8' }}>
            <div style={{ fontSize:36, marginBottom:8 }}>💴</div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>売上データがありません</div>
            <div style={{ fontSize:11 }}>成約管理から案件を追加すると自動で集計されます</div>
          </div>
        </div>
      </div>
    )
  }

  // デモデータ
  return (
    <div>
      <div className="page-hdr"><h1>売上管理</h1><p>月別・サイト別の売上を管理します（デモデータ）</p></div>
      <div className="kpi-row kpi-3">
        <div className="kpi-card c-blue"><div className="kpi-label">今月の売上合計</div><div className="kpi-val">¥1,248,000</div><div className="kpi-change up">▲ 前月比 +18.4%</div></div>
        <div className="kpi-card c-green"><div className="kpi-label">一括査定手数料合計</div><div className="kpi-val">¥34,200</div><div className="kpi-change">67件 × 平均510円</div></div>
        <div className="kpi-card c-orange"><div className="kpi-label">粗利益</div><div className="kpi-val">¥871,000</div><div className="kpi-change up">▲ 利益率 69.8%</div></div>
      </div>
      <div className="two-col">
        <div className="card">
          <div className="card-head"><h3>サイト別 売上内訳</h3><span className="c-sub">今月</span></div>
          <div className="card-body scroll-x">
            <table>
              <thead><tr><th>サイト名</th><th>成約</th><th>売上</th><th>手数料</th><th>純利益</th></tr></thead>
              <tbody>
                <tr><td><span className="badge bb">引越し侍</span></td><td>9件</td><td>¥487,000</td><td>¥9,200</td><td>¥477,800</td></tr>
                <tr><td><span className="badge bg">価格.com</span></td><td>5件</td><td>¥263,000</td><td>¥5,100</td><td>¥257,900</td></tr>
                <tr><td><span className="badge bp">比較ナビ</span></td><td>4件</td><td>¥218,000</td><td>¥4,000</td><td>¥214,000</td></tr>
                <tr><td><span className="badge bo">自社HP</span></td><td>4件</td><td>¥196,000</td><td>¥0</td><td>¥196,000</td></tr>
                <tr><td><span className="badge bk">紹介</span></td><td>2件</td><td>¥84,000</td><td>¥0</td><td>¥84,000</td></tr>
                <tr style={{ fontWeight:700 }}><td>合計</td><td>24件</td><td>¥1,248,000</td><td>¥18,300</td><td>¥1,229,700</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>経費内訳</h3><span className="c-sub">¥342,800</span></div>
          <div className="card-body">
            {[
              { label:'⛽ ガソリン代', amount:'¥98,400',  pct:72, color:'#1E5FA8' },
              { label:'🛣 高速代',     amount:'¥67,200',  pct:49, color:'#16A34A' },
              { label:'📦 段ボール代', amount:'¥44,600',  pct:33, color:'#EA580C' },
              { label:'👷 厚生費',     amount:'¥112,400', pct:82, color:'#7C3AED' },
              { label:'📱 Twilio等',   amount:'¥3,800',   pct:3,  color:'#DC2626' },
            ].map(e => (
              <div key={e.label} style={{ fontSize:12, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}><span>{e.label}</span><b>{e.amount}</b></div>
                <div style={{ background:'#F1F5FB', height:6, borderRadius:3 }}>
                  <div style={{ background:e.color, height:6, borderRadius:3, width:`${e.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>売上明細</h3>
          <div style={{ display:'flex', gap:6 }}>
            <select style={{ padding:'5px 8px', border:'1px solid #E2E8F0', borderRadius:6, fontSize:11, fontFamily:'inherit' }}>
              <option>2025年6月</option><option>2025年5月</option>
            </select>
            <button className="btn btn-outline btn-sm">CSV出力</button>
          </div>
        </div>
        <div className="card-body scroll-x" style={{ padding:'0 16px' }}>
          <table>
            <thead><tr><th>日付</th><th>顧客名</th><th>区間</th><th>流入元</th><th>金額</th><th>回収</th></tr></thead>
            <tbody>
              <tr><td>6/3</td><td>田中 誠一</td><td>東区→博多区</td><td><span className="badge bb">引越し侍</span></td><td>¥68,000</td><td><span className="badge bg">回収済</span></td></tr>
              <tr><td>6/5</td><td>林 真由美</td><td>早良区→中央区</td><td><span className="badge bg">価格.com</span></td><td>¥52,000</td><td><span className="badge bg">回収済</span></td></tr>
              <tr><td>6/8</td><td>木村 大輔</td><td>春日市→博多区</td><td><span className="badge bp">比較ナビ</span></td><td>¥74,000</td><td><span className="badge bg">回収済</span></td></tr>
              <tr><td>6/12</td><td>伊藤 翔太</td><td>東区→糸島市</td><td><span className="badge bb">引越し侍</span></td><td>¥92,000</td><td><span className="badge by">未回収</span></td></tr>
              <tr><td>6/15</td><td>渡辺 美紀</td><td>博多区→北九州</td><td><span className="badge bg">価格.com</span></td><td>¥118,000</td><td><span className="badge bg">回収済</span></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
