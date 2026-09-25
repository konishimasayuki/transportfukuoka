// 価格.comの詳細ページから家財（お荷物量）を抜き出す処理を、実コードを
// 本物のブラウザに流し込んで検証する。DOM操作なのでNodeだけでは試せない。
// 使い方： node tests/kazaiscrape.mjs   （dev サーバーは不要）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import fs from 'fs'
let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

const bg = fs.readFileSync(new URL('../extension/background.js', import.meta.url).pathname, 'utf8')
const popup = fs.readFileSync(new URL('../extension/popup.js', import.meta.url).pathname, 'utf8')
const grab = src => { const i = src.indexOf('  const kazaiOf = (doc) => {'); return src.slice(i, src.indexOf('\n  }\n', i) + 4) }
const fnBg = grab(bg), fnPopup = grab(popup)

console.log('--- 2経路が同じ実装か ---')
t(fnBg.length > 100, '巡回ループ側に kazaiOf がある', `${fnBg.split('\n').length}行`)
t(fnBg === fnPopup, '「取りこぼしを取り込む」側も同じ実装（片方だけ直す事故を防ぐ）')

// 実測の構造を再現したページ。前後に別セクションを置いて、範囲外を拾わないことも見る。
const row = (n, q) => `<tr><td>${n}</td><td>${q}</td></tr>`
const col = (title, rows) => `<div class="grid_item grid_item-3"><h3>${title}</h3><table><tbody>${rows}</tbody></table></div>`
const PAGE = (note = '物置、水槽', withKazai = true) => `<!doctype html><meta charset="utf-8"><body>
<div class="c-ttl2-type1"><h3 class="c-ttl2_ttl">お引越し情報</h3></div>
<table><tbody>${row('作業開始時間', 'いつでも')}${row('引越し人数', '3人')}</tbody></table>
${withKazai ? `
<div class="c-ttl2-type1"><h3 class="c-ttl2_ttl">お荷物量</h3></div>
<div class="grid">
  ${col('リビング関連', [
    row('テレビ（４０インチ以上）', '1台'), row('テレビ（４０インチ未満）', '0台'),
    row('ソファ３人掛け以上', '0脚'), row('ソファ２人掛け以下', '2脚'),
    row('カーペット（１０畳以上）', '1枚'),
  ].join(''))}
  ${col('寝室・書斎関連', [row('冷蔵庫（３ドア）', '1台'), row('洗濯機（ドラム）', '1台'), row('乾燥機', '0台')].join(''))}
  ${col('キッチン・バス関連', [row('布団', '2組'), row('タンス大', '1棹'), row('衣装ケース', '7台')].join(''))}
  ${col('屋外・ベランダ・その他', [row('物干し竿', '1本'), row('照明器具', '3個'), row('ピアノ', '0台')].join('')) }
  <div class="grid_item grid_item-3"><h3 class="u-m-top20">上記以外の家財</h3><p class="u-m-top10">${note}</p></div>
</div>` : ''}
<div class="c-ttl2-type1"><h3 class="c-ttl2_ttl">その他</h3></div>
<table><tbody>${row('備考', '3台分の駐車場あり')}${row('駐車場', '2台')}</tbody></table>
</body>`

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await b.newContext()).newPage()
const run = async (html) => {
  await p.setContent(html)
  return await p.evaluate(src => {
    const norm = s => (s == null ? '' : String(s)).replace(/　/g, ' ').replace(/\s+/g, ' ').trim()
    const textOf = el => norm(el ? el.textContent : '')
    const doc = document
    const kazaiOf = eval('(' + src.replace(/^\s*const kazaiOf = /, '').replace(/\s*$/, '') + ')')
    return kazaiOf(doc)
  }, fnBg.replace(/^\s*const kazaiOf = /, '').trim().replace(/\}\s*$/, '}'))
}

console.log('\n--- 抜き出し ---')
{
  const r = await run(PAGE())
  const names = r.map(k => `${k.name}×${k.qty}`)
  t(r.length === 11, '数量のある品目だけ拾う（0台は捨てる）＋自由記述1行', `${r.length}件 / ${names.join(' ')}`)
  t(r.filter(k => !k.name.startsWith('上記以外')).length === 10, '品目は10件（0台の3件を除いた数）')
  t(!names.some(n => n.startsWith('テレビ（４０インチ未満）')), '0台は入らない')
  t(!names.some(n => n.startsWith('ソファ３人掛け以上')), '0脚も入らない')
  const get = n => r.find(k => k.name === n)
  t(get('衣装ケース')?.qty === 7, '2桁手前の数量も正しい（衣装ケース7台）', String(get('衣装ケース')?.qty))
  t(get('布団')?.qty === 2 && get('タンス大')?.qty === 1, '単位が台以外（組・棹）でも数量が取れる')
  t(get('物干し竿')?.qty === 1 && get('照明器具')?.qty === 3, '本・個も取れる')
  t(r.every(k => !('unit' in k)), '単位は持たない（品名と数量だけ）')
}

console.log('\n--- 範囲外を拾わないか ---')
{
  const r = await run(PAGE())
  t(!r.some(k => k.name === '作業開始時間' || k.name === '引越し人数'), '「お荷物量」より前の表を拾わない')
  t(!r.some(k => k.name === '備考' || k.name === '駐車場'), '★「その他」以降の表を拾わない（「3台分の駐車場あり」を数量と誤読しない）')
}

console.log('\n--- 上記以外の家財（自由記述）---')
{
  const r = await run(PAGE('物置、水槽'))
  const x = r.find(k => k.name.startsWith('上記以外の家財'))
  t(!!x, '家財リストに1行として入る（案D）', x ? `${x.name}×${x.qty}` : 'なし')
  t(x?.qty === 1, '数量は1固定')
  t(r[r.length - 1] === x, '末尾に置く（品目リストの並びを崩さない）')
  const e = await run(PAGE(''))
  t(!e.some(k => k.name.startsWith('上記以外の家財')), '空欄なら行を足さない')
}

console.log('\n--- 見出しのクラスが変わっても壊れないか ---')
{
  // 「その他」見出しのクラスは未確認。境界が取れなくても文章を数量と読み違えないこと。
  const noBoundary = PAGE().replace(/<div class="c-ttl2-type1"><h3 class="c-ttl2_ttl">その他<\/h3><\/div>/, '<h4>その他</h4>')
  const r = await run(noBoundary)
  t(!r.some(k => k.name === '備考'), '★次の見出しが取れなくても「3台分の駐車場あり」を拾わない')
  t(r.some(k => k.name === '駐車場' && k.qty === 2), '（ただし数量らしい行は拾ってしまう。境界が消えた時の既知の限界）')
}
{
  // .c-ttl2-type1 が無くなっても .c-ttl2_ttl で代用できること
  const onlyTtl = PAGE().replace(/<div class="c-ttl2-type1">|<\/div>(?=\s*<table>|\s*<div class="grid">)/g, '')
  const r = await run(onlyTtl)
  t(r.length >= 10, '見出しブロックが無くても見出し自体で範囲を取れる', `${r.length}件`)
}

console.log('\n--- 構造が変わった／お荷物量が無いページ ---')
{
  const r = await run(PAGE('', false))
  t(Array.isArray(r) && r.length === 0, '「お荷物量」が無ければ空配列（落ちない・誤検出しない）', JSON.stringify(r))
  const empty = await run('<!doctype html><body><p>なにもない</p></body>')
  t(Array.isArray(empty) && empty.length === 0, '空のページでも落ちない')
}

await b.close()
console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
