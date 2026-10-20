// 取得元の一覧で同じ依頼の日付が新しくなり、巡回が送り直してきた時（実 api/inbound.js ＋ 偽Redis）
//
// 本番で起きた不具合：受付日時が上書きされ、対応済みの古いリードが新着として一覧の先頭に移っていた
// （例：10/08 に取り込み・10/16〜17 に架電済みのリードが、10/19 21:52 の新着のように先頭へ）。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'

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
const { receivedAtMs } = await import('../src/lib/sortLeads.js')
const call = async (method, body, query = {}) => { let out = null; await h({ method, body, query }, { setHeader() {}, status() { return this }, end() { return this }, json(o) { out = o; return this } }); return out }
const all = () => JSON.parse(store.get(KEY))
const one = (k) => all().find(l => l.key === k)

// 10/08 に取り込み、10/16〜17 に架電済みのリード（＋その後に届いた別のリード）
const seed = () => {
  store.clear()
  store.set(KEY, JSON.stringify([
    { id: 'n1', key: '引越し侍:20000001', site: '引越し侍', orderId: '20000001', name: '新しい人', receivedAt: '10/18 10:00', savedAt: '2026-10-18T01:00:30.000Z', status: '未架電' },
    { id: 'o1', key: '引越し侍:14791577', site: '引越し侍', orderId: '14791577', name: '対応済みの人', phone: '', receivedAt: '10/08 23:47', requestedAt: '10/08 23:47',
      detectedAt: '2026-10-08T14:48:00.000Z', timing: { list: 100, detail: 200 }, savedAt: '2026-10-08T14:48:13.268Z',
      status: '架電済', memo: '電切8:14 10/16 留守電', memoUpdatedAt: '2026-10-16T23:28:16.000Z', staff: '佐藤', moveDate: '11月10日', detail: true },
  ]))
  store.set(KEY + ':ver', '1')
}

console.log('--- 一覧の日付が新しくなった同じ依頼を、巡回が送り直してきた ---')
{
  seed(); writes = 0
  const r = await call('POST', { site: '引越し侍', key: '引越し侍:14791577', orderId: '14791577', name: '対応済みの人', receivedAt: '10/19 21:52',
    detectedAt: '2026-10-19T12:52:32.478Z', timing: { list: 90, detail: 180 }, moveDate: '11月10日', detail: true })
  const l = one('引越し侍:14791577')
  t(l.receivedAt === '10/08 23:47', '★受付日時は最初の値のまま（新着として先頭に移らない）', l.receivedAt)
  t(l.requestedAt === '10/08 23:47' && l.detectedAt === '2026-10-08T14:48:00.000Z' && l.timing.list === 100, '依頼日時・検知時刻・取得時間も最初の値のまま')
  t(l.status === '架電済' && l.memo === '電切8:14 10/16 留守電' && l.staff === '佐藤', 'ステータス・メモ・担当者はそのまま')
  t(r && r.duplicate === true && writes === 0, '★ほかに変わった項目が無ければ書き込みもしない', `書き込み${writes}回`)
  const sorted = all().slice().sort((a, b) => receivedAtMs(b) - receivedAtMs(a))
  t(sorted[0].key === '引越し侍:20000001', '★一覧の並び（受付日時の新しい順）で先頭は後から届いたリードのまま', sorted[0].name)
}

console.log('\n--- 電話番号が後から分かってキーが変わっても同じ ---')
{
  seed()
  await call('POST', { site: '引越し侍', key: '090-1111-2222', phone: '090-1111-2222', orderId: '14791577', name: '対応済みの人', receivedAt: '10/19 21:52', detail: true })
  const l = all().find(x => x.orderId === '14791577')
  t(all().length === 2 && l.receivedAt === '10/08 23:47' && l.phone === '090-1111-2222', '受付日時は最初の値のまま・電話は埋まる・リードは増えない', `${all().length}件 ${l.receivedAt}`)
}

console.log('\n--- 必要な更新は今まで通り ---')
{
  seed()
  await call('POST', { site: '引越し侍', key: '引越し侍:14791577', orderId: '14791577', receivedAt: '10/19 21:52', moveDate: '12月01日', detail: true })
  t(one('引越し侍:14791577').moveDate === '12月01日' && one('引越し侍:14791577').receivedAt === '10/08 23:47', '引越し希望日など他の項目の変更は反映される（受付日時は変えない）')
  // 受付日時が空のリードは埋める
  const arr = all(); arr.find(x => x.key === '引越し侍:14791577').receivedAt = ''; store.set(KEY, JSON.stringify(arr))
  await call('POST', { site: '引越し侍', key: '引越し侍:14791577', orderId: '14791577', receivedAt: '10/08 23:47', detail: true })
  t(one('引越し侍:14791577').receivedAt === '10/08 23:47', '受付日時が空なら埋める')
  // 人手の取り込み（CSV）は担当者の意思なので更新できる
  await call('POST', { site: '引越し侍', key: '引越し侍:14791577', receivedAt: '10/09 09:00', _manual: true })
  t(one('引越し侍:14791577').receivedAt === '10/09 09:00', '人手の取り込み（CSV取込）では受付日時も更新できる')
  // 新しいリードは普通に追加される
  await call('POST', { site: 'ズバット', key: '080-3333-4444', phone: '080-3333-4444', name: '本当の新着', receivedAt: '10/20 09:00', detail: true })
  t(all().length === 3 && all().find(x => x.phone === '080-3333-4444')?.receivedAt === '10/20 09:00', '本当の新着は今まで通り追加される')
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
