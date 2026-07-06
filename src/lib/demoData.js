// デモ用の架空データ（DB非依存）。売上管理・広告費・見積書などの「空のタブ」を
// いい感じに見せるための共有データセット。会社名(東部生コン)以外はすべて架空。
// 当月(システム日付の当月)に載るよう、日付は「今年-今月」を使う。

const _now = new Date()
const YM = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}` // 例 '2026-07'
const MM = String(_now.getMonth() + 1).padStart(2, '0')
const dd = (n) => String(n).padStart(2, '0')

// ===== 成約（売上管理・見積書で使用） =====
// 形は Contracts.jsx の DEMO_DATA に合わせつつ、当月の salesDate を持たせて集計に載せる。
export const DEMO_CONTRACTS = [
  { id: 'dc1',  name: '藤田 千夏',  src: 'bb', srcLabel: '引越し侍', route: '東区→博多区',   amount: 82000,  badge: 'bg', status: '成約済み', staff: '松本 亮' },
  { id: 'dc2',  name: '西野 健吾',  src: 'bo', srcLabel: 'ズバット', route: '中央区→西区',   amount: 118000, badge: 'bg', status: '成約済み', staff: '大谷 彩' },
  { id: 'dc3',  name: '岡本 由美',  src: 'bg', srcLabel: '価格.com', route: '南区→春日市',   amount: 46500,  badge: 'bg', status: '成約済み', staff: '松本 亮' },
  { id: 'dc4',  name: '森田 拓海',  src: 'bb', srcLabel: '引越し侍', route: '早良区→糸島市', amount: 63000,  badge: 'bb', status: '交渉中',   staff: '井上 悠' },
  { id: 'dc5',  name: '長谷川 美和', src: 'bp', srcLabel: 'SUUMO',   route: '博多区→大野城市', amount: 155000, badge: 'bg', status: '成約済み', staff: '大谷 彩' },
  { id: 'dc6',  name: '村上 直樹',  src: 'bo', srcLabel: 'ズバット', route: '城南区→中央区', amount: 39000,  badge: 'bo', status: '見積済み', staff: '井上 悠' },
  { id: 'dc7',  name: '近藤 彩香',  src: 'bb', srcLabel: '引越し侍', route: '東区→粕屋町',   amount: 71000,  badge: 'bg', status: '成約済み', staff: '松本 亮' },
  { id: 'dc8',  name: '石川 大輔',  src: 'bg', srcLabel: '価格.com', route: '西区→早良区',   amount: 52000,  badge: 'bp', status: '連絡待ち', staff: '森 香織' },
  { id: 'dc9',  name: '福田 詩織',  src: 'bo', srcLabel: 'ズバット', route: '中央区→南区',   amount: 94000,  badge: 'bg', status: '成約済み', staff: '大谷 彩' },
  { id: 'dc10', name: '青木 隆之',  src: 'bb', srcLabel: '引越し侍', route: '博多区→筑紫野市', amount: 168000, badge: 'bg', status: '成約済み', staff: '井上 悠' },
  { id: 'dc11', name: '前田 奈々',  src: 'bp', srcLabel: 'SUUMO',   route: '春日市→中央区', amount: 58000,  badge: 'bb', status: '交渉中',   staff: '森 香織' },
  { id: 'dc12', name: '横山 健',    src: 'bb', srcLabel: '引越し侍', route: '東区→宗像市',   amount: 61000,  badge: 'br', status: '失注',     staff: '松本 亮' },
  { id: 'dc13', name: '柴田 真由',  src: 'bg', srcLabel: '価格.com', route: '南区→那珂川市', amount: 44000,  badge: 'bg', status: '成約済み', staff: '森 香織' },
  { id: 'dc14', name: '内田 蓮',    src: 'bo', srcLabel: 'ズバット', route: '西区→糸島市',   amount: 132000, badge: 'bg', status: '成約済み', staff: '大谷 彩' },
].map((c, i) => {
  const day = dd(2 + (i * 2) % 26) // 当月の2日〜に散らす
  return { ...c, date: `${YM}-${day}`, salesDate: `${YM}-${day}` }
})

// ===== 広告費(反響課金)算出用のリード（売上管理・広告費で使用） =====
// adCountsByMonthDay が読む最小フィールド：site / count(人数) / receivedAt('MM/DD HH:MM')。
// 当月の各日に数件ずつ散らして、掲載費が自然な額になるようにする。
export const DEMO_LEADS = (() => {
  const rows = [
    { site: '引越し侍', count: '1人' },
    { site: '引越し侍', count: '2人' },
    { site: '引越し侍', count: '3人' },
    { site: 'ズバット', count: '1人' },
    { site: '価格.com', count: '2人' },
    { site: 'ズバット', count: '2人' },
  ]
  // 1〜19日に加え「当日・前日」も必ず含める（広告費タブの“当日のみ”表示が空にならないように）
  const _today = _now.getDate()
  const days = Array.from(new Set([...Array.from({ length: 19 }, (_, i) => i + 1), _today, _today - 1]))
    .filter(d => d >= 1 && d <= 28).sort((a, b) => a - b)
  const out = []
  days.forEach((day, i) => {
    const take = 2 + (i % 3) // 2〜4件/日
    for (let k = 0; k < take; k++) {
      const r = rows[(i + k) % rows.length]
      out.push({
        id: `dl${i}_${k}`,
        site: r.site,
        count: r.count,
        receivedAt: `${MM}/${dd(day)} ${dd(9 + k)}:${dd((i * 7 + k * 13) % 60)}`,
      })
    }
  })
  return out
})()
