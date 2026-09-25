// 価格.comの家財名が、見積書の品目と画面のカテゴリに正しく結び付くか。
// 取得だけできても結び付かないと、担当者が毎回手入力し直すことになる。
import fs from 'fs'
let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

const est = fs.readFileSync(new URL('../src/tabs/Estimate.jsx', import.meta.url).pathname, 'utf8')
const modal = fs.readFileSync(new URL('../src/components/LeadDetailModal.jsx', import.meta.url).pathname, 'utf8')
const cut = (src, start, end) => { const i = src.indexOf(start); return src.slice(i, src.indexOf(end, i) + end.length) }

// 表記ゆれの吸収は src/lib/kazaiName.js に一本化されている（2つに分かれていた名残を消した）
const { canonKazai } = await import('../src/lib/kazaiName.js')

// ===== 実コードから割り当て関数を組み立てる =====
const { resolveKazaiKey, ALL_ITEMS } = new Function('canonKazai', `
  ${cut(est, 'const KAZAI_GROUPS = [', '\n]')}
  const ALL_ITEMS = KAZAI_GROUPS.flatMap(g => g.items)
  ${cut(est, 'const LEAD_KAZAI_TO_KEY = {', '\n}')}
  ${cut(est, 'const ITEM_NAME_TO_KEY = (() => {', '\n})()')}
  ${cut(est, 'const LEAD_KEY_CANON = (() => {', '\n})()')}
  ${cut(est, 'function resolveKazaiKey(name) {', '\n}')}
  return { resolveKazaiKey, ALL_ITEMS }
`)(canonKazai)
const label = k => { const i = ALL_ITEMS.find(x => x.key === k); return i ? `${i.name}${i.size ? '(' + i.size + ')' : ''}` : k }

// ===== 実コードから画面のカテゴリ分けを組み立てる =====
const { categoryOf, KAZAI_CATEGORY } = new Function('canonKazai', `
  ${cut(modal, 'const KAZAI_CATEGORY = {', '\n}')}
  ${cut(modal, 'const CATEGORY_BY_NAME = (() => {', '\n})()')}
  ${cut(modal, 'function categoryOf(name) {', '\n}')}
  return { categoryOf, KAZAI_CATEGORY }
`)(canonKazai)

// 画面（お荷物量）に並ぶ品名すべて。期待する見積書品目つき。
// null = あえて割り当てない（見積書に該当が無く毎回その場で足すもの）
const CASES = [
  ['テレビ（４０インチ以上）', 'tv_thin', '家電'],
  ['テレビ（４０インチ未満）', 'tv_thin', '家電'],
  ['テレビ台大', 'tvdai', '家具'], ['テレビ台小', 'tvdai', '家具'],
  ['ステレオ', 'minicompo', '家電'], ['ミニコンポ', 'minicompo', '家電'],
  ['ソファ３人掛け以上', 'sofa_3', '家具'], ['ソファ２人掛け以下', 'sofa_2', '家具'],
  ['ソファベッド', null, '家具'],
  ['テーブル（３人以上）', 'table', '家具'], ['テーブル（２人以下）', 'table', '家具'],
  ['ローボード大', 'lowboard', '家具'], ['ローボード小', 'lowboard', '家具'],
  ['チェスト大', 'chest', '家具'], ['チェスト小', 'chest', '家具'],
  ['カーペット（１０畳以上）', 'juutan', '家具'], ['カーペット（９畳以下）', 'juutan', '家具'],
  ['冷蔵庫（３ドア）', 'fridge_3C', '家電'], ['冷蔵庫（２ドア以下）', 'fridge_2D', '家電'],
  ['食器収納大', 'shokki_A', '家具'], ['食器収納小', 'shokki_B', '家具'],
  ['電子レンジ', 'range', '家電'],
  ['洗濯機（タテ）', 'washer_full', '家電'], ['洗濯機（ドラム）', 'washer_drum', '家電'],
  ['乾燥機', 'dryer', '家電'],
  ['ダブルベッド以上', 'bed_W', '家具'], ['セミダブルベッド', 'bed_SW', '家具'], ['シングルベッド', 'bed_S', '家具'],
  ['布団', 'futonbukuro', '家具'],
  ['ドレッサー大', 'dresser', '家具'], ['ドレッサー小', 'dresser', '家具'],
  ['タンス大', 'seiri_A', '家具'], ['タンス小', 'seiri_B', '家具'],
  ['衣装ケース', 'ishou', '家具'],
  ['デスクトップパソコン', 'pc', '家電'], ['ノートパソコン', null, '家電'],
  ['机', 'tsukue_B', '家具'], ['イス', null, '家具'],
  ['本棚大', 'hondana_A', '家具'], ['本棚小', 'hondana_B', '家具'],
  ['バイク', 'minibike', '重量物'], ['自転車', 'jitensha', 'その他'],
  ['物干し竿', 'monohoshi', 'その他'], ['植木鉢', null, 'その他'],
  ['ピアノ', 'piano_U', '重量物'], ['エアコン', 'aircon_S', '家電'],
  ['仏壇', 'butsudan_B', 'その他'],
  ['ファンヒーター・ストーブ', 'onpuuki', '家電'],
  ['こたつ', 'kotatsu', '家具'], ['照明器具', 'shoumei', '家電'],
]

console.log('--- 見積書の品目への割り当て ---')
let mapped = 0, extra = 0
for (const [name, want] of CASES) {
  const got = resolveKazaiKey(name)
  if (want === null) {
    extra++
    t(got === null, `${name} → 特殊家財（あえて割り当てない）`, got ? `実際=${label(got)}` : '')
  } else {
    mapped++
    t(got === want, `${name} → ${label(want)}`, got === want ? '' : `実際=${got ? label(got) : 'なし'}`)
  }
}
console.log(`\n  割り当て ${mapped}件 / 特殊家財 ${extra}件 / 合計 ${CASES.length}件`)

console.log('\n--- リード詳細のカテゴリ分け ---')
let wrong = []
for (const [name, , cat] of CASES) { const g = categoryOf(name); if (g !== cat) wrong.push(`${name}:${g}(期待${cat})`) }
t(wrong.length === 0, '全品目が家具／家電／その他／重量物に正しく分かれる', wrong.join(' '))
// 全部「その他」に固まっていないこと（分類が効いていないと起きる）
const cats = new Set(CASES.map(([n]) => categoryOf(n)))
t(cats.size >= 3, '1カテゴリに固まっていない', [...cats].join('/'))
t(categoryOf('上記以外の家財：物置、水槽') === 'その他', '自由記述の行は「その他」に入る（表示から消えない）')
t(categoryOf('テレビ（40インチ以上）') === '家電' && categoryOf('テレビ（４０インチ以上）') === '家電',
  '全角・半角どちらの表記でも同じカテゴリになる')

console.log('\n--- 既存2サイトの語彙を壊していないか ---')
for (const [name, want] of [
  ['タンス（大）', 'seiri_A'], ['タンス（中・小）', 'seiri_B'],
  ['ベッド（シングル）', 'bed_S'], ['ベッド（セミダブル）', 'bed_SW'], ['ベッド（ダブル）', 'bed_W'],
  ['食器棚（大）', 'shokki_A'], ['食器棚（中・小）', 'shokki_B'],
  ['本棚（大）', 'hondana_A'], ['本棚（中・小）', 'hondana_B'],
  ['絨毯・カーペット', 'juutan'], ['サイドボード・テレビ台', 'sideboard'],
  ['ソファ（3人掛け）', 'sofa_3'], ['布団類', 'futonbukuro'],
  ['洗濯機（縦型）', 'washer_full'], ['洗濯機（ドラム式）', 'washer_drum'],
]) t(resolveKazaiKey(name) === want, `${name} → ${label(want)}（従来どおり）`, resolveKazaiKey(name) === want ? '' : `実際=${resolveKazaiKey(name)}`)
for (const [name, cat] of [['テレビ', '家電'], ['こたつ', '家具'], ['仏壇', 'その他'], ['バイク', '重量物']])
  t(categoryOf(name) === cat, `${name} のカテゴリは従来どおり ${cat}`)

console.log('\n--- 語彙表の重複（テーブルが荒れていないか）---')
// 重複があると、同じ品名が2つのカテゴリに散ったり、後から足したほうが
// 先勝ちで無効になったりする。目視では見落とすので機械に見張らせる。
const flat = Object.entries(KAZAI_CATEGORY).flatMap(([cat, list]) => list.map(n => [n, cat]))
t(flat.length >= 90, `語彙は ${flat.length} 件（3サイトぶん統合）`)
{
  const seen = new Map(), dup = []
  for (const [n, c] of flat) { if (seen.has(n)) dup.push(`${n}(${seen.get(n)}/${c})`); else seen.set(n, c) }
  t(dup.length === 0, '同じ品名を二度書いていない', dup.join(' '))
}
{
  const seen = new Map(), dup = []
  for (const [n, c] of flat) { const k = canonKazai(n); if (seen.has(k)) dup.push(`${n}≒${seen.get(k)[0]}(${seen.get(k)[1]}/${c})`); else seen.set(k, [n, c]) }
  t(dup.length === 0, '★表記ゆれを吸収すると同じになる品名が無い（布団/布団類 のような重複）', dup.join(' '))
}
{
  // 分類は先勝ち。同じ見出し語が違うカテゴリに入っていると、どちらが勝つか分からない
  const m = new Map(), conflict = []
  for (const [n, c] of flat) { const k = canonKazai(n); if (m.has(k) && m.get(k) !== c) conflict.push(`${n}: ${m.get(k)} vs ${c}`); else m.set(k, c) }
  t(conflict.length === 0, 'カテゴリが食い違う品名が無い', conflict.join(' '))
}

console.log('\n--- 語彙表と正規化の持ち方 ---')
t(!/KAZAI_CATEGORY_EXTRA/.test(modal), '分類専用の別テーブルを作っていない（1つの表に統合済み）')
t(!/const canonName = /.test(modal), '画面側に独自の正規化ルールを持っていない')
t(/from '\.\.\/lib\/kazaiName'/.test(modal) && /from '\.\.\/lib\/kazaiName'/.test(est),
  '★見積書と画面が同じ正規化を使う（片方だけ直す事故を防ぐ）')

console.log('\n--- 家財を選ぶモーダル ---')
t(/function KazaiPicker\(/.test(modal), 'プルダウンではなくモーダルで選ぶ')
t(!/<select value={addName}/.test(modal) && !/optgroup/.test(modal), '旧プルダウンが残っていない')
t(/Object\.entries\(KAZAI_CATEGORY\)/.test(cut(modal, 'function KazaiPicker(', '\n}\n')), 'モーダルはカテゴリごとに並べる')
t(/canonKazai\(n\)\.includes\(key\)/.test(modal), '絞り込みも表記ゆれを吸収する（「ソファー」で「ソファ」も出る）')
t(/zIndex: 1200/.test(modal), 'リード詳細より前面に出す')
t(/ModalPortal/.test(cut(modal, 'function KazaiPicker(', '\n}\n')), 'ModalPortal を通す（背後が動かない・ヘッダーより前面）')
{
  // 価格.comの品名がすべて一覧に載っていること（載っていないと選べない＝手入力になる）
  const names = new Set(flat.map(([n]) => canonKazai(n)))
  const missing = CASES.map(([n]) => n).filter(n => !names.has(canonKazai(n)))
  t(missing.length === 0, '価格.comの50品目すべてがモーダルの一覧にある', missing.join(' '))
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
