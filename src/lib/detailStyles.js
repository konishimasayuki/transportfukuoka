// 詳細画面（リード／成約／見積書）で共通に使う、帳票と同じ並びの入力表スタイル。
// 査定サイトの依頼詳細と同じ「枠線つきセルの中に入力欄を置く」見た目に揃える。
// 各タブの詳細を順次この形に載せ替えるため、定義は1か所に集約する。

const BD = '1px solid #CBD5E1'

export const fcell = { border: BD, padding: 0, verticalAlign: 'middle' }
export const flab = {
  border: BD, background: '#F4F6F8', fontWeight: 700, fontSize: 11,
  padding: '6px 8px', whiteSpace: 'nowrap', width: 104, color: '#334155',
}
export const fin = {
  width: '100%', border: 'none', outline: 'none', padding: '6px 8px',
  fontSize: 12, fontFamily: 'inherit', background: 'transparent', color: '#0F172A',
}
// 閲覧時（編集していない時）の値表示。入力欄と同じ位置・余白に揃える。
// whiteSpace: normal は必須（global.css の td { white-space: nowrap } を打ち消し、
// 長い住所などがセルからはみ出して隣のラベルに重ならないようにする）
export const fval = { padding: '6px 8px', fontSize: 12, color: '#0F172A', minHeight: 17, whiteSpace: 'normal', wordBreak: 'break-word' }
// ブロックごとの色帯（顧客=グレー、住所=オレンジ、詳細=水色）
export const fband = (color) => ({ borderLeft: `4px solid ${color}` })
export const BAND = { customer: '#9AA3AB', address: '#F0A868', detail: '#6BB8CC' }
export const flabCustomer = { ...flab }
export const flabAddress = { ...flab, background: '#FDF1E4' }
export const flabDetail = { ...flab, background: '#E6F4F8' }

// 依頼作業のチェック項目（査定サイトの「依頼作業」に合わせる）
export const WORK_ITEMS = [
  '搬出/輸送/搬入', '荷造り/梱包', '家具梱包', '荷解き', '家具の配置',
  '不用品の処分', 'ペットの輸送', 'エアコン脱着', '窓吊り上下作業',
]

// 「ラベル｜値｜ラベル｜値」の4列テーブルは、左右の幅が揃うよう固定する。
// （内容の長さで列幅が変わると、現住所と引越し先がずれて読みにくくなる）
export const table4 = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }
export const COLS4 = ['15%', '35%', '15%', '35%']
