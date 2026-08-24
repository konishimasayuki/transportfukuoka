// 検証：スマホ縮小表示（レイアウト不変）・入力による罫線不動・計算・印刷
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import path from 'path'
import { fileURLToPath } from 'url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
const URL0 = 'http://localhost:5173/estimate-form/index.html?v=' + Date.now()
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ok = (n, c, d='') => console.log(`${c ? '✅' : '❌'} ${n}${d ? ' — ' + d : ''}`)

// 1) スマホ: A4形状のまま縮小されるか（内部レイアウト座標は不変）
for (const [name, w, h] of [['iPhone', 390, 844], ['Android', 412, 915]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3 })
  await p.goto(URL0); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200)
  const r = await p.evaluate(() => {
    const sheet = document.querySelector('.a4-sheet').getBoundingClientRect()
    const sc = document.querySelector('.sheet-scale').style.transform
    const kz = document.querySelector('.kazai').getBoundingClientRect()
    return { sw: sheet.width, sh: sheet.height, ratio: sheet.width / sheet.height, scale: sc,
             kzRatio: (kz.left - sheet.left) / sheet.width, horizScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }
  })
  ok(`${name}(${w}px): A4比率維持`, Math.abs(r.ratio - 210/297) < 0.002, `ratio=${r.ratio.toFixed(4)} ${r.scale}`)
  ok(`${name}: 横スクロールなし`, !r.horizScroll)
  ok(`${name}: 家財表の相対位置不変`, Math.abs(r.kzRatio - 5.51/210) < 0.001, `x比=${r.kzRatio.toFixed(4)}`)
  await p.screenshot({ path: path.join(OUT, `mobile-${name}.png`), fullPage: false })
  await p.close()
}

// 2) 入力テスト: 全主要フィールドに投入 → 罫線が動かないか＋計算
const p = await b.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 })
await p.goto(URL0); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200)
const linesBefore = await p.evaluate(() => {
  const xs = []
  document.querySelectorAll('.kz, .fee-row, .p-row, .c').forEach(e => { const r = e.getBoundingClientRect(); xs.push(r.top, r.left) })
  return xs
})
await p.evaluate(() => {
  window.estimateForm.applyFormData({
    customerName: '見本 太郎', customerFurigana: 'ミホン タロウ',
    currentPostal: '813-0036', currentAddress: '福岡県福岡市東区若宮4-3-29 サンプルマンション101号室テスト長い住所',
    destPostal: '810-0001', destAddress: '福岡県福岡市中央区天神1-2-3',
    curTelMobile: '090-0000-0000', moveMonth: '12', moveDay: '28', moveHour: '9',
    estimateDate: '2026/8/24', estimatorName: '担当 花子',
    kz_youdansu_A: 2, kz_fridge_4B: 1, kz_washer_full: 1, kz_dan_small: 15,
    feeA_space: 30000, feeA_work: 45000, feeB_packSmall: 8000,
    feeC_mtSmall_qty1: 10, feeC_mtSmall_amt1: 3000, feeD_aircon: 15000,
    billName: '株式会社テスト商事', refName: '紹介：試験データ',
    moveAmPm: 'AM', sendType: '直送一式', payMethod: '現金', helperCar: '現',
  })
})
await p.waitForTimeout(200)
const after = await p.evaluate(() => {
  const xs = []
  document.querySelectorAll('.kz, .fee-row, .p-row, .c').forEach(e => { const r = e.getBoundingClientRect(); xs.push(r.top, r.left) })
  const calc = {}
  document.querySelectorAll('[data-calc]').forEach(e => calc[e.dataset.calc] = e.textContent)
  const sheet = document.querySelector('.a4-sheet').getBoundingClientRect()
  return { xs, calc, sh: sheet.height }
})
const moved = linesBefore.some((v, i) => Math.abs(v - after.xs[i]) > 0.01)
ok('入力後も罫線・セルが1pxも動かない', !moved)
ok('ページ高さ不変(A4)', Math.abs(after.sh - 297 * 96 / 25.4) < 1, String(after.sh))
// 計算（Excel式）: A=75000 B=8000 C=3000 D=15000 → 合計101000, 消費税10100, 再計111100
ok('小計A=75,000', after.calc.subA === '75,000', after.calc.subA)
ok('合計=101,000', after.calc.total === '101,000', after.calc.total)
ok('消費税=10,100', after.calc.tax === '10,100', after.calc.tax)
ok('再計=111,100', after.calc.final === '111,100', after.calc.final)
// ポイント: 洋ダンスA59×2 + 4ドアB27 + 全自動13 + 小1.5×15 = 118+27+13+22.5 = 180.5
ok('ポイント合計=180.5', after.calc.pointTotal === '180.5', after.calc.pointTotal)
await p.screenshot({ path: path.join(OUT, 'filled.png'), fullPage: true })
await p.locator('.a4-sheet').screenshot({ path: path.join(OUT, 'filled-sheet.png') })
await p.pdf({ path: path.join(OUT, 'filled-print.pdf'), format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
// 3) readFormData 往復
const rd = await p.evaluate(() => window.estimateForm.readFormData())
ok('readFormDataで値回収', rd.customerName === '見本 太郎' && rd.payMethod === '現金' && rd.sendType === '直送一式')
await b.close()
console.log('done')
