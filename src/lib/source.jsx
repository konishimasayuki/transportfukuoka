// 流入元ラベルの色を全タブで統一する共有定義。
// 同じ流入元は同じ色になる（別名＝監視サイト名も正規化して同色に揃える）。
const COLORS = {
  'サムライ':  ['#F3E8FF', '#6D28D9'],
  'ズバッと':  ['#DBEAFE', '#1D4ED8'],
  '価格.com':  ['#CCFBF1', '#0F766E'],
  'SUUMO':     ['#DCFCE7', '#15803D'],
  '直電':      ['#FFEDD5', '#C2410C'],
  'チラシ':    ['#FCE7F3', '#BE185D'],
  '企業紹介':  ['#E0E7FF', '#4338CA'],
  '比較ナビ':  ['#FEF3C7', '#B45309'],
  '自社HP':    ['#E0F2FE', '#0369A1'],
  'その他':    ['#F1F5F9', '#475569'],
}
// 監視サイト名など別名 → 色を引くための正規ラベル
const ALIAS = { 'ズバット': 'ズバッと', '引越し侍': 'サムライ', 'デバッグ': 'その他' }

export function normSource(s) { return ALIAS[s] || s || 'その他' }
export function sourceStyle(label) {
  const [bg, fg] = COLORS[normSource(label)] || COLORS['その他']
  return { background: bg, color: fg }
}

// 流入元タグ（全タブ共通の見た目）。label または site を渡す。
// 表示テキストはそのまま（サムライ/引越し侍 等）、色だけ流入元で統一。
export function SourceTag({ label, site, style }) {
  const shown = (label != null ? label : site) || 'その他'
  const st = sourceStyle(shown)
  return (
    <span style={{ ...st, display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', ...(style || {}) }}>{shown}</span>
  )
}
