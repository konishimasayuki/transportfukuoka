// リードの「対応中」印を、本物のブラウザ2つ（＝2人）で通しで確かめる。
//
// 使い方： npm run build してから node tests/leadlock-e2e.mjs
//   （dev サーバーは不要。このファイルが dist を配信する簡易サーバーを立てる）
//
// 本番のRedisには触らない。/api は全部この中の偽物で応答する。
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

const ROOT = new URL('../dist/', import.meta.url).pathname
if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.log('dist がありません。先に `npm run build` を実行してください。')
  process.exit(1)
}

// ===== 偽Redis（ハッシュだけ）＋ 実 api/lock.js =====
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
const hash = new Map()
globalThis.fetch = async (url, opts) => {
  const c = JSON.parse(opts.body); const op = c[0]; let result
  if (op === 'HGETALL') { result = []; for (const [k, v] of hash) result.push(k, v) }
  else if (op === 'HGET') result = hash.has(c[2]) ? hash.get(c[2]) : null
  else if (op === 'HSET') { hash.set(c[2], c[3]); result = 1 }
  else if (op === 'HSETNX') { if (hash.has(c[2])) result = 0; else { hash.set(c[2], c[3]); result = 1 } }
  else if (op === 'HDEL') { let n = 0; for (const f of c.slice(2)) if (hash.delete(f)) n++; result = n }
  else throw new Error('未対応: ' + op)
  return { json: async () => ({ result }) }
}
const { default: lockHandler } = await import('../api/lock.js')

const LEADS = [1, 2, 3].map(i => ({
  id: 'id' + i, key: '090-0000-000' + i, phone: '090-0000-000' + i, name: 'テスト太郎' + i,
  site: '価格.com', from: '福岡県福岡市', to: '福岡県春日市', count: '2人',
  receivedAt: '10/10 09:0' + i, status: '未架電',
  savedAt: new Date(Date.now() - i * 1000).toISOString(), // 新着（10分窓の中）として扱わせる
  kazai: [],
}))
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/api/lock') {
    let raw = ''; for await (const ch of req) raw += ch
    let body = null; try { body = raw ? JSON.parse(raw) : null } catch { body = raw }
    let code = 200
    await lockHandler({ method: req.method, body, query: Object.fromEntries(u.searchParams) }, {
      setHeader() {}, status(c) { code = c; return this },
      end() { res.writeHead(code); res.end(); return this },
      json(o) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); return this },
    })
    return
  }
  if (u.pathname === '/api/inbound') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(u.searchParams.get('recent') ? { count: LEADS.length, items: [] } : { count: LEADS.length, items: LEADS }))
  }
  if (u.pathname === '/api/staff') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"staff":["佐藤","鈴木"]}') }
  if (u.pathname.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"items":[],"count":0,"statuses":{}}') }
  let f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\//, ''))
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  res.end(fs.readFileSync(f))
})
// 空いているポートを自動で使う（他の検証用サーバーと衝突しないように）
await new Promise(r => server.listen(0, r))
const PORT = server.address().port
const api = async () => {
  const txt = await new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}/api/lock`, r => { let s = ''; r.on('data', c => s += c); r.on('end', () => resolve(s)) }).on('error', reject)
  })
  return JSON.parse(txt).locks
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
// 同じ人の2枚目のタブを作るために、文脈（localStorage）を使い回せるようにする
const openIn = async (ctx, label) => {
  const p = await ctx.newPage()
  p.on('pageerror', e => console.log(`PAGEERROR(${label})`, String(e)))
  await p.goto(`http://localhost:${PORT}/`)
  // 同じ文脈の2枚目のタブは既にログイン済みなので、ログイン欄が無ければ飛ばす
  if (await p.locator('input[placeholder="IDを入力"]').count()) {
    await p.fill('input[placeholder="IDを入力"]', 'b'); await p.fill('input[placeholder="パスワードを入力"]', 'b')
    await p.click('button:has-text("ログイン")'); await p.waitForTimeout(900)
  }
  await p.locator('.nav-item:has-text("リード管理")').first().evaluate(el => el.click())
  await p.waitForTimeout(1200)
  return p
}
const ctxA = await b.newContext({ viewport: { width: 1400, height: 900 } })
const ctxB = await b.newContext({ viewport: { width: 1400, height: 900 } })
const open = async (label) => openIn(label === 'A' ? ctxA : ctxB, label)
const A = await open('A'), B = await open('B')
const rowA = A.locator('tbody tr').first(), rowB = B.locator('tbody tr').first()
t(await A.locator('tbody tr').count() === 3, '一覧が出ている')

console.log('\n--- Aが1件目を開く ---')
await rowA.evaluate(el => el.click()); await A.waitForTimeout(800)
const KEY_A = (await rowA.locator('td').nth(3).innerText()).trim() // 並び順に依存しない
const held = await api()
t(Object.keys(held).length === 1 && !!held[KEY_A], 'サーバーに「対応中」が登録される', KEY_A)

console.log('\n--- Bの一覧（10秒ポーリングを待つ）---')
await B.waitForTimeout(11000)
t(await rowB.locator('text=対応中').count() === 1, '★Bの画面に「対応中」が出る')
const op = await rowB.evaluate(el => getComputedStyle(el).opacity)
t(Number(op) < 1, '★Bの画面でグレーアウトする', `opacity=${op}`)
t(await rowA.locator('text=対応中').count() === 0, '自分（A）の画面では灰色にならない')

console.log('\n--- Bがそれでも押した時 ---')
let asked = ''
B.on('dialog', async d => { asked = d.message(); await d.dismiss() })
await rowB.evaluate(el => el.click()); await B.waitForTimeout(900)
t(/対応中/.test(asked), '★確認してから開く形になっている', asked.replace(/\n/g, ' '))
const still = await api()
t(!!still[KEY_A] && still[KEY_A].by === held[KEY_A].by, '★押しても保持者は奪われない')

console.log('\n--- 別のリードは普通に開ける ---')
await B.locator('tbody tr').nth(1).evaluate(el => el.click()); await B.waitForTimeout(800)
t(Object.keys(await api()).length === 2, '別のリードなら同時に開ける')

console.log('\n--- Aが閉じる ---')
await A.locator('button:has-text("閉じる")').last().evaluate(el => el.click()); await A.waitForTimeout(900)
t(!(await api())[KEY_A], '★閉じたら「対応中」が外れる')
await B.waitForTimeout(11000)
t(await rowB.locator('text=対応中').count() === 0, '★Bの画面もグレーアウトから戻る')

console.log('\n--- 同じ人が2タブで開いた場合 ---')
{
  // ブラウザIDはタブ間で共通。片方を閉じるとサーバー上の「対応中」が消えるため、
  // 残ったタブに戻った時点で即座に復活させている（20秒の延長を待たない）。
  const A1 = await openIn(ctxA, 'A1')
  const A2 = await openIn(ctxA, 'A2')
  const r1 = A1.locator('tbody tr').first(), r2 = A2.locator('tbody tr').first()
  const KEY = (await r1.locator('td').nth(3).innerText()).trim()
  await r1.evaluate(el => el.click()); await A1.waitForTimeout(700)
  let dlg = ''
  A2.on('dialog', async d => { dlg = d.message(); await d.accept() })
  await r2.evaluate(el => el.click()); await A2.waitForTimeout(700)
  t(dlg === '', '同じ人なら2タブ目でも警告は出ない')
  t(!!(await api())[KEY], '2タブ目を開いても「対応中」は残っている')

  await A1.locator('button:has-text("閉じる")').last().evaluate(el => el.click())
  await A1.waitForTimeout(600)
  t(!(await api())[KEY], '★片方を閉じると一旦「対応中」が消える（この穴を塞ぐ）')

  // ヘッドレスでは bringToFront がタブ切替のイベントを出さないため、
  // ブラウザが実際に送るイベントを再現して、受け取り側の配線を確かめる。
  await A2.bringToFront()
  await A2.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
  await A2.waitForTimeout(1200)
  t(!!(await api())[KEY], '★残ったタブに戻った時点で即座に復活する（20秒待たない）')
  await A1.close(); await A2.close()
}

await b.close()
await new Promise(r => server.close(r))
console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
