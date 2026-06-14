const ROWS = [
  { name:'田中 誠一', date:'6/15(日)', from:'福岡市東区', to:'博多区',   layout:'2LDK', truck:'2t車', workers:3, badge:'bg', status:'完了',  memo:'エレベーターなし3F' },
  { name:'中村 龍一', date:'6/18(水)', from:'糸島市',     to:'西区',     layout:'1LDK', truck:'軽トラ',workers:2, badge:'bg', status:'完了',  memo:'荷物少なめ' },
  { name:'山口 花子', date:'6/20(金)', from:'南区',       to:'春日市',   layout:'1K',   truck:'軽トラ',workers:2, badge:'bb', status:'予定',  memo:'8:00スタート' },
  { name:'高橋 美咲', date:'6/22(日)', from:'博多区',     to:'東区',     layout:'2DK',  truck:'2t車', workers:3, badge:'bb', status:'予定',  memo:'ピアノあり要確認' },
  { name:'佐藤 健太', date:'6/25(水)', from:'北九州市',   to:'中央区',   layout:'3LDK', truck:'4t車', workers:4, badge:'bo', status:'調整中',memo:'県外長距離' },
  { name:'小林 恵子', date:'7/2(水)',  from:'中央区',     to:'早良区',   layout:'2LDK', truck:'2t車', workers:3, badge:'bo', status:'調整中',memo:'家電多め' },
  { name:'吉田さくら', date:'7/5(土)', from:'南区',       to:'那珂川市', layout:'1K',   truck:'軽トラ',workers:2, badge:'bk', status:'未確定',memo:'—' },
]

export default function Cases() {
  return (
    <div>
      <div className="page-hdr"><h1>案件管理</h1><p>引越し案件の詳細・作業内容を管理します</p></div>

      <div className="kpi-row kpi-3">
        <div className="kpi-card c-blue"><div className="kpi-label">今月の案件総数</div><div className="kpi-val">47<span>件</span></div><div className="kpi-change up">▲ +9件</div></div>
        <div className="kpi-card c-teal"><div className="kpi-label">今週の予定</div><div className="kpi-val">8<span>件</span></div><div className="kpi-change">6/9〜6/15</div></div>
        <div className="kpi-card c-orange"><div className="kpi-label">対応待ち</div><div className="kpi-val">3<span>件</span></div><div className="kpi-change down">要確認</div></div>
      </div>

      <div className="filter-row">
        <input type="text" placeholder="🔍 顧客名・エリアで検索..." />
        <select><option>全ステータス</option><option>作業予定</option><option>完了</option><option>調整中</option></select>
        <button className="btn btn-primary btn-sm">+ 案件追加</button>
      </div>

      <div className="card">
        <div className="card-body scroll-x" style={{ padding:'0 16px' }}>
          <table>
            <thead>
              <tr><th>顧客名</th><th>引越し日</th><th>搬出元</th><th>搬入先</th><th>間取り</th><th>車両</th><th>作業員</th><th>状況</th><th>メモ</th></tr>
            </thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r.name}>
                  <td><b>{r.name}</b></td>
                  <td>{r.date}</td>
                  <td>{r.from}</td>
                  <td>{r.to}</td>
                  <td>{r.layout}</td>
                  <td>{r.truck}</td>
                  <td>{r.workers}名</td>
                  <td><span className={`badge ${r.badge}`}>{r.status}</span></td>
                  <td style={{ color:'#64748B' }}>{r.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
