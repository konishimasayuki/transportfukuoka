// 「文字は枠からはみ出てはいけない」を機械的に検査する。
//   - 帳票内の全テキストノードについて、最寄りの枠（罫線を持つ／overflow:hidden の祖先）から
//     はみ出していないか、意図しない折り返し（1つのテキストノードが2行以上）がないかを見る
//   - 〇付け用の輪（.opt .ring）が枠に切られていないかも見る
//   使い方: node overflow.mjs [--fill]   （--fill で全入力欄に長めの値を入れて検査）
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const FILL = process.argv.includes('--fill')
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await b.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 })
page.on('pageerror', e => console.log('PAGEERROR:', String(e)))
await page.goto('http://localhost:5173/estimate-form/index.html?v=' + Date.now())
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(250)

if (FILL) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('input[type=checkbox]')) el.checked = true
    for (const g of new Set([...document.querySelectorAll('input[type=radio]')].map(r => r.name)))
      document.querySelector(`input[name="${g}"]`).checked = true
  })
}

const report = await page.evaluate(() => {
  const sheet = document.querySelector('.a4-sheet')
  const pxPerMm = sheet.getBoundingClientRect().width / 210
  const mm = px => +(px / pxPerMm).toFixed(2)
  const TOL = 0.12 * pxPerMm   // 0.12mm（1px 未満）は丸め誤差として無視
  const hasBorder = (cs) => ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(cs['border' + s + 'Width']) > 0)
  // 最寄りの「枠」: 罫線を持つか overflow:hidden の祖先
  const frameOf = (el) => {
    for (let e = el; e && e !== sheet; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (e.classList.contains('pcirc')) continue
      if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || hasBorder(cs)) return e
    }
    return sheet
  }
  const inner = (e) => {   // 罫線の内側（padding box）
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
    return { left: r.left + parseFloat(cs.borderLeftWidth), right: r.right - parseFloat(cs.borderRightWidth),
             top: r.top + parseFloat(cs.borderTopWidth), bottom: r.bottom - parseFloat(cs.borderBottomWidth) }
  }
  const label = (el) => {
    const parts = []
    for (let e = el; e && e !== sheet && parts.length < 3; e = e.parentElement) {
      const id = e.id ? '#' + e.id : ''
      const cls = e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
      if (id || cls) parts.push(e.tagName.toLowerCase() + id + cls)
    }
    return parts.reverse().join(' > ')
  }
  const out = []
  const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT)
  let n
  while ((n = walker.nextNode())) {
    const text = n.textContent.replace(/[\s　]+/g, ' ').trim()
    if (!text) continue
    const el = n.parentElement
    if (!el || el.closest('.no-print, .reference-overlay')) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const range = document.createRange(); range.selectNodeContents(n)
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0)
    if (!rects.length) continue
    const fr = frameOf(el); const box = inner(fr)
    const u = { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)),
                top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) }
    // 縦書きは行判定を横方向で行う
    const vertical = /vertical/.test(cs.writingMode)
    const lines = new Set(rects.map(r => Math.round(vertical ? r.left : r.top)))
    // 矩形は行ボックス（字のインクより上下に約0.3em広い）なので、上下はその分を許容する。
    // 末尾の letter-spacing は空白なので右端から引く。
    const fs = parseFloat(cs.fontSize)
    const lh = cs.lineHeight === 'normal' ? fs * 1.2 : parseFloat(cs.lineHeight)
    const lead = Math.max(0, fs - lh)   // 行間を詰めた分、行ボックスは字より小さい
    const vt = vertical ? TOL : 0.3 * fs + lead, ht = vertical ? 0.3 * fs + lead : TOL
    const ls = parseFloat(cs.letterSpacing) || 0
    if (!vertical) u.right -= ls; else u.bottom -= ls
    const over = []
    if (u.left < box.left - ht) over.push(`左 ${mm(box.left - u.left)}mm`)
    if (u.right > box.right + ht) over.push(`右 ${mm(u.right - box.right)}mm`)
    if (u.top < box.top - vt) over.push(`上 ${mm(box.top - u.top)}mm`)
    if (u.bottom > box.bottom + vt) over.push(`下 ${mm(u.bottom - box.bottom)}mm`)
    if (lines.size > 1) over.push(`折返し${lines.size}行`)
    if (over.length) out.push({ kind: 'text', text: text.slice(0, 22), where: label(el), over: over.join(' / '), x: mm(u.left - sheet.getBoundingClientRect().left), y: mm(u.top - sheet.getBoundingClientRect().top) })
  }
  // 〇付けの輪が枠に切られないか（inset 分だけ膨らんだ矩形で判定）
  for (const opt of sheet.querySelectorAll('.opt')) {
    const ring = opt.querySelector('.ring'); if (!ring || getComputedStyle(ring).display === 'none') continue
    const rr = ring.getBoundingClientRect(); if (!rr.width) continue
    const fr = frameOf(opt.parentElement); const box = inner(fr)
    const over = []
    if (rr.left < box.left - TOL) over.push(`左 ${mm(box.left - rr.left)}mm`)
    if (rr.right > box.right + TOL) over.push(`右 ${mm(rr.right - box.right)}mm`)
    if (rr.top < box.top - TOL) over.push(`上 ${mm(box.top - rr.top)}mm`)
    if (rr.bottom > box.bottom + TOL) over.push(`下 ${mm(rr.bottom - box.bottom)}mm`)
    if (over.length) out.push({ kind: 'ring', text: '〇 ' + opt.textContent.trim().slice(0, 12), where: label(opt), over: over.join(' / '), x: mm(rr.left - sheet.getBoundingClientRect().left), y: mm(rr.top - sheet.getBoundingClientRect().top) })
  }
  return out
})

if (process.argv.includes('--shot')) await page.locator('.a4-sheet').screenshot({ path: new URL('./out/overflow-shot.png', import.meta.url).pathname })
report.sort((a, b) => a.y - b.y || a.x - b.x)
for (const r of report) console.log(`${r.kind === 'ring' ? '◎' : '✗'} (${String(r.x).padStart(6)}, ${String(r.y).padStart(6)}) ${r.over.padEnd(18)} 「${r.text}」  ${r.where}`)
console.log(`はみ出し: ${report.filter(r => r.kind === 'text').length} 件 / 輪の切れ: ${report.filter(r => r.kind === 'ring').length} 件`)
await b.close()
