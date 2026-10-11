// リードの「対応中」印（二重架電の防止）。実 api/lock.js を起動して検証する。
//
// いちばん大事なのは「同じ瞬間に2人が開いたら、必ず片方だけが取れる」こと。
// 一覧のグレーアウトは数秒遅れて届くので、ここが抜けると二重架電は止まらない。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'

let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

// ===== 偽Redis（ハッシュだけ） =====
// 往復に遅延を入れて、同時アクセスを本当に競合させる。
let hash = new Map()
let calls = []
globalThis.fetch = async (url, opts) => {
  const c = JSON.parse(opts.body); const op = c[0]
  calls.push(op)
  await new Promise(r => setTimeout(r, 2))
  let result
  if (op === 'HGETALL') { result = []; for (const [k, v] of hash) result.push(k, v) }
  else if (op === 'HGET') result = hash.has(c[2]) ? hash.get(c[2]) : null
  else if (op === 'HSET') { hash.set(c[2], c[3]); result = 1 }
  // HSETNX は「無ければ書く」を原子的に行う。ここが競合対策の要。
  else if (op === 'HSETNX') { if (hash.has(c[2])) result = 0; else { hash.set(c[2], c[3]); result = 1 } }
  else if (op === 'HDEL') { let n = 0; for (const f of c.slice(2)) if (hash.delete(f)) n++; result = n }
  else throw new Error('未対応のコマンド: ' + op)
  return { json: async () => ({ result }) }
}

const { default: handler } = await import('../api/lock.js')
const call = async (method, body, query) => {
  let out = null
  const res = {
    setHeader() {}, status(c) { this._c = c; return this }, end() { out = { _c: this._c }; return this },
    json(o) { out = { ...o, _c: this._c || 200 }; return this },
  }
  await handler({ method, body, query: query || {} }, res)
  return out
}
const acquire = (key, by) => call('POST', { action: 'acquire', key, by })
const renew   = (key, by) => call('POST', { action: 'renew', key, by })
const release = (key, by) => call('POST', { action: 'release', key, by })
const list    = () => call('GET', null)
const reset   = () => { hash = new Map(); calls = [] }

console.log('--- 基本の流れ ---')
{
  reset()
  t((await acquire('L1', 'A')).ok === true, 'Aが開く → 確保できる')
  const b = await acquire('L1', 'B')
  t(b.ok === false, '★同じリードをBが開こうとすると取れない', JSON.stringify(b.held || {}))
  t(b.held && b.held.by === 'A', '誰が持っているかが返る（画面の「◯分前から対応中」に使う）')
  const l = await list()
  t(l.locks.L1 && l.locks.L1.by === 'A', '一覧には対応中として出る')
  t((await release('L1', 'A')).ok === true, 'Aが画面を閉じる → 解放')
  t(Object.keys((await list()).locks).length === 0, '★閉じたらグレーアウトから戻る')
  t((await acquire('L1', 'B')).ok === true, 'そのあとBは開ける')
}

console.log('\n--- 同時に飛びついた時（新着通知の直後）---')
{
  reset()
  const r = await Promise.all(['A', 'B', 'C', 'D', 'E'].map(u => acquire('L1', u)))
  const won = r.filter(x => x.ok === true)
  t(won.length === 1, '★5人が同時に開いても、取れるのは1人だけ', `成功 ${won.length}人`)
  const holder = (await list()).locks.L1.by
  t(r.filter(x => x.ok === false).every(x => x.held.by === holder), '取れなかった4人には同じ保持者が返る', holder)
}
{
  // 別々のリードなら全員が同時に開ける（過剰にブロックしない）
  reset()
  const r = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((u, i) => acquire('L' + i, u)))
  t(r.every(x => x.ok === true), '別々のリードなら5人とも開ける')
}

console.log('\n--- 自分自身 ---')
{
  reset()
  await acquire('L1', 'A')
  t((await acquire('L1', 'A')).ok === true, '同じ人が開き直しても取れる（閉じ忘れで自分が締め出されない）')
  t((await renew('L1', 'A')).ok === true, '開いている間の延長ができる')
  const l = await list()
  t(l.locks.L1.by === 'A', '延長しても保持者は変わらない')
}

console.log('\n--- 解放の安全性 ---')
{
  reset()
  await acquire('L1', 'A')
  await release('L1', 'B') // 他人が解放しようとする
  t((await list()).locks.L1 && (await list()).locks.L1.by === 'A', '★他の人の「対応中」を横から消せない')
  t((await renew('L1', 'B')).ok === false, '他の人の確保は延長もできない')
}

console.log('\n--- 取りこぼし（ブラウザが落ちた・タブごと閉じた）---')
{
  reset()
  await acquire('L1', 'A')
  // 61秒前に確保したことにする（更新が止まった状態）
  const [atStr, by] = hash.get('L1').split('|')
  hash.set('L1', `${Number(atStr) - 61 * 1000}|${by}`)
  t(Object.keys((await list()).locks).length === 0, '★60秒更新が無ければ一覧から消える（永久に塞がらない）')
  t((await acquire('L1', 'B')).ok === true, '★他の人が取り直せる')
  t((await list()).locks.L1.by === 'B', '保持者がBに移っている')
}
{
  reset()
  await acquire('L1', 'A')
  const [atStr, by] = hash.get('L1').split('|')
  hash.set('L1', `${Number(atStr) - 61 * 1000}|${by}`)
  await list() // 掃除が走る
  t(!hash.has('L1'), '期限切れは保存先からも消える（溜まり続けない）')
}
{
  reset()
  hash.set('L1', 'こわれた値')
  const l = await list()
  t(Object.keys(l.locks).length === 0 && !hash.has('L1'), '壊れた値があっても落ちず、掃除される')
  t((await acquire('L1', 'A')).ok === true, '壊れた値のあとも確保できる')
}

console.log('\n--- 想定外の入力 ---')
{
  reset()
  t((await call('POST', { action: 'acquire', key: '', by: 'A' }))._c === 400, 'キーが空なら400')
  t((await call('POST', { action: 'acquire', key: 'x'.repeat(201), by: 'A' }))._c === 400, '長すぎるキーは弾く')
  t((await call('POST', { action: 'acquire', key: 'L1' }))._c === 400, 'ブラウザIDが無ければ400')
  t((await call('POST', { action: 'bogus', key: 'L1', by: 'A' }))._c === 400, '知らない操作は400')
  t((await call('PUT', { action: 'acquire', key: 'L1', by: 'A' }))._c === 405, 'GET/POST以外は405')
  // sendBeacon は文字列で届く
  await acquire('L1', 'A')
  t((await call('POST', JSON.stringify({ action: 'release', key: 'L1', by: 'A' }))).ok === true, '文字列で届いた本文も読める（タブを閉じた時の解放）')
  t(!hash.has('L1'), 'その解放が効いている')
}

console.log('\n--- 叩く回数（5人運用での負荷）---')
{
  reset()
  calls = []
  await acquire('L1', 'A')
  t(calls.length === 1, '空いているリードの確保はRedis 1コマンド', `${calls.length}コマンド`)
  calls = []
  await list()
  t(calls.length === 1, '一覧の取得も1コマンド', `${calls.length}コマンド`)
  calls = []
  await renew('L1', 'A')
  t(calls.length === 2, '延長は2コマンド（確認＋更新）', `${calls.length}コマンド`)
}

console.log('\n--- 画面側：応答が遅い・返らない時（#8）---')
// Vercelの関数は起動に数秒かかることがある。上限を設けないと
// 「リードを押したのに画面が開かない」状態になる。
{
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../src/lib/leadLock.js', import.meta.url).pathname, 'utf8')
  const cut = (a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i) + b.length) }
  const TIMEOUT = Number(src.match(/const ASK_TIMEOUT_MS\s*=\s*(\d+)/)[1])
  t(TIMEOUT > 0 && TIMEOUT <= 5000, `待ち時間の上限がある（${TIMEOUT}ms）`)

  const build = (fakeFetch) => new Function('fetch', 'clientId', 'AbortController', 'ASK_TIMEOUT_MS', `
    ${cut('async function askServer(', '\n}')}
    ${cut('async function post(action, key) {', '\n}')}
    return post
  `)(fakeFetch, () => 'me', globalThis.AbortController, TIMEOUT)

  // ①応答が返ってこない（中断されるまで待つ）
  let aborted = false
  const hang = build((u, o) => new Promise((_, rej) => {
    o.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')) })
  }))
  const t0 = Date.now()
  const r1 = await hang('acquire', 'L1')
  const ms = Date.now() - t0
  t(aborted, '★応答が返らない時は打ち切る')
  t(ms >= TIMEOUT - 100 && ms < TIMEOUT + 800, `★${TIMEOUT}ms で打ち切る（固まらない）`, `${ms}ms`)
  t(r1.ok === true && r1.offline === true, '★打ち切った時は「取れた」とみなして開ける（業務を止めない）', JSON.stringify(r1))

  // ②通信そのものが失敗
  const dead = build(async () => { throw new Error('offline') })
  const r2 = await dead('acquire', 'L1')
  t(r2.ok === true && r2.offline === true, '通信できない時も開ける')

  // ③壊れた応答
  const broken = build(async () => ({ json: async () => { throw new Error('bad json') } }))
  t((await broken('acquire', 'L1')).ok === true, '応答が壊れていても開ける')

  // ④正常時はサーバーの判断をそのまま使う（他の人が対応中なら止める）
  const okServer = build(async () => ({ json: async () => ({ ok: false, held: { by: 'A', at: Date.now() } }) }))
  const r4 = await okServer('acquire', 'L1')
  t(r4.ok === false && r4.held.by === 'A', '正常に答えが返れば、これまでどおり止める')
}

console.log('\n--- 印を付ける対象（未架電のあいだ ＋ 新着10分）---')
// 古いリードまで対象にすると、確認のために開いただけで灰色になり
// 画面が灰色だらけになる。二重架電が起きるのは新着直後なのでそこに絞る。
{
  const fs = await import('node:fs')
  const src = fs.readFileSync(new URL('../src/lib/leadLock.js', import.meta.url).pathname, 'utf8')
  const cut = (a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i) + b.length) }
  const { withinLockWindow, LOCK_WINDOW_MS, isUncalled, shouldLock } = new Function(`
    ${cut('export const LOCK_WINDOW_MS', '\n')}
    let skewMs = 0
    ${cut('export const serverNow', '\n')}
    ${cut('export function withinLockWindow(item) {', '\n}')}
    ${cut('export const isUncalled', '\n')}
    ${cut('export const shouldLock', '\n')}
    return { withinLockWindow, LOCK_WINDOW_MS, isUncalled, shouldLock }
  `.replace(/export /g, ''))()
  t(LOCK_WINDOW_MS === 10 * 60 * 1000, `窓は10分（${LOCK_WINDOW_MS / 60000}分）`)
  const at = ms => ({ savedAt: new Date(Date.now() - ms).toISOString() })
  t(withinLockWindow(at(0)) === true, '届いた直後は対象')
  t(withinLockWindow(at(9 * 60 * 1000)) === true, '9分後はまだ対象')
  t(withinLockWindow(at(11 * 60 * 1000)) === false, '★11分後は対象外（灰色にしない）')
  t(withinLockWindow({}) === false, 'savedAt が無い古いデータは対象外')
  t(withinLockWindow({ savedAt: 'こわれた値' }) === false, '壊れた日付でも落ちない')
  t(withinLockWindow(null) === false, 'null でも落ちない')

  // ★架電済だけで外すのでは足りない。未架電から変われば全部外す。
  const old10 = ms => new Date(Date.now() - ms).toISOString()
  const lead = (status, ageMs = 60 * 60 * 1000) => ({ status, savedAt: old10(ageMs) })
  t(isUncalled({}) === true, 'ステータス未設定は未架電とみなす')
  t(isUncalled(lead('未架電')) === true, '未架電は対象')
  for (const st of ['架電済', '留守', '見積り', '要追客', '成約', '見送り'])
    t(isUncalled(lead(st)) === false && shouldLock(lead(st)) === false, `★${st} になったら印は外れる`)
  t(shouldLock(lead('未架電')) === true, '★1時間前の未架電リードもまだ対象（気づくのが遅れても守る）')
  t(shouldLock(lead('架電済', 60 * 1000)) === true, '手は付いたが新着1分 → 10分窓で守る（付け替え操作の最中）')
  t(shouldLock(lead('架電済', 20 * 60 * 1000)) === false, '手が付いて20分 → 対象外（灰色だらけにしない）')
}
{
  // 画面側：長電話の最中に窓が切れても、印は消さない
  const fs = await import('node:fs')
  const leads = fs.readFileSync(new URL('../src/tabs/Leads.jsx', import.meta.url).pathname, 'utf8')
  const fn = leads.slice(leads.indexOf('const openLead = async (item) => {'), leads.indexOf('const closeLead ='))
  t(/!shouldLock\(item\) && !held/.test(fn), '★対象外でも誰かが開いていれば知らせる（長電話中に印が消えない）')
  t(/if \(!shouldLock\(item\)\) \{/.test(fn) && /setHeldKey\(null\)/.test(fn), '対象外のリードでは確保を取らない（塞がない）')
  t(/lockedBy\(item\)/.test(leads), '一覧の灰色は確保の有無で決める（窓の外でも対応中は見える）')
  // 「閉じる」以外の経路（コピー・成約登録・見積書作成・配車ボードへ移動）でも
  // 詳細は閉じる。個別に解放を書くと書き漏らし、そのリードが灰色のまま残る。
  t(/useEffect\(\(\) => \{ if \(!detailItem\) setHeldKey\(null\) \}, \[detailItem\]\)/.test(leads),
    '★詳細が閉じたことを1か所で捕まえて解放する（閉じる経路の書き漏らし対策）')
  const closers = (leads.match(/setDetailItem\(null\)/g) || []).length
  t(closers >= 5, `閉じる経路は ${closers} 箇所ある（個別対応では漏れる）`)

  // 2タブ問題の緩和：画面に戻った時点で延長を1回送る
  const lib = fs.readFileSync(new URL('../src/lib/leadLock.js', import.meta.url).pathname, 'utf8')
  const hold = lib.slice(lib.indexOf('export function useHoldLock'))
  t(/visibilitychange/.test(hold) && /addEventListener\('focus'/.test(hold),
    '★この画面に戻ったら20秒を待たずに延長する（2タブで片方を閉じた時の穴を塞ぐ）')
  t(/removeEventListener\('visibilitychange', onBack\)/.test(hold) && /removeEventListener\('focus', onBack\)/.test(hold),
    '登録した受け口は閉じる時に外す（開くたびに溜まらない）')

  // StrictMode は「実行→後片付け→再実行」を行う。後片付けの解放で確保が消えたまま
  // 20秒戻らないので、開始時にも1回延長して置き直す（確保を失った時の自己修復も兼ねる）。
  const body = hold.slice(0, hold.indexOf('const timer = setInterval'))
  t(/renewLock\(key\)/.test(body), '★開き始めに1回延長する（StrictModeの二重実行で確保が消えない）')
  t(!/useRef/.test(lib) && !/reload:/.test(lib), '使っていないコードを残していない')
  t(/serverNow\(\) - Number\(at/.test(lib), '「◯分前」もサーバー時刻基準（PCの時計がずれても狂わない）')

  // 応答が最大2.5秒かかる間、利用者は「押せていない」と思って続けて押す。
  // そのまま通すと別のリードを確保したまま違うリードを開き、確保が置き去りになる。
  t(/openingRef\.current\) return/.test(leads) && /openingRef\.current = true/.test(leads),
    '★応答待ちの間の追加クリックを無視する（確保の置き去りを防ぐ）')
  t(/finally \{ openingRef\.current = false \}/.test(leads), '失敗しても必ず解除する（押せなくならない）')
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
