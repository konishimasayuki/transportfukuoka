// 別サイトの申し込みを1件のリードにまとめた時に、広告費（掲載費）を申し込みごとに数えるか
// 実 api/inbound.js ＋ 偽Redis ＋ 実 src/lib/adcost.js。本番には触らない。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'
process.env.TZ = 'Asia/Tokyo'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'

let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }
const store = new Map(); const get = k => (store.has(k) ? store.get(k) : null)
let writes = 0
globalThis.fetch = async (url, opts) => {
  const c = JSON.parse(opts.body); const op = c[0]; let result
  if (op === 'GET') result = get(c[1])
  else if (op === 'SET') { store.set(c[1], c[2]); result = 'OK' }
  else if (op === 'EVAL') {
    const sc = c[1], dk = c[3], vk = c[4]
    if (sc.trim().startsWith('return {')) result = [get(dk) == null ? '' : get(dk), get(vk) == null ? '0' : get(vk)]
    else { const cur = get(vk) == null ? '0' : get(vk); if (String(cur) === String(c[6])) { store.set(dk, c[5]); store.set(vk, c[7]); writes++; result = 1 } else result = 0 }
  } else result = null
  return { json: async () => ({ result }) }
}
const KEY = 'transportfukuoka:leads'
const { default: h } = await import('../api/inbound.js')
// src/lib/adcost.js は拡張子なしの import を使うため、Node で読めるよう一時ファイルに写して読む
const REPO = new URL('..', import.meta.url).pathname
const adTmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'adcost-')), 'adcost.mjs')
fs.writeFileSync(adTmp, fs.readFileSync(path.join(REPO, 'src/lib/adcost.js'), 'utf8').replace("from './sortLeads'", `from '${path.join(REPO, 'src/lib/sortLeads.js')}'`))
const { adCountsByMonthDay, autoAdCostForMonth } = await import(adTmp)
const call = async (method, body, query = {}) => { let out = null; await h({ method, body, query }, { setHeader() {}, status() { return this }, end() { return this }, json(o) { out = o; return this } }); return out }
const all = () => JSON.parse(store.get(KEY)); const lead = () => all().find(l => l.phone === '090-1234-5678')
const day = (ym, d) => (adCountsByMonthDay(all())[ym] || {})[d] || {}

const seed = () => {
  store.clear()
  // 10/08 に引越し侍（1人＝単身）から申し込み。架電済み・メモあり・家財あり
  store.set(KEY, JSON.stringify([
    { id: 'a', key: '090-1234-5678', phone: '090-1234-5678', site: '引越し侍', orderId: '14791577', name: '山田', count: '1人',
      receivedAt: '10/08 23:47', savedAt: '2026-10-08T14:48:13.000Z', status: '架電済', memo: '電切 10/16 留守電', memoUpdatedAt: '2026-10-16T00:00:00.000Z',
      staff: '佐藤', kazai: [{ name: '冷蔵庫（２ドア）', qty: 1 }], boxCount: '10', detail: true },
    { id: 'b', key: '090-9999-0000', phone: '090-9999-0000', site: '価格.com', orderId: 'A0001', name: '別の人', receivedAt: '2026/10/10 10:00', savedAt: '2026-10-10T01:00:30.000Z' },
  ]))
  store.set(KEY + ':ver', '1')
}
const zbaBody = (extra = {}) => ({ site: 'ズバット', key: '090-1234-5678', phone: '090-1234-5678', orderId: 'Z777', name: '山田', count: '1人', receivedAt: '10/19 21:52',
  kazai: [{ name: 'ソファ', qty: 1 }], memo: '巡回から来たメモ', status: '未架電', detail: true, ...extra })

console.log('--- 引越し侍のお客様が、後からズバットからも申し込んだ ---')
{
  seed()
  await call('POST', zbaBody())
  const l = lead()
  t(all().length === 2, 'リードは1件のまま（同じお客様）')
  t(Array.isArray(l.inquiries) && l.inquiries.length === 2, '★申し込みの記録が2件残る', JSON.stringify((l.inquiries || []).map(q => q.site + ':' + q.orderId)))
  t(l.inquiries[0].site === '引越し侍' && l.inquiries[0].orderId === '14791577' && l.inquiries[0].receivedAt === '10/08 23:47' && l.inquiries[0].count === '1人', '1件目は最初の申し込み（引越し侍・元の受付日時・人数）')
  t(l.inquiries[1].site === 'ズバット' && l.inquiries[1].orderId === 'Z777' && l.inquiries[1].receivedAt === '10/19 21:52', '2件目はズバットの申し込み')
  t(l.memo === '電切 10/16 留守電' && l.status === '架電済' && l.staff === '佐藤' && l.memoUpdatedAt === '2026-10-16T00:00:00.000Z', '★利用者のメモ・ステータス・担当者は変えない')
  t(JSON.stringify(l.kazai) === JSON.stringify([{ name: '冷蔵庫（２ドア）', qty: 1 }]) && l.boxCount === '10', '★取れている家財は変えない')
  t(l.receivedAt === '10/08 23:47', '受付日時も変えない（先頭に移らない）')
  t(day('2026-10', '08').single === 1, '★広告費：10/08 に引越し侍（単身）1件', JSON.stringify(day('2026-10', '08')))
  t(day('2026-10', '19').zubatto === 1, '★広告費：10/19 にズバット1件（まとめても数から消えない）', JSON.stringify(day('2026-10', '19')))
  const m = autoAdCostForMonth(all(), '2026-10')
  t(m.total === 715 + 660 + 500, '10月の合計＝引越し侍715＋ズバット660＋価格.com500', String(m.total))
}

console.log('\n--- 同じ申し込みの再表示・送り直し ---')
{
  seed(); await call('POST', zbaBody())
  writes = 0
  await call('POST', zbaBody({ receivedAt: '10/20 09:00' })) // 同じズバット・同じ依頼番号が一覧で再表示
  t(lead().inquiries.length === 2 && writes === 0, '★同じサイト・同じ依頼番号は記録を増やさない（書き込みもしない）', `${lead().inquiries.length}件 書き込み${writes}回`)
  await call('POST', { site: '引越し侍', key: '090-1234-5678', phone: '090-1234-5678', orderId: '14791577', receivedAt: '10/21 10:00', count: '1人', detail: true })
  t(lead().inquiries.length === 2, '最初の引越し侍の申し込みの再表示も増やさない')
}

console.log('\n--- 別の申し込みは増える ---')
{
  seed(); await call('POST', zbaBody())
  await call('POST', { site: '価格.com', key: '090-1234-5678', phone: '090-1234-5678', orderId: 'A0099', receivedAt: '2026/10/22 12:00', detail: true })
  t(lead().inquiries.length === 3 && lead().inquiries[2].site === '価格.com', '3つ目のサイト（価格.com）も記録される')
  await call('POST', { site: '引越し侍', key: '090-1234-5678', phone: '090-1234-5678', orderId: '15000000', receivedAt: '10/18 10:00', count: '3人', detail: true })
  t(lead().inquiries.length === 4 && day('2026-10', '18').family === 1, '同じサイトでも別の依頼番号（申し込み直し）は別の申し込みとして数える', JSON.stringify(day('2026-10', '18')))
}

console.log('\n--- 記録しないもの ---')
{
  seed()
  await call('POST', { site: 'インポート', key: '090-1234-5678', phone: '090-1234-5678', name: '山田', receivedAt: '10/19 10:00', _manual: true })
  t(!lead().inquiries, '人手の取り込み（CSV）は申し込みではないので記録しない')
  seed()
  await call('POST', zbaBody({ inquiries: [{ site: 'ズバット', orderId: 'x' }, { site: 'ズバット', orderId: 'y' }, { site: 'ズバット', orderId: 'z' }] }))
  t(lead().inquiries.length === 2, '送られてきた inquiries では変えない（サーバーだけが付ける）')
  // まとめられていないリードは今まで通り1件として数える
  seed()
  t(day('2026-10', '08').single === 1 && day('2026-10', '10').kakaku === 1 && !day('2026-10', '19').zubatto, 'まとめられていないリードは今まで通り（リード1件＝申し込み1件）')
}

console.log('\n--- 広告費タブの月指定の読み込み（?months=）---')
{
  // 9月に取り込んだリードに、10月に別サイトの申し込みがまとまった
  store.clear()
  store.set(KEY, JSON.stringify([{ id: 'a', key: '090-1234-5678', phone: '090-1234-5678', site: '引越し侍', orderId: '1', count: '2人', receivedAt: '09/28 10:00', savedAt: '2026-09-28T01:00:20.000Z', detail: true }]))
  store.set(KEY + ':ver', '1')
  await call('POST', zbaBody({ receivedAt: '10/05 11:00' }))
  const oct = await call('GET', undefined, { months: '2026-10' })
  t(oct.items.length === 1 && Array.isArray(oct.items[0].inquiries), '★10月を頼むと、10月の申し込みを持つリードが記録ごと返る')
  const c = adCountsByMonthDay(oct.items)
  t((c['2026-10'] || {})['05']?.zubatto === 1 && (c['2026-09'] || {})['28']?.family === 1, '受け取った分だけで、10/05 ズバット・9/28 引越し侍（家族）と数えられる')
  const sep = await call('GET', undefined, { months: '2026-09' })
  t(sep.items.length === 1, '9月を頼んでも返る（最初の申し込みが9月）')
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
