// HTML帳票を固定条件でレンダリングして撮影する
//   条件（変更禁止）: Chromium / viewport 1000x1200 / DPR 2 / zoom 100%
//   出力: formcheck/out/render-raw.png（.a4-sheet 要素・DPR2 = 1588x2246px 前後）
//         formcheck/out/render-print.pdf（A4・余白0・背景印刷）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { fileURLToPath } from 'url'
import path from 'path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
// ESモジュールは file:// では CORS で塞がれるため、vite dev サーバ経由で開く
const TARGET = 'http://localhost:5173/estimate-form/index.html?v=' + Date.now()

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await b.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 })
page.on('pageerror', e => console.log('PAGEERROR:', String(e)))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE:', m.text()) })
await page.goto(TARGET)
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(250)
await page.locator('.a4-sheet').screenshot({ path: path.join(OUT, 'render-raw.png') })
await page.pdf({ path: path.join(OUT, 'render-print.pdf'), format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } })
console.log('rendered')
await b.close()
