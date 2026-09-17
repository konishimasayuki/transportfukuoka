// 巡回停止の警告帯：出る条件・出ない条件・表示内容・タブごとの出し分け
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
let ng=0, ok=0; const t=(c,m,d='')=>{c?(ok++,console.log('✅ '+m+(d?' — '+d:''))):(ng++,console.log('❌ '+m+(d?' — '+d:'')))}
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const now = Date.now()
const iso = (msAgo) => new Date(now - msAgo).toISOString()
const S = (ok_, reason, msAgo) => ({ source:'x', ok: ok_, reason, count: 100, at: iso(msAgo) })

async function open(statuses, tab = 'リード管理', w = 1500, hour = null) {
  const p = await (await b.newContext({ viewport: { width: w, height: 1000 }, isMobile: w<700, hasTouch: w<700 })).newPage()
  const errs=[]; p.on('pageerror', e=>errs.push(String(e)))
  const hits = { status: 0 }
  p.on('request', r => { if (new URL(r.url()).pathname === '/api/status') hits.status++ })
  // 時刻依存（夜間の注記）を試すため getHours だけ固定する
  if (hour != null) await p.addInitScript(h => { Date.prototype.getHours = function () { return h } }, hour)
  await p.route(u => u.pathname.startsWith('/api/'), r =>
    r.fulfill({ status:200, contentType:'application/json', body: '{"items":[],"count":0,"follow":0,"data":{}}' }))
  await p.route(u => u.pathname === '/api/status', r =>
    r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ statuses, status: statuses.zba || null }) }))
  await p.goto('http://localhost:5173/')
  await p.fill('input[placeholder="IDを入力"]','b'); await p.fill('input[placeholder="パスワードを入力"]','b')
  await p.click('button:has-text("ログイン")'); await p.waitForTimeout(1200)
  if (tab) { await p.locator(`.nav-item:has-text("${tab}")`).first().evaluate(el=>el.click()); await p.waitForTimeout(1200) }
  return { p, errs, hits }
}
const ALL_OK = { zba:S(true,'',30000), samurai:S(true,'',30000), kakaku:S(true,'',30000) }

// ① 正常なときは出ない
{ const { p, errs } = await open(ALL_OK)
  t(await p.locator('.site-alert').count() === 0, '3サイト正常 → 帯は出ない')
  t(errs.length===0, 'pageerror なし', errs.join('|')); await p.close() }

// ② ログイン切れ
{ const { p } = await open({ ...ALL_OK, zba: S(false,'auth',30000) })
  const n = await p.locator('.site-alert').count()
  t(n === 1, 'ログイン切れ → 帯が出る')
  const txt = (await p.locator('.site-alert').innerText()).replace(/\s+/g,' ')
  t(txt.includes('ズバット'), 'どのサイトか書いてある', txt.slice(0,60))
  t(txt.includes('ログインが切れています'), '理由が書いてある')
  t(!txt.includes('引越し侍') || !txt.includes('価格.com'), '正常なサイトは並べない', txt.slice(0,80))
  await p.close() }

// ②-2 パスワード変更（ID/PWが拒否された）
{ const { p } = await open({ ...ALL_OK, zba: S(false,'creds',30000) })
  const txt = (await p.locator('.site-alert').innerText()).replace(/\s+/g,' ')
  t(txt.includes('IDまたはパスワードが違います'), '★パスワード違いと分かる文言が出る', txt.slice(0,80))
  t(txt.includes('ログインできずリードの取り込みが止まっています'), '見出しも原因に合わせて変わる')
  t(await p.locator('.site-alert .sa-creds').count() === 1, '★復旧手順（拡張機能に保存し直す）が追加で出る')
  t((await p.locator('.site-alert .sa-creds').innerText()).includes('新しいパスワードを保存し直して'), '何をすればいいか書いてある')
  await p.close() }
{ const { p } = await open({ ...ALL_OK, zba: S(false,'auth',30000) })
  t(await p.locator('.site-alert .sa-creds').count() === 0, '通常のログイン切れでは復旧手順を出さない（誤解させない）')
  await p.close() }
{ const { p } = await open({ zba: S(false,'creds',30000), samurai: S(false,'auth',30000), kakaku: S(true,'',30000) })
  const txt = (await p.locator('.site-alert').innerText()).replace(/\s+/g,' ')
  t(txt.includes('ズバット') && txt.includes('引越し侍') && !txt.includes('価格.com'), '複数サイトが同時に落ちても両方出る', txt.slice(0,90))
  t(await p.locator('.site-alert .sa-creds').count() === 1, '1サイトでもパスワード違いがあれば手順は1回だけ出る')
  await p.close() }

// ②-3 夜間（自動再ログイン休止中）の注記
{ const { p } = await open({ ...ALL_OK, zba: S(false,'auth',30000) }, 'リード管理', 1500, 23)
  const txt = (await p.locator('.site-alert').innerText()).replace(/\s+/g,' ')
  t(await p.locator('.site-alert').count() === 1, '★夜でも帯は出す（隠すと本当の故障を見逃す）')
  t(txt.includes('朝6時に自動で再開'), '★夜は「自動再試行を休止中」と添える', txt.slice(-60))
  await p.close() }
{ const { p } = await open({ ...ALL_OK, zba: S(false,'auth',30000) }, 'リード管理', 1500, 12)
  const txt = (await p.locator('.site-alert').innerText()).replace(/\s+/g,' ')
  t(!txt.includes('朝6時に自動で再開'), '昼間はその注記を出さない')
  await p.close() }
{ const { p } = await open({ ...ALL_OK, zba: S(false,'creds',30000) }, 'リード管理', 1500, 23)
  const txt = (await p.locator('.site-alert').innerText()).replace(/\s+/g,' ')
  t(!txt.includes('朝6時に自動で再開') && txt.includes('新しいパスワード'), 'パスワード違いは夜でも「保存し直せ」を出す（夜間休止は無関係）')
  await p.close() }

// ②-4 見えていないタブでは問い合わせない
{ const { p, hits } = await open({ ...ALL_OK })
  const before = hits.status
  t(before >= 1, '表示中は問い合わせる', `${before}回`)
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await p.waitForTimeout(400)
  t(hits.status === before, '★裏に回ったら問い合わせない', `${hits.status}回`)
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await p.waitForTimeout(600)
  t(hits.status === before + 1, '★戻ってきたら60秒待たずに最新を取る', `${hits.status}回`)
  await p.close() }

// ③ ハートビート途絶（PCが落ちている等）
{ const { p } = await open({ ...ALL_OK, kakaku: S(true,'',25*60*1000) })
  const txt = (await p.locator('.site-alert').innerText()).replace(/\s+/g,' ')
  t(await p.locator('.site-alert').count() === 1, 'ok:trueでも10分以上途絶なら帯が出る')
  t(/価格\.com：\d+分前から巡回が止まっています/.test(txt), '経過時間が出る', txt.match(/価格\.com：[^（]*/)?.[0] || txt.slice(0,60))
  await p.close() }

// ④ 境界：9分は出ない／11分は出る
{ const { p } = await open({ ...ALL_OK, zba: S(true,'',9*60*1000) })
  t(await p.locator('.site-alert').count() === 0, '9分前の更新 → 出ない（正常範囲）'); await p.close() }
{ const { p } = await open({ ...ALL_OK, zba: S(true,'',11*60*1000) })
  t(await p.locator('.site-alert').count() === 1, '11分前の更新 → 出る'); await p.close() }

// ⑤ 複数サイト同時
{ const { p } = await open({ zba:S(false,'auth',30000), samurai:S(true,'',30*60*1000), kakaku:S(true,'',30000) })
  const txt = (await p.locator('.site-alert').innerText()).replace(/\s+/g,' ')
  t(txt.includes('ズバット') && txt.includes('引越し侍'), '2サイト分が並ぶ', txt.slice(0,70))
  t(!txt.split('この間に')[0].includes('価格.com'), '正常な価格.comは出ない')
  await p.close() }

// ⑥ タブごとの出し分け
{ const { p } = await open({ ...ALL_OK, zba: S(false,'auth',30000) }, null)
  for (const tab of ['ダッシュボード','売上管理','リード管理','成約管理','追客','見積書','配車ボード']) {
    await p.locator(`.nav-item:has-text("${tab}")`).first().evaluate(el=>el.click()); await p.waitForTimeout(900)
    const n = await p.locator('.site-alert').count()
    t(n === 1, `${tab}: 帯が出る`)
  }
  await p.locator('.nav-item:has-text("設定")').first().evaluate(el=>el.click()); await p.waitForTimeout(900)
  t(await p.locator('.site-alert').count() === 0, '設定タブ: 帯は出ない（ご指定どおり）')
  await p.close() }

// ⑦ 位置：タブの中身より上
{ const { p } = await open({ ...ALL_OK, zba: S(false,'auth',30000) })
  const pos = await p.evaluate(() => {
    const a = document.querySelector('.site-alert').getBoundingClientRect()
    const h = document.querySelector('.content h1')?.getBoundingClientRect()
    return h ? { alert: Math.round(a.top), title: Math.round(h.top) } : null
  })
  t(pos && pos.alert < pos.title, 'タブ見出しより上に出る', JSON.stringify(pos))
  await p.close() }

// ⑧ 通信できないときは誤報しない
{ const p2 = await (await b.newContext({ viewport:{width:1400,height:900} })).newPage()
  await p2.route(u => u.pathname.startsWith('/api/'), r => r.fulfill({ status:200, contentType:'application/json', body:'{"items":[],"count":0,"follow":0,"data":{}}' }))
  await p2.route(u => u.pathname === '/api/status', r => r.abort())
  await p2.goto('http://localhost:5173/')
  await p2.fill('input[placeholder="IDを入力"]','b'); await p2.fill('input[placeholder="パスワードを入力"]','b')
  await p2.click('button:has-text("ログイン")'); await p2.waitForTimeout(2000)
  t(await p2.locator('.site-alert').count() === 0, '/api/status に繋がらない → 誤って出さない')
  await p2.close() }

// ⑨ デモでは出さない
{ const p3 = await (await b.newContext({ viewport:{width:1400,height:900} })).newPage()
  let called = 0
  await p3.route(u => u.pathname === '/api/status', r => { called++; r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ statuses:{ zba:S(false,'auth',30000) } }) }) })
  await p3.goto('http://localhost:5173/')
  await p3.fill('input[placeholder="IDを入力"]','z'); await p3.fill('input[placeholder="パスワードを入力"]','z')
  await p3.click('button:has-text("ログイン")'); await p3.waitForTimeout(2000)
  t(await p3.locator('.site-alert').count() === 0 && called === 0, 'デモモードでは出さない・問い合わせもしない', `status呼び出し ${called}回`)
  await p3.close() }

// ⑩ スマホ幅でも収まる
{ const { p } = await open({ ...ALL_OK, zba: S(false,'auth',30000) }, 'リード管理', 390)
  const fit = await p.evaluate(() => { const a=document.querySelector('.site-alert').getBoundingClientRect()
    return { left: Math.round(a.left), right: Math.round(a.right), vw: innerWidth, sx: document.documentElement.scrollWidth - document.documentElement.clientWidth } })
  t(fit.left >= 0 && fit.right <= fit.vw && fit.sx === 0, 'スマホ幅で収まる・横スクロールしない', JSON.stringify(fit))
  await p.close() }

console.log('\nNG:', ng, '/', ok+ng)
await b.close(); process.exit(ng?1:0)
