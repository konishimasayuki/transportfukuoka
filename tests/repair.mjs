// 受付日時の修復（api/inbound.js の PUT repairReceived と scripts/repair-received-plan.mjs）を確かめる
// 実 api/inbound.js ＋ 偽Redis。本番には触らない。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process'

let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }
const store = new Map(); const get = k => (store.has(k) ? store.get(k) : null)
let reads = 0, writes = 0
globalThis.fetch = async (url, opts) => {
  const c = JSON.parse(opts.body); const op = c[0]; let result
  if (op === 'GET') { if (c[1] === KEY) reads++; result = get(c[1]) }
  else if (op === 'SET') { store.set(c[1], c[2]); result = 'OK' }
  else if (op === 'EVAL') {
    const sc = c[1], dk = c[3], vk = c[4]
    if (sc.trim().startsWith('return {')) { reads++; result = [get(dk) == null ? '' : get(dk), get(vk) == null ? '0' : get(vk)] }
    else { const cur = get(vk) == null ? '0' : get(vk); if (String(cur) === String(c[6])) { store.set(dk, c[5]); store.set(vk, c[7]); writes++; result = 1 } else result = 0 }
  } else result = null
  return { json: async () => ({ result }) }
}
const KEY = 'transportfukuoka:leads'
const { default: h } = await import('../api/inbound.js')
const call = async (method, body, query = {}) => { let out = null, code = 200; await h({ method, body, query }, { setHeader() {}, status(c) { code = c; return this }, end() { return this }, json(o) { out = o; return this } }); return { out, code } }
const all = () => JSON.parse(store.get(KEY)); const one = k => all().find(l => l.key === k)

const seed = () => {
  store.clear()
  store.set(KEY, JSON.stringify([
    // 書き換えられたリード（引越し侍：依頼日時に元の値が残っている）
    { id: 'a', key: '引越し侍:1', site: '引越し侍', orderId: '1', receivedAt: '10/19 21:52', requestedAt: '10/08 23:47', savedAt: '2026-10-08T14:48:13.268Z',
      updatedAt: '2026-10-19T23:10:14.665Z', detectedAt: '2026-10-19T12:52:32.478Z', status: '架電済', memo: '電切 10/16', staff: '佐藤' },
    // 書き換えられたリード（ズバット：依頼日時も書き換えられている）
    { id: 'b', key: '090-0000-0002', phone: '090-0000-0002', site: 'ズバット', receivedAt: '10/16 16:23', requestedAt: '10/16 16:23', savedAt: '2026-10-05T00:15:00.000Z',
      updatedAt: '2026-10-16T09:55:00.000Z', detectedAt: '2026-10-16T07:23:30.000Z', status: '留守', memo: '留守電' },
    // 価格.com（年あり表記）
    { id: 'c', key: '090-0000-0003', phone: '090-0000-0003', site: '価格.com', receivedAt: '2026/09/30 12:25:05', savedAt: '2026-09-05T04:01:00.000Z',
      updatedAt: '2026-09-30T03:25:10.000Z', detectedAt: '2026-09-30T03:25:08.000Z', status: '見送り' },
    // 正常なリード（触らない）
    { id: 'd', key: '090-0000-0004', phone: '090-0000-0004', site: '引越し侍', receivedAt: '10/18 10:00', savedAt: '2026-10-18T01:00:20.000Z', detectedAt: '2026-10-18T01:00:10.000Z', status: '未架電' },
    // 価格.com で受付が取り込みの数時間あと（サイト側の表記の可能性があるので対象外）
    { id: 'e', key: '090-0000-0005', phone: '090-0000-0005', site: '価格.com', receivedAt: '2026/10/17 09:00:19', savedAt: '2026-10-16T21:01:00.000Z', status: '要追客' },
  ]))
  store.set(KEY + ':ver', '1')
}

console.log('--- 計算スクリプト（plan を作るだけ）---')
seed()
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-'))
fs.writeFileSync(path.join(dir, 'leads.json'), JSON.stringify({ items: all() }))
const log = execFileSync(process.execPath, ['scripts/repair-received-plan.mjs', path.join(dir, 'leads.json'), path.join(dir, 'plan.json')], { env: { ...process.env, TZ: 'Asia/Tokyo' }, encoding: 'utf8' })
const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'))
const pk = k => plan.find(p => p.key === k)
t(plan.length === 3 && !pk('090-0000-0004') && !pk('090-0000-0005'), '対象は書き換えられた3件だけ（正常なもの・1日未満のずれは対象外）', plan.map(p => p.key).join(','))
t(pk('引越し侍:1').to.receivedAt === '10/08 23:47', '★引越し侍は依頼日時（元の値）に戻す', pk('引越し侍:1').to.receivedAt)
t(pk('090-0000-0002').to.receivedAt === '10/05 09:15' && pk('090-0000-0002').to.requestedAt === '10/05 09:15', '★ズバットは取り込んだ日時（日本時間）に戻し、上書きされた依頼日時も戻す', JSON.stringify(pk('090-0000-0002').to))
t(pk('090-0000-0003').to.receivedAt === '2026/09/05 13:01', '価格.com は元の表記（年あり）のまま', pk('090-0000-0003').to.receivedAt)
t(plan.every(p => p.to.detectedAt && p.from.detectedAt), '検知時刻も取り込んだ日時に戻す')
t(plan.every(p => Object.keys(p.to).every(k => ['receivedAt', 'requestedAt', 'detectedAt'].includes(k))), '直すのは受付日時・依頼日時・検知時刻だけ')
t(!/090-0000|佐藤|電切/.test(log), '画面に出すのは件数だけ（電話・名前・メモを出さない）')

console.log('\n--- 確認だけの実行（dryRun）---')
{
  const before = store.get(KEY); reads = 0; writes = 0
  const { out } = await call('PUT', { repairReceived: plan, dryRun: true })
  t(out.dryRun === true && out.count.fixed === 3 && out.count.changed === 0, '直す予定の件数を返す', JSON.stringify(out.count))
  t(writes === 0 && store.get(KEY) === before, '★書き込まない（データはそのまま）')
  t(reads === 1, '全件を読むのは1回だけ', `${reads}回`)
}

console.log('\n--- 本番の実行 ---')
{
  // 確認の後に、担当者が1件の受付日時を手で直していた（その1件は触らない）
  const arr = all(); arr.find(l => l.key === '090-0000-0003').receivedAt = '2026/09/05 12:00:00'; store.set(KEY, JSON.stringify(arr))
  reads = 0; writes = 0
  const { out } = await call('PUT', { repairReceived: [...plan, { key: 'なし', from: { receivedAt: 'x' }, to: { receivedAt: '10/01 10:00' } }] })
  t(out.count.fixed === 2 && out.count.changed === 1 && out.count.notfound === 1, '直した・触らなかった・見つからなかった件数を返す', JSON.stringify(out.count))
  t(writes === 1 && reads === 1, '★全件の読み書きは1回ずつだけ（件数分くり返さない）', `読み${reads}回 書き${writes}回`)
  const a = one('引越し侍:1'), b = one('090-0000-0002')
  t(a.receivedAt === '10/08 23:47' && a.detectedAt === '2026-10-08T14:48:13.268Z', '受付日時・検知時刻が戻る')
  t(a.status === '架電済' && a.memo === '電切 10/16' && a.staff === '佐藤' && a.updatedAt === '2026-10-19T23:10:14.665Z', '★ステータス・メモ・担当者・更新日時には触らない')
  t(b.receivedAt === '10/05 09:15' && b.requestedAt === '10/05 09:15' && b.status === '留守', 'ズバットも戻る（依頼日時も）')
  t(one('090-0000-0003').receivedAt === '2026/09/05 12:00:00', '★確認の後に変わっていたリードは触らない')
  t(one('090-0000-0004').receivedAt === '10/18 10:00' && all().length === 5, '正常なリードはそのまま・件数も変わらない')
  const meta = JSON.parse(store.get('transportfukuoka:leads:meta'))
  t(meta.ver === store.get(KEY + ':ver'), 'サマリも作り直す（版も一致）')
  writes = 0
  const again = await call('PUT', { repairReceived: plan })
  t(again.out.count.fixed === 0 && writes === 0, 'もう一度実行しても何もしない（二重に直さない）', JSON.stringify(again.out.count))
}

console.log('\n--- 受け付けない指定 ---')
{
  seed()
  const before = store.get(KEY)
  const bad = async (body, m) => { const r = await call('PUT', body); t(r.code === 400 && store.get(KEY) === before, m, r.out && r.out.error) }
  await bad({ repairReceived: [{ key: '引越し侍:1', from: { status: '架電済' }, to: { status: '未架電' } }] }, '★ステータスは直せない')
  await bad({ repairReceived: [{ key: '引越し侍:1', from: { receivedAt: '10/19 21:52', memo: 'x' }, to: { receivedAt: '10/08 23:47', memo: '' } }] }, '★メモは直せない')
  await bad({ repairReceived: [{ key: '引越し侍:1', from: { receivedAt: '10/19 21:52' }, to: { receivedAt: '10/08 23:47', requestedAt: 'x' } }] }, '今の値を書いていない項目は直せない')
  await bad({ repairReceived: [{ key: '引越し侍:1', from: { receivedAt: 'a' }, to: { receivedAt: 'b' } }, { key: '引越し侍:1', from: { receivedAt: 'a' }, to: { receivedAt: 'b' } }] }, '同じリードの重複指定は受け付けない')
  await bad({ repairReceived: [] }, '空は受け付けない')
  await bad({ repairReceived: Array.from({ length: 301 }, (_, i) => ({ key: 'k' + i, from: { receivedAt: 'a' }, to: { receivedAt: 'b' } })) }, '301件以上は受け付けない')
  // 普段の PUT（ステータス変更など）は今まで通り
  await call('PUT', { key: '090-0000-0004', phone: '090-0000-0004', status: '架電済' })
  t(one('090-0000-0004').status === '架電済', '普段の保存（PUT）は今まで通り')
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
