// 位置合わせ用：入力欄に目印を入れて撮影し、原本に重ねられる画像を作る。
// 出力: out/marks.png（原本と同じ 1654x2339 に正規化）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { fileURLToPath } from 'url'
import path from 'path'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await b.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 })
await page.goto('http://localhost:5173/estimate-form/index.html?v=' + Date.now())
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(300)
// すべての入力欄を薄赤の枠で可視化し、値も入れる
await page.evaluate(() => {
  const st = document.createElement('style')
  st.textContent = `.form-input{outline:0.2mm solid rgba(220,0,0,.55) !important;outline-offset:-0.1mm;background:rgba(255,0,0,.07) !important}
    .opt input:checked + span, .opt .ring{}`
  document.head.append(st)
  for (const el of document.querySelectorAll('[data-field]')) {
    const f = el.dataset.field
    el.value = /Month|Day|Hour|_pt|_qty|_d1|_d2|_day|^kz_|Floor|road|elevM|confirm(Month|Day)/.test(f) ? '8' : '■'
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  for (const el of document.querySelectorAll('input[type=checkbox]')) el.checked = true
  for (const g of new Set([...document.querySelectorAll('input[type=radio]')].map(r => r.name)))
    document.querySelector(`input[name="${g}"]`).checked = true
  document.dispatchEvent(new Event('estimate:recalc'))
})
await page.waitForTimeout(400)
await page.locator('.a4-sheet').screenshot({ path: path.join(OUT, 'marks-raw.png') })
console.log('marks rendered')
await b.close()
