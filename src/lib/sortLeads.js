// リードの「受付日時」を epoch(ms) に変換する。
// サイトによって表記が異なるため複数フォーマットを解釈する:
//   価格.com : "2026/07/01 19:37:05" / "2026-07-01 19:37"
//   引越し侍 : "07/01 21:43"（年なし → 今年）
//   ズバット : "2026/07/01 19:37" 等
//   日本語   : "2026年7月1日 19:37"
// 解釈できない場合は保存日時(savedAt, ISO) をフォールバックに使う。
export function receivedAtMs(lead) {
  const s = String((lead && lead.receivedAt) || '').trim()
  if (s) {
    // YYYY/MM/DD or YYYY-MM-DD [HH:MM[:SS]]
    let m = s.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/)
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime()
    // 年なし MM/DD HH:MM（引越し侍）→ 今年
    m = s.match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/)
    if (m) return new Date(new Date().getFullYear(), +m[1] - 1, +m[2], +m[3], +m[4]).getTime()
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
