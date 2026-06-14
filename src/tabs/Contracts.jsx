const ROWS = [
  { name:'田中 誠一', src:'bb', srcLabel:'引越し侍', date:'6/15', route:'東区→博多区',  amount:'¥68,000',  badge:'bg', status:'成約済み' },
  { name:'佐藤 健太', src:'bp', srcLabel:'比較ナビ', date:'6/22', route:'北九州→中央区',amount:'¥124,000', badge:'bb', status:'交渉中' },
  { name:'山口 花子', src:'bg', srcLabel:'価格.com', date:'6/18', route:'南区→春日市',  amount:'¥38,500',  badge:'bo', status:'見積済み' },
  { name:'高橋 美咲', src:'bo', srcLabel:'自社HP',   date:'6/20', route:'博多区→東区',  amount:'¥52,000',  badge:'bp', status:'連絡待ち' },
  { name:'中村 龍一', src:'bb', srcLabel:'引越し侍', date:'6/25', route:'糸島市→西区',  amount:'¥45,000',  badge:'bg', status:'成約済み' },
  { name:'小林 恵子', src:'bg', srcLabel:'価格.com', date:'7/2',  route:'中央区→早良区',amount:'¥76,000',  badge:'bb', status:'交渉中' },
  { name:'加藤 浩二', src:'bb', srcLabel:'引越し侍', date:'6/30', route:'東区→粕屋町',  amount:'¥58,000',  badge:'br', status:'失注' },
]

export default function Contracts() {
  return (
    <div>
      <div className="page-hdr"><h1>成約管理</h1><p>成約済み・交渉中・失注の案件を管理します</p></div>

      <div className="kpi-row kpi-4">
        <div className="kpi-card c-green"><div className="kpi-label">今月成約</div><div className="kpi-val">24<span>件</span></div><div className="kpi-change up">▲ +6件</div></div>
        <div className="kpi-card c-blue"><div className="kpi-label">交渉中</div><div className="kpi-val">8<span>件</span></div><div className="kpi-change">見込み ¥380,000</div></div>
        <div className="kpi-card c-orange"><div className="kpi-label">連絡待ち</div><div className="kpi-val">12<span>件</span></div><div className="kpi-change down">要フォロー</div></div>
        <div className="kpi-card c-red"><div className="kpi-label">今月失注</div><div className="kpi-val">11<span>件</span></div><div className="kpi-change">失注率 31%</div></div>
      </div>

      <div className="filter-row">
        <input type="text" placeholder="🔍 顧客名・エリアで検索..." />
        <select><option>全ステータス</option><option>成約済み</option><option>交渉中</option><option>連絡待ち</option><option>失注</option></select>
        <button className="btn btn-primary btn-sm">+ 新規追加</button>
      </div>

      <div className="card">
        <div className="card-body scroll-x" style={{ padding:'0 16px' }}>
          <table>
            <thead>
              <tr><th>顧客名</th><th>流入元</th><th>引越し日</th><th>区間</th><th>見積</th><th>ステータス</th></tr>
            </thead>
            <tbody>
              {ROWS.map(r => (
                <tr key={r.name}>
                  <td><b>{r.name}</b></td>
                  <td><span className={`badge ${r.src}`}>{r.srcLabel}</span></td>
                  <td>{r.date}</td>
                  <td>{r.route}</td>
                  <td>{r.amount}</td>
                  <td><span className={`badge ${r.badge}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
