// リード管理の不具合修正（1〜5）を、本物のブラウザで通しで確かめる。
//
// 使い方： npm run build してから node tests/leads-e2e.mjs
//   （dev サーバーは不要。このファイルが dist を配信する簡易サーバーを立てる）
//
// 本番のRedisには触らない。実 api/inbound.js に偽Redisをつないで動かす。
//   1. 詳細画面の保存は「変えた項目だけ」送る（他の人のメモを古い内容で上書きしない）
//   2. 一覧の訪問見積もり日は、打ちかけの値を保存しない・1回だけ保存する
//   3. 通信エラーで保存できなかった時は、画面を元に戻して知らせる
//   4. 成約登録は「成約→リード」の順に送り、失敗を確かめる
//   5. 「更新」で件数が合わない時（削除と新着が同時）は全件で取り直す
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

const REPO = new URL('..', import.meta.url).pathname
const ROOT = path.join(REPO, 'dist')
if (!fs.existsSync(path.join(ROOT, 'index.html'))) { console.log('dist がありません。先に `npm run build` を実行してください。'); process.exit(1) }

// ===== 偽Redis ＋ 実 api/inbound.js =====
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'; process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'; process.env.TWILIO_AUTOCALL = 'off'
const store = new Map(); const get = k => (store.has(k) ? store.get(k) : null)
globalThis.fetch = async (url, opts) => {
  const c = JSON.parse(opts.body); const op = c[0]; let result
  if (op === 'GET') result = get(c[1])
  else if (op === 'SET') { store.set(c[1], c[2]); result = 'OK' }
  else if (op === 'EVAL') {
    const sc = c[1], dk = c[3], vk = c[4]
    if (sc.trim().startsWith('return {')) result = [get(dk) == null ? '' : get(dk), get(vk) == null ? '0' : get(vk)]
    else { const cur = get(vk) == null ? '0' : get(vk); if (String(cur) === String(c[6])) { store.set(dk, c[5]); store.set(vk, c[7]); result = 1 } else result = 0 }
  } else result = null
  return { json: async () => ({ result }) }
}
const KEY = 'transportfukuoka:leads'
const N = 300
const now = Date.now()
const p2 = n => String(n).padStart(2, '0')
const leads = Array.from({ length: N }, (_, i) => {
  const d = new Date(now - (i + 1) * 3600000)
  return {
    id: 'id' + i, key: '090-1' + String(i).padStart(7, '0'), phone: '090-1' + String(i).padStart(7, '0'), name: '顧客' + i, site: '引越し侍',
    from: '福岡県福岡市東区', to: '福岡県春日市', count: '2人', receivedAt: `${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:00`,
    status: '架電済', memo: '元のメモ' + i, savedAt: d.toISOString(), updatedAt: d.toISOString(),
    kazai: [{ name: '冷蔵庫（２ドア）', qty: 1 }], boxCount: '10',
  }
})
store.set(KEY, JSON.stringify(leads)); store.set(KEY + ':ver', '1')
const lead = (phone) => JSON.parse(store.get(KEY)).find(l => l.phone === phone)
const { default: inbound } = await import(path.join(REPO, 'api/inbound.js'))
const callApi = async (method, body) => { let out; await inbound({ method, body, query: {} }, { setHeader() {}, status() { return this }, end() { return this }, json(o) { out = o; return this } }); return out }

// 失敗のさせ方：'net' は接続を切る（通信エラー）、'500' はサーバーエラー
let failPut = '', failContracts = '', puts = [], contractPosts = []
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); let raw = ''; for await (const ch of req) raw += ch
  const J = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)) }
  if (u.pathname === '/api/inbound') {
    if (req.method === 'PUT') {
      puts.push(JSON.parse(raw))
      if (failPut === 'net') { req.socket.destroy(); return }
      if (failPut === '500') return J({ error: 'x' }, 500)
    }
    let code = 200
    await inbound({ method: req.method, body: raw ? JSON.parse(raw) : undefined, query: Object.fromEntries(u.searchParams) }, {
      setHeader() {}, status(c) { code = c; return this }, end() { res.writeHead(code); res.end(); return this },
      json(o) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); return this },
    })
    return
  }
  if (u.pathname === '/api/contracts') {
    if (req.method === 'POST') {
      contractPosts.push(JSON.parse(raw))
      if (failContracts === 'net') { req.socket.destroy(); return }
      if (failContracts === '500') return J({ error: 'x' }, 500)
    }
    return J({ ok: true, items: [] })
  }
  if (u.pathname === '/api/lock') return J(req.method === 'GET' ? { locks: {}, at: new Date().toISOString() } : { ok: true })
  if (u.pathname === '/api/staff') return J({ items: ['佐藤', '鈴木'] })
  if (u.pathname.startsWith('/api/')) return J({ items: [], count: 0, statuses: {} })
  let f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\//, ''))
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f))
})
await new Promise(r => server.listen(0, r)); const PORT = server.address().port

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const p = await (await b.newContext({ viewport: { width: 1500, height: 900 }, timezoneId: 'Asia/Tokyo' })).newPage()
p.on('pageerror', e => console.log('PAGEERROR', String(e)))
p.on('dialog', d => d.accept())
await p.goto(`http://localhost:${PORT}/`)
await p.fill('input[placeholder="IDを入力"]', 'b'); await p.fill('input[placeholder="パスワードを入力"]', 'b')
await p.click('button:has-text("ログイン")'); await p.waitForTimeout(900)
await p.locator('.nav-item:has-text("リード管理")').first().evaluate(el => el.click())
await p.locator('tbody tr').nth(49).waitFor({ timeout: 30000 }); await p.waitForTimeout(400)
const row = (i) => p.locator('tbody tr').nth(i)
const phoneOf = async (i) => (await row(i).locator('td').nth(3).innerText()).trim()
const bodyText = () => p.locator('body').innerText()
const openRow = async (i) => { await row(i).locator('td').nth(2).evaluate(el => el.click()); await p.locator('button:has-text("変更を保存")').last().waitFor({ timeout: 10000 }) }
const closeModal = async () => { await p.locator('button:has-text("閉じる")').last().evaluate(el => el.click()); await p.waitForTimeout(300) }

console.log('--- 1. 詳細画面の保存は「変えた項目だけ」送る ---')
{
  const ph = await phoneOf(5)
  // 一覧を開いた後に、別の人がメモを書き換えた
  await callApi('PUT', { key: ph, phone: ph, memo: '【他の人が今書いたメモ】' })
  await openRow(5)
  await p.locator('button:has-text("編集")').last().evaluate(el => el.click()); await p.waitForTimeout(200)
  await p.locator('input[placeholder="例：2人"]').last().fill('3人')
  puts = []
  await p.locator('button:has-text("変更を保存")').last().evaluate(el => el.click()); await p.waitForTimeout(900)
  const sent = Object.keys(puts[0] || {}).filter(k => k !== 'key' && k !== 'phone')
  t(sent.join(',') === 'count', '★送るのは変えた項目（人数）だけ', sent.join(','))
  t(lead(ph).count === '3人', '人数は保存される')
  t(lead(ph).memo === '【他の人が今書いたメモ】', '★他の人が書いたメモは消えない', lead(ph).memo)
  t(JSON.stringify(lead(ph).kazai) === JSON.stringify([{ name: '冷蔵庫（２ドア）', qty: 1 }]), '家財も送らない（そのまま）')
  // メモを変えた時はメモを送り、メモの更新日時も付く
  await p.locator('button:has-text("編集")').last().evaluate(el => el.click()); await p.waitForTimeout(200)
  const ta = p.locator('textarea').last(); await ta.fill('自分のメモ')
  puts = []
  await p.locator('button:has-text("変更を保存")').last().evaluate(el => el.click()); await p.waitForTimeout(900)
  const sent2 = Object.keys(puts[0] || {}).filter(k => k !== 'key' && k !== 'phone').sort()
  t(sent2.join(',') === 'memo,memoUpdatedAt' && lead(ph).memo === '自分のメモ', 'メモを変えた時はメモ（と更新日時）を送る', sent2.join(','))
  // 変えて元に戻した時は送らない
  await p.locator('button:has-text("編集")').last().evaluate(el => el.click()); await p.waitForTimeout(200)
  const inp = p.locator('input[placeholder="例：2人"]').last(); await inp.fill('4人'); await inp.fill('3人')
  puts = []
  await p.locator('button:has-text("変更を保存")').last().evaluate(el => el.click()); await p.waitForTimeout(700)
  t(puts.length === 0, '変えて元に戻した時は何も送らない')
  await closeModal()
}

console.log('\n--- 2. 一覧の訪問見積もり日 ---')
{
  // キーボードで年を打つ時にブラウザが出す変更（0002→0020→0202→2026）をそのまま再現する
  const setDate = (i, v) => row(i).locator('input[type="date"]').evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }))
  }, v)
  const ph = await phoneOf(7)
  puts = []
  for (const v of ['0002-11-20', '0020-11-20', '0202-11-20', '2026-11-20']) { await setDate(7, v); await p.waitForTimeout(120) }
  await p.waitForTimeout(1300)
  t(puts.length === 1 && puts[0].visitEstimateDate === '2026-11-20', '★キーボードで打っても保存は1回・打ちかけの値は送らない', JSON.stringify(puts.map(x => x.visitEstimateDate)))
  t(lead(ph).visitEstimateDate === '2026-11-20', 'サーバーの値は 2026-11-20')
  // カレンダーから選んだ時（変更1回）も保存される
  puts = []; await setDate(7, '2026-12-01'); await p.waitForTimeout(1300)
  t(puts.length === 1 && lead(ph).visitEstimateDate === '2026-12-01', 'カレンダーから選んだ時も保存される')
  // 入力欄から離れたら待たずに保存
  await row(7).locator('input[type="date"]').focus()
  puts = []; await setDate(7, '2026-12-05'); await row(7).locator('input[type="date"]').evaluate(el => el.blur()); await p.waitForTimeout(250)
  t(puts.length === 1 && lead(ph).visitEstimateDate === '2026-12-05', '入力欄から離れた時はすぐ保存される')
  await p.waitForTimeout(1000)
  t(puts.length === 1, '離れた後に同じ値を二重に送らない')
  // 消した時（空）は保存される
  puts = []; await setDate(7, ''); await p.waitForTimeout(1300)
  t(puts.length === 1 && (lead(ph).visitEstimateDate || '') === '', '日付を消した時も保存される')
}

console.log('\n--- 3. 通信エラーで保存できなかった時 ---')
{
  // ステータス（一覧のプルダウン）
  const ph = await phoneOf(9)
  failPut = 'net'
  await row(9).locator('select').first().selectOption('見送り'); await p.waitForTimeout(1200)
  t(await row(9).locator('select').first().inputValue() === '架電済', '★ステータスは元に戻る（保存できたように見えない）', await row(9).locator('select').first().inputValue())
  t((await bodyText()).includes('ステータスを保存できませんでした'), 'お知らせが出る')
  t(lead(ph).status === '架電済', 'サーバーも元のまま')
  // 担当者（一覧のプルダウン）
  await p.waitForTimeout(2700)
  await row(9).locator('select').nth(1).selectOption('佐藤'); await p.waitForTimeout(1200)
  t(await row(9).locator('select').nth(1).inputValue() === '', '★担当者も元に戻る', await row(9).locator('select').nth(1).inputValue())
  t((await bodyText()).includes('保存できませんでした（通信エラー）'), 'お知らせが出る')
  // 詳細画面の保存
  await p.waitForTimeout(2700)
  await openRow(9)
  await p.locator('button:has-text("編集")').last().evaluate(el => el.click()); await p.waitForTimeout(200)
  await p.locator('input[placeholder="例：2人"]').last().fill('5人')
  await p.locator('button:has-text("変更を保存")').last().evaluate(el => el.click()); await p.waitForTimeout(1200)
  t(await p.locator('input[placeholder="例：2人"]').last().inputValue() === '5人', '★詳細画面は編集中のまま残る（書いた内容が消えない）')
  t((await bodyText()).includes('未保存の変更があります'), '「未保存の変更があります」のまま')
  // 通信が戻ってから、もう一度保存すれば保存できる
  failPut = ''
  await p.locator('button:has-text("変更を保存")').last().evaluate(el => el.click()); await p.waitForTimeout(900)
  t(lead(ph).count === '5人', 'やり直せば保存できる')
  await closeModal()
  // サーバーエラー（500）の時も元に戻す
  failPut = '500'
  await row(10).locator('select').first().selectOption('留守'); await p.waitForTimeout(1500)
  t(await row(10).locator('select').first().inputValue() === '架電済', 'サーバーエラーの時もステータスは元に戻る')
  failPut = ''
  await p.waitForTimeout(2700)
}

console.log('\n--- 4. 成約登録 ---')
{
  const convert = async (i) => {
    await row(i).locator('select').first().selectOption('成約'); await p.waitForTimeout(400)
    await p.locator('input[placeholder="例：68000"]').fill('70000')
    await p.locator('select:has(option:text("（担当者を選択）"))').selectOption('佐藤')
    await p.locator('button:has-text("成約管理に登録")').last().evaluate(el => el.click()); await p.waitForTimeout(1500)
  }
  // 成約の登録に失敗 → リードは変えない
  const ph = await phoneOf(12)
  // ※接続を切る失敗だとブラウザが POST を自動で送り直すことがあるため、ここはサーバーエラーで確かめる
  //   （送り直されても成約は同じ id なのでサーバー側で二重登録にならない）
  failContracts = '500'; puts = []; contractPosts = []
  await convert(12)
  t(contractPosts.length === 1 && puts.length === 0, '★成約の登録に失敗したら、リードは変えない（送らない）', `成約${contractPosts.length}回 リード${puts.length}回`)
  t(lead(ph).status === '架電済', 'サーバーのリードは元のまま')
  t((await bodyText()).includes('成約登録できませんでした'), 'お知らせが出る')
  t(await p.locator('button:has-text("成約管理に登録")').count() >= 1 && !(await bodyText()).includes('閉じて次のリードへ'), '★入力画面のまま（完了と表示しない）')
  t(await p.locator('input[placeholder="例：68000"]').inputValue() === '70000', '入力した金額も残る')
  // そのままやり直す → 成功
  failContracts = ''; puts = []; contractPosts = []
  await p.locator('button:has-text("成約管理に登録")').last().evaluate(el => el.click()); await p.waitForTimeout(1500)
  t(contractPosts.length === 1 && lead(ph).status === '成約' && lead(ph).contracted === true, 'やり直すと成約1件・リードも成約になる')
  t((await bodyText()).includes('閉じて次のリードへ'), '完了画面になる')
  await p.locator('button:has-text("閉じて次のリードへ")').evaluate(el => el.click()); await p.waitForTimeout(400)
  // 成約は登録できたがリードの更新に失敗 → 1回だけやり直し、だめなら知らせる（成約は二重にしない）
  await p.waitForTimeout(2700)
  const ph2 = await phoneOf(14)
  failPut = '500'; puts = []; contractPosts = []
  await convert(14)
  t(contractPosts.length === 1 && puts.length === 2, '★成約は1回だけ・リードの更新は1回だけやり直す', `成約${contractPosts.length}回 リード${puts.length}回`)
  t((await bodyText()).includes('成約登録をやり直さず'), '★「やり直さないで」と知らせる（成約が二重にならないように）')
  failPut = ''
  if (await p.locator('button:has-text("閉じて次のリードへ")').count()) await p.locator('button:has-text("閉じて次のリードへ")').evaluate(el => el.click())
  await p.waitForTimeout(1500)
  t(lead(ph2).status === '架電済', '（サーバーのリードは未成約のまま＝画面もそれに合わせて戻る）')
}

console.log('\n--- 5. 「更新」で件数が合わない時 ---')
{
  await p.waitForTimeout(2700)
  const kpi = async () => Number((await p.locator('.kpi-card').first().locator('.kpi-val').innerText()).replace(/[^\d]/g, ''))
  const before = await kpi()
  // 誰かが1件削除し、同時に新着が1件届いた（件数は変わらない）
  const victim = await phoneOf(20)
  await callApi('DELETE', { key: victim, phone: victim })
  await callApi('POST', { site: '価格.com', key: '080-7777-0001', phone: '080-7777-0001', name: '同時の新着', receivedAt: `${p2(new Date().getMonth() + 1)}/${p2(new Date().getDate())} ${p2(new Date().getHours())}:${p2(new Date().getMinutes())}`, detail: true })
  await p.locator('button:has-text("⟳ 更新")').evaluate(el => el.click())
  await p.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => b.textContent.includes('更新中')), null, { timeout: 30000 }); await p.waitForTimeout(800)
  t(await kpi() === before, '★件数がサーバーと合う', `${await kpi()} / ${before}`)
  t(!(await p.locator(`tbody tr:has-text("${victim}")`).count()), '★削除されたリードが一覧に残らない')
  t(await p.locator('tbody tr:has-text("同時の新着")').count() === 1, '新着は出る')
}

await b.close(); await new Promise(r => server.close(r))
console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
