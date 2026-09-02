// 実装側の要素位置を mm で出す（原本と突き合わせるため）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const sel = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await b.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 })
await p.goto('http://localhost:5173/estimate-form/index.html'); await p.waitForTimeout(500)
console.log(await p.evaluate((sel) => {
  const sheet = document.querySelector('.a4-sheet').getBoundingClientRect()
  const mm = px => +(px/(96/25.4)).toFixed(2)
  return [...document.querySelectorAll(sel)].map(e => ({
    what: e.dataset.field || e.className || e.tagName,
    text: (e.textContent||'').trim().slice(0,10),
    x: mm(e.getBoundingClientRect().left - sheet.left) + '〜' + mm(e.getBoundingClientRect().right - sheet.left),
    y: mm(e.getBoundingClientRect().top - sheet.top) + '〜' + mm(e.getBoundingClientRect().bottom - sheet.top),
  }))
}, sel))
await b.close()
