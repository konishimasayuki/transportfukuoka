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

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
