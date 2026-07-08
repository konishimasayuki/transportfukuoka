// デモ用の架空データ（DB非依存）。売上管理・広告費・見積書などの「空のタブ」を
// いい感じに見せるための共有データセット。会社名(東部生コン)以外はすべて架空。
// 当月(システム日付の当月)に載るよう、日付は「今年-今月」を使う。

const _now = new Date()
const YM = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}` // 例 '2026-07'
const MM = String(_now.getMonth() + 1).padStart(2, '0')
const dd = (n) => String(n).padStart(2, '0')

// 成約デモの家財セット（リード家財の語彙。見積書の家財数量に自動変換される）
const _K = (name, qty) => ({ name, qty })
export const DEMO_KAZAI_SETS = [
  [_K('ベッド（シングル）', 1), _K('冷蔵庫（２ドア）', 1), _K('洗濯機（縦型）', 1), _K('本棚（中・小）', 2), _K('電子レンジ', 1), _K('テレビ（40インチ未満）', 1)],
  [_K('ベッド（ダブル）', 1), _K('冷蔵庫（3ドア）', 1), _K('洗濯機（ドラム式）', 1), _K('ソファ（3人掛け）', 1), _K('食器棚（大）', 1), _K('エアコン', 2), _K('ダイニングテーブルセット', 1)],
  [_K('ベッド（セミダブル）', 1), _K('冷蔵庫（２ドア）', 1), _K('洗濯機（縦型）', 1), _K('テレビ（40インチ以上）', 1), _K('こたつ', 1), _K('タンス（大）', 1)],
  [_K('ベッド（シングル）', 2), _K('冷蔵庫（3ドア）', 1), _K('洗濯機（ドラム式）', 1), _K('ソファ（2人掛け）', 1), _K('本棚（大）', 1), _K('ドレッサー', 1), _K('エアコン', 1)],
]

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
  { id: 'dc15', name: '木下 沙羅',  src: 'bb', srcLabel: '引越し侍', route: '東区→古賀市',   amount: 88000,  badge: 'bg', status: '成約済み', staff: '大谷 彩' },
  { id: 'dc16', name: '菅原 澪',    src: 'bo', srcLabel: 'ズバット', route: '早良区→西区',   amount: 73000,  badge: 'bg', status: '成約済み', staff: '井上 悠' },
  { id: 'dc17', name: '浜口 亮太',  src: 'bb', srcLabel: '引越し侍', route: '南区→筑紫野市', amount: 56000,  badge: 'bb', status: '交渉中',   staff: '森 香織' },
  { id: 'dc18', name: '堀江 実咲',  src: 'bg', srcLabel: '価格.com', route: '中央区→城南区', amount: 49000,  badge: 'bg', status: '成約済み', staff: '松本 亮' },
  { id: 'dc19', name: '大西 康平',  src: 'bb', srcLabel: '引越し侍', route: '博多区→糟屋郡', amount: 142000, badge: 'bg', status: '成約済み', staff: '大谷 彩' },
  { id: 'dc20', name: '及川 里穂',  src: 'bp', srcLabel: 'SUUMO',   route: '西区→中央区',   amount: 97000,  badge: 'bg', status: '成約済み', staff: '井上 悠' },
  { id: 'dc21', name: '桑田 隼人',  src: 'bb', srcLabel: '引越し侍', route: '東区→福津市',   amount: 76000,  badge: 'bg', status: '成約済み', staff: '松本 亮' },
  { id: 'dc22', name: '白石 詩',    src: 'bp', srcLabel: 'SUUMO',   route: '博多区→中央区', amount: 134000, badge: 'bg', status: '成約済み', staff: '大谷 彩' },
  { id: 'dc23', name: '谷口 楓',    src: 'bo', srcLabel: 'ズバット', route: '南区→春日市',   amount: 58000,  badge: 'bg', status: '成約済み', staff: '井上 悠' },
  { id: 'dc24', name: '安藤 拓也',  src: 'bb', srcLabel: '引越し侍', route: '西区→糸島市',   amount: 112000, badge: 'bg', status: '成約済み', staff: '森 香織' },
  { id: 'dc25', name: '中川 采', src: 'bg', srcLabel: '価格.com', route: '中央区→南区',   amount: 47000,  badge: 'bb', status: '交渉中',   staff: '松本 亮' },
  { id: 'dc26', name: '樋口 大和',  src: 'bb', srcLabel: '引越し侍', route: '早良区→西区',   amount: 95000,  badge: 'bg', status: '成約済み', staff: '大谷 彩' },
  { id: 'dc27', name: '別府 千歳',  src: 'bo', srcLabel: 'ズバット', route: '城南区→早良区', amount: 68000,  badge: 'bg', status: '成約済み', staff: '井上 悠' },
  { id: 'dc28', name: '荒木 悠真',  src: 'bb', srcLabel: '引越し侍', route: '博多区→大野城市', amount: 158000, badge: 'bg', status: '成約済み', staff: '森 香織' },
  { id: 'dc29', name: '川原 紗希',  src: 'bp', srcLabel: 'SUUMO',   route: '中央区→筑紫野市', amount: 83000,  badge: 'bg', status: '成約済み', staff: '松本 亮' },
  { id: 'dc30', name: '尾崎 圭',    src: 'bg', srcLabel: '価格.com', route: '南区→那珂川市', amount: 51000,  badge: 'bg', status: '成約済み', staff: '大谷 彩' },
  { id: 'dc31', name: '甲斐 陽菜',  src: 'bb', srcLabel: '引越し侍', route: '東区→宗像市',   amount: 124000, badge: 'bg', status: '成約済み', staff: '井上 悠' },
  { id: 'dc32', name: '芝田 康介',  src: 'bo', srcLabel: 'ズバット', route: '西区→中央区',   amount: 89000,  badge: 'bg', status: '成約済み', staff: '森 香織' },
].map((c, i) => {
  const day = dd(2 + (i * 2) % 26) // 売上登録日：当月に散らす（売上集計用）
  const td = _now.getDate()
  const moveDay = dd(Math.min(28, Math.max(1, td + (i % 7) - 3))) // 引越し日(=配車日)：当日±3日（配車ボード用）
  // 家財（成約由来の見積書に反映されるデモ用）
  const kazai = DEMO_KAZAI_SETS[i % DEMO_KAZAI_SETS.length]
  // 架空の携帯番号（見積書の連絡先が空にならないように）
  const phone = `090-${String(1000 + (i * 37) % 9000)}-${String(2000 + (i * 53) % 8000)}`
  return { ...c, date: `${YM}-${moveDay}`, salesDate: `${YM}-${day}`, phone, kazai, boxCount: String(8 + (i % 4) * 4) }
})

// ===== 広告費(反響課金)算出用のリード（売上管理・広告費で使用） =====
// adCountsByMonthDay が読む最小フィールド：site / count(人数) / receivedAt('MM/DD HH:MM')。
// 当月の各日に数件ずつ散らして、掲載費が自然な額になるようにする。
export const DEMO_LEADS = (() => {
  const out = []
  let seq = 0
  // 当月1〜20日に加え「当日・前日」も必ず含める（広告費タブの“当日のみ”表示が空にならないように）
  const _today = _now.getDate()
  const days = Array.from(new Set([...Array.from({ length: 20 }, (_, i) => i + 1), _today, _today - 1]))
    .filter(d => d >= 1 && d <= 28).sort((a, b) => a - b)
  const add = (day, site, count, hour, min) => out.push({
    id: `dl${seq++}`, site, count, receivedAt: `${MM}/${dd(day)} ${dd(hour)}:${dd(min)}`,
  })
  days.forEach((day, di) => {
    // 引越し侍：1日20〜28件（生々しく多数）。人数1=単身(¥715)、2〜4=家族(¥1100)。約45%を家族に。
    const samuraiN = 20 + ((di * 3) % 9)
    for (let i = 0; i < samuraiN; i++) {
      const fam = (i % 20) >= 11
      add(day, '引越し侍', fam ? `${2 + (i % 3)}人` : '1人', 8 + (i % 14), (i * 7) % 60)
    }
    // ズバット：5〜9件／価格.com：3〜6件
    const zN = 5 + ((di * 2) % 5)
    for (let i = 0; i < zN; i++) add(day, 'ズバット', `${1 + (i % 3)}人`, 9 + (i % 12), (i * 11) % 60)
    const kN = 3 + (di % 4)
    for (let i = 0; i < kN; i++) add(day, '価格.com', `${1 + (i % 2)}人`, 10 + (i % 10), (i * 17) % 60)
  })
  return out
})()

// ===== スケジュール(カレンダー)用の見積り・段ボール配達デモ =====
// 引越し予定日はSchedule側で「成約(引越し日)」から表示するため、ここでは
// 見積り・段ボール配達だけを当月に“少量”散りばめる（1日あたり0〜1件）。すべて架空。
export const DEMO_SCHEDULE_EXTRA = (() => {
  const items = []
  const estNames = ['大塚', '三浦', '岡田', '小川', '中島', '藤本', '清水', '橋本', '武田', '東']
  const estTimes = ['10:00', '11:30', '14:00', '16:00']
  const estLoc = ['中央区高砂', '早良区西新', '南区大橋', '東区香椎', '西区姪浜', '博多区博多駅前', '城南区別府']
  const estDays = [2, 4, 7, 11, 14, 17, 20, 23, 26]
  estDays.forEach((day, i) => items.push({
    id: 'des' + i, calendar: '見積り', title: `${estNames[i % estNames.length]}様 見積り訪問`,
    allDay: false, start: `${YM}-${dd(day)}`, startTime: estTimes[i % estTimes.length], end: `${YM}-${dd(day)}`, endTime: '',
    label: 'yellow', location: estLoc[i % estLoc.length], memo: '', attachments: [],
  }))
  const boxNames = ['リー', 'チャン', 'キム', 'グエン', '佐野', '原田', '工藤', '野口']
  const boxTimes = ['09:00', '11:00', '13:30', '15:00']
  const boxDays = [3, 8, 12, 15, 19, 22, 25, 27]
  boxDays.forEach((day, i) => {
    const allDay = i % 2 === 0
    items.push({
      id: 'dbx' + i, calendar: '段ボール配達', title: `${boxNames[i % boxNames.length]}様 段ボール配達`,
      allDay, start: `${YM}-${dd(day)}`, startTime: allDay ? '' : boxTimes[i % boxTimes.length], end: `${YM}-${dd(day)}`, endTime: '',
      label: 'green', location: estLoc[(i + 3) % estLoc.length], memo: '大10 / 小20', attachments: [],
    })
  })
  return items
})()
