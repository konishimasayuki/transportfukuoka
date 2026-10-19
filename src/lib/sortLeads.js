// リードの「受付日時」を epoch(ms) に変換する。
// サイトによって表記が異なるため複数フォーマットを解釈する:
//   価格.com : "2026/07/01 19:37:05" / "2026-07-01 19:37"
//   引越し侍 : "07/01 21:43"（年なし → リードの日時から決める。yearlessMs）
//   ズバット : "2026/07/01 19:37" 等
//   日本語   : "2026年7月1日 19:37"
// 解釈できない場合は保存日時(savedAt, ISO) をフォールバックに使う。
const DAY = 86400000
function tsOf(v) { const t = Date.parse(v || ''); return isNaN(t) ? null : t }
function yearlessMs(lead, mo, d, h, mi) {
  const saved = tsOf(lead && lead.savedAt)
  const touched = [saved, tsOf(lead && lead.updatedAt), tsOf(lead && lead.detectedAt)].filter(t => t != null)
  const upper = (touched.length ? Math.max(...touched) : Date.now()) + 2 * DAY
  const lower = saved != null ? saved - 30 * DAY : upper - 365 * DAY // 取得日時が無ければ「上限から1年以内」
  const y = new Date(upper).getFullYear()
  const cands = [y - 1, y, y + 1].map(yy => new Date(yy, mo - 1, d, h, mi).getTime())
  const inRange = cands.find(t => t >= lower && t <= upper)
  if (inRange != null) return inRange
  const past = cands.filter(t => t <= upper)
  return past.length ? past[past.length - 1] : cands[0]
}

export function receivedAtMs(lead) {
  // 基本キャプチャの receivedAt、無ければ詳細の requestedAt を使う
  const s = String((lead && (lead.receivedAt || lead.requestedAt)) || '').trim()
  if (s) {
    // YYYY/MM/DD or YYYY-MM-DD [HH:MM[:SS]]
    let m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime()
    // 年なし MM/DD HH:MM（引越し侍・ズバットの一部）→ 年はリードの日時から決める。
    //   「今年」と決め打ちすると、年が明けた後に12月のリードが今年の12月（未来）扱いになり、
    //   1年たつと去年の同じ月日のリードが今年のものとして数えられてしまう。
    //   ・上限：最後に触った日時（savedAt / updatedAt / detectedAt の最も遅いもの）。受付日時は
    //     再問い合わせで後から更新されることがあり（取得日時より最大100日超あと）、その時も updatedAt は付く。
    //   ・下限：取得日時（savedAt）の30日前。
    //   前年・今年・翌年のうち、この範囲に入る最も古い年を選ぶ（入らなければ上限を超えない最も新しい年）。
    //   翌年まで見るのは、UTCで動くサーバーで日本時間の元日0時台に取得したリードを正しく読むため。
    m = s.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/)
    if (m) return yearlessMs(lead, +m[1], +m[2], +m[3], +m[4])
    // 日本語 2026年7月1日 [19:37]
    m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2}))?/)
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime()
  }
  const sv = lead && lead.savedAt
  if (sv) { const t = Date.parse(sv); if (!isNaN(t)) return t }
  return 0
}

// 受付日時の新しい順（降順）で並べ替えた新しい配列を返す
export function sortByReceivedDesc(leads) {
  return [...leads].sort((a, b) => receivedAtMs(b) - receivedAtMs(a))
}
