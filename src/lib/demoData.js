// デモ用の架空データ（DB非依存）。売上管理・広告費・見積書などの「空のタブ」を
// いい感じに見せるための共有データセット。会社名・氏名・電話などすべて架空（実在しません）。
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
// すべて架空のサンプル。氏名は「サンプル＋名」で実在しないと一目でわかる形にしている。
// 担当者も架空（担当A〜D）。区名（東区→博多区 等）は地理的な位置情報のみで個人情報ではない。
const _DC_GIVEN = ['太郎', '花子', '一郎', '二郎', '三郎', '桜', '陽子', '大和', '美咲', '健太', '楓', '澪', '蓮', '沙羅', '隼人', '詩織']
const _DC_SRC = [
  { src: 'bb', srcLabel: '引越し侍' },
  { src: 'bo', srcLabel: 'ズバット' },
  { src: 'bg', srcLabel: '価格.com' },
  { src: 'bp', srcLabel: 'SUUMO' },
]
const _DC_ROUTES = ['東区→博多区', '中央区→西区', '南区→春日市', '早良区→糸島市', '博多区→大野城市', '城南区→中央区', '東区→粕屋町', '西区→早良区', '中央区→南区', '博多区→筑紫野市', '春日市→中央区', '南区→那珂川市']
const _DC_STAFF = ['担当A', '担当B', '担当C', '担当D']
const _DC_STATUS = ['成約済み', '成約済み', '成約済み', '成約済み', '交渉中', '見積済み', '連絡待ち', '失注']
const _DC_AMOUNT = [82000, 118000, 46500, 63000, 155000, 39000, 71000, 52000, 94000, 168000, 58000, 61000, 44000, 132000, 88000, 73000, 56000, 49000, 142000, 97000, 76000, 134000, 58000, 112000, 47000, 95000, 68000, 158000, 83000, 51000, 124000, 89000]
export const DEMO_CONTRACTS = Array.from({ length: 32 }, (_, i) => {
  const s = _DC_SRC[i % _DC_SRC.length]
  const status = _DC_STATUS[i % _DC_STATUS.length]
  return {
    id: 'dc' + (i + 1),
    name: `サンプル ${_DC_GIVEN[i % _DC_GIVEN.length]}`,
    src: s.src, srcLabel: s.srcLabel,
    route: _DC_ROUTES[i % _DC_ROUTES.length],
    amount: _DC_AMOUNT[i % _DC_AMOUNT.length],
    badge: status === '失注' ? 'br' : 'bg',
    status,
    staff: _DC_STAFF[i % _DC_STAFF.length],
  }
}).map((c, i) => {
  const day = dd(2 + (i * 2) % 26) // 売上登録日：当月に散らす（売上集計用）
  const td = _now.getDate()
  const moveDay = dd(Math.min(28, Math.max(1, td + (i % 7) - 3))) // 引越し日(=配車日)：当日±3日（配車ボード用）
  // 家財（成約由来の見積書に反映されるデモ用）
  const kazai = DEMO_KAZAI_SETS[i % DEMO_KAZAI_SETS.length]
  // 架空の携帯番号（明らかにダミーとわかる 090-0000-XXXX 形式）
  const phone = `090-0000-${String(1000 + i).padStart(4, '0')}`
  return { ...c, date: `${YM}-${moveDay}`, salesDate: `${YM}-${day}`, phone, kazai, boxCount: String(8 + (i % 4) * 4) }
})

// ===== 配車ボードのデモ用：1/1（今年）に架空の成約10件 =====
// すべて架空。住所は「区名＋サンプル/テスト町＋番地」で、地図（概略図）に載るよう区名を含める。
// 配車ボードは date（引越し日＝配車日）が対象日と一致する成約を未手配カードに出すため、日付を YYYY-01-01 に固定。
const _BOARD_DATE = `${_now.getFullYear()}-01-01`
const _BOARD_ROUTES = [
  ['福岡市博多区サンプル町1-2-3', '北九州市小倉北区テスト4-5'],
  ['福岡市東区みほん台2-4', '福岡市南区ダミー1-1'],
  ['福岡市早良区サンプル3-2-1', '福岡市西区テスト5-6'],
  ['福岡市城南区みほん7-8', '春日市ダミー2-3'],
  ['大野城市サンプル9-1', '筑紫野市テスト3-4'],
  ['糸島市みほん2-2', '福岡市早良区ダミー6-7'],
  ['福岡市南区サンプル8-9', '福岡市東区テスト1-2'],
  ['福岡市中央区みほん3-3', '福岡市博多区ダミー4-5'],
  ['福岡市西区サンプル1-1', '糸島市テスト2-2'],
  ['春日市みほん5-5', '大野城市ダミー6-6'],
]
const _BOARD_GIVEN = ['太郎', '花子', '一郎', '二郎', '三郎', '桜', '陽子', '大和', '美咲', '健太']
const _BOARD_AMT = [58000, 82000, 46000, 120000, 63000, 95000, 51000, 138000, 74000, 42000]
const _BOARD_PERSONS = ['2', '3', '1', '4', '2', '3', '1', '4', '2', '1']
const _BOARD_SRC = [
  { src: 'bb', srcLabel: '引越し侍' }, { src: 'bo', srcLabel: 'ズバット' },
  { src: 'bg', srcLabel: '価格.com' }, { src: 'bp', srcLabel: 'SUUMO' },
]
export const DEMO_BOARD_CONTRACTS = _BOARD_ROUTES.map((r, i) => {
  const s = _BOARD_SRC[i % _BOARD_SRC.length]
  return {
    id: 'db' + (i + 1),
    name: `サンプル ${_BOARD_GIVEN[i]}`,
    src: s.src, srcLabel: s.srcLabel,
    route: `${r[0]} → ${r[1]}`,
    persons: _BOARD_PERSONS[i],
    amount: _BOARD_AMT[i],
    badge: 'bg', status: '成約済み',
    date: _BOARD_DATE, salesDate: _BOARD_DATE,   // 配車日＝1/1
    phone: `090-0000-${String(3000 + i).padStart(4, '0')}`,
    kazai: DEMO_KAZAI_SETS[i % DEMO_KAZAI_SETS.length],
    boxCount: String(10 + (i % 4) * 5),
  }
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
  const estNames = ['サンプルA', 'サンプルB', 'サンプルC', 'サンプルD', 'サンプルE', 'サンプルF', 'サンプルG', 'サンプルH', 'サンプルI', 'サンプルJ']
  const estTimes = ['10:00', '11:30', '14:00', '16:00']
  const estLoc = ['中央区高砂', '早良区西新', '南区大橋', '東区香椎', '西区姪浜', '博多区博多駅前', '城南区別府']
  const estDays = [2, 4, 7, 11, 14, 17, 20, 23, 26]
  estDays.forEach((day, i) => items.push({
    id: 'des' + i, calendar: '見積り', title: `${estNames[i % estNames.length]}様 見積り訪問`,
    allDay: false, start: `${YM}-${dd(day)}`, startTime: estTimes[i % estTimes.length], end: `${YM}-${dd(day)}`, endTime: '',
    label: 'yellow', location: estLoc[i % estLoc.length], memo: '', attachments: [],
  }))
  const boxNames = ['サンプルK', 'サンプルL', 'サンプルM', 'サンプルN', 'サンプルO', 'サンプルP', 'サンプルQ', 'サンプルR']
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
