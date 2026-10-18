// リード管理を軽くした改修の検証（実 api/inbound.js ＋ 偽Redis）
//
// 本番はリード6,000件近く・一覧APIの応答が8MB超。画面がそれを前提にしていたため
//   ・更新ボタンのたびに全件（2.5〜4秒）を取り直していた
//   ・左メニューの追客バッジの数字ひとつのために全件を読んでいた
// これを「サーバー側で持っているサマリから必要な分だけ返す」形にした。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'
import fs from 'node:fs'

let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

// ===== 偽Redis（api/_kvstore.js が使う GET/SET/EVAL だけ）=====
const store = new Map(); const get = k => (store.has(k) ? store.get(k) : null)
let reads = []
globalThis.fetch = async (url, opts) => {
  const c = JSON.parse(opts.body); const op = c[0]; let result
  if (op === 'GET') { reads.push(c[1]); result = get(c[1]) }
  else if (op === 'SET') { store.set(c[1], c[2]); result = 'OK' }
  else if (op === 'EVAL') {
    const sc = c[1], dk = c[3], vk = c[4]
    if (sc.trim().startsWith('return {')) { reads.push(dk); result = [get(dk) == null ? '' : get(dk), get(vk) == null ? '0' : get(vk)] }
    else { const cur = get(vk) == null ? '0' : get(vk); if (String(cur) === String(c[6])) { store.set(dk, c[5]); store.set(vk, c[7]); result = 1 } else result = 0 }
  } else result = null
  return { json: async () => ({ result }) }
}
const KEY = 'transportfukuoka:leads', META = 'transportfukuoka:leads:meta'
const md = d => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
const TODAY = md(new Date())
const seed = (n) => {
  const arr = Array.from({ length: n }, (_, i) => ({
    id: 'id' + i, key: 'k' + i, phone: '090-1000-' + String(i).padStart(4, '0'), name: '既存' + i,
    site: ['価格.com', '引越し侍', 'ズバット'][i % 3], receivedAt: (i < 7 ? TODAY : '06/01') + ' 09:00',
    status: i % 10 === 0 ? '要追客' : '未架電', savedAt: new Date(Date.now() - (i + 10) * 60000).toISOString(),
  }))
  store.clear(); store.set(KEY, JSON.stringify(arr)); store.set(KEY + ':ver', '1')
  return arr
}
const { default: h } = await import('../api/inbound.js')
const call = async (method, body, query = {}) => {
  let out = null
  await h({ method, body, query }, { setHeader() {}, status() { return this }, end() { return this }, json(o) { out = o; return this } })
  return out
}

console.log('--- サマリ（?summary=1）---')
{
  seed(300)
  const s = await call('GET', undefined, { summary: '1' })
  t(s.count === 300, '総件数', String(s.count))
  t(s.sites['価格.com'] === 100 && s.sites['引越し侍'] === 100 && s.sites['ズバット'] === 100, '流入元ごとの件数（全期間）', JSON.stringify(s.sites))
  t(s.today && s.today.md === TODAY && s.today.total === 7, '本日の件数', JSON.stringify(s.today))
  t(Array.isArray(s.items) && s.items.length === 50, '★直近50件を返す（リード管理の1ページと同じ）', String(s.items.length))
  t(s.items[0].name === '既存0' && 'receivedAt' in s.items[0] && 'status' in s.items[0], '全項目のまま返す（そのまま一覧と詳細に出せる）')
  t(!!store.get(META), '初回はここでサマリを作って保存する')
  reads = []
  await call('GET', undefined, { summary: '1' })
  t(!reads.includes(KEY), '★2回目以降は全件を読まない（サマリだけ読む）', `読んだキー: ${reads.join(',')}`)
}

console.log('\n--- 書き込みでサマリが追従するか ---')
{
  seed(300)
  await call('GET', undefined, { summary: '1' }) // サマリを作っておく
  await call('POST', { site: '価格.com', key: 'new1', phone: '090-9999-0001', name: '新着さん', receivedAt: TODAY + ' 12:00', detail: true })
  const s = await call('GET', undefined, { summary: '1' })
  t(s.count === 301, '★新着の取り込みでサマリの件数が増える', String(s.count))
  t(s.items[0].name === '新着さん', '★新着がサマリの先頭に入る', s.items[0].name)
  t(s.today.total === 8, '本日の件数も増える', String(s.today.total))
  const k = s.items[0].key
  await call('PUT', { key: k, phone: '090-9999-0001', status: '架電済' })
  const s2 = await call('GET', undefined, { summary: '1' })
  t(s2.items.find(x => x.key === k).status === '架電済', '★他の人のステータス変更もサマリに反映される')
  await call('DELETE', { key: k, phone: '090-9999-0001' })
  const s3 = await call('GET', undefined, { summary: '1' })
  t(s3.count === 300 && !s3.items.some(x => x.key === k), '削除もサマリに反映される')
}

console.log('\n--- 件数だけ（?counts=1・左メニューの追客バッジ）---')
{
  seed(300)
  const c1 = await call('GET', undefined, { counts: '1' })
  t(c1.follow === 30 && c1.count === 300, '要追客の件数', JSON.stringify(c1))
  reads = []
  const c2 = await call('GET', undefined, { counts: '1' })
  t(!reads.includes(KEY), '★2回目以降は全件を読まない', `読んだキー: ${reads.join(',')}`)
  t(JSON.stringify(c2).length < 100, '応答は件数だけ（数十バイト）', `${JSON.stringify(c2).length}バイト`)
}

console.log('\n--- 新着通知（?recent=）は軽いまま ---')
{
  seed(300)
  await call('GET', undefined, { summary: '1' })
  const r = await call('GET', undefined, { recent: '5' })
  t(r.items.length === 5, '件数どおり返す')
  t(!('receivedAt' in r.items[0]) && !('status' in r.items[0]), '★通知に要る項目だけ（サマリが全項目を持つようになっても太らない）', Object.keys(r.items[0]).join(','))
}

console.log('\n--- 画面側：「更新」で受け取った直近ぶんの反映（mergeLatest）---')
{
  const src = fs.readFileSync(new URL('../src/tabs/Leads.jsx', import.meta.url).pathname, 'utf8')
  const i = src.indexOf('export function mergeLatest(')
  const mergeLatest = new Function(src.slice(i, src.indexOf('\n}', i) + 2).replace('export ', '') + '; return mergeLatest')()
  const L = (k, extra = {}) => ({ key: k, name: k, ...extra })
  const prev = [L('a'), L('b'), L('c'), L('d')]

  // ★不具合の再現：新しいもの→既存の順に並んだ受け取りで、先頭に足した後に位置がずれていた
  const r1 = mergeLatest(prev, [L('NEW'), L('a', { status: '架電済' }), L('b', { status: '留守' })])
  t(r1.length === 5, '件数は1増える', String(r1.length))
  t(r1[0].key === 'NEW', '★新しいものは先頭に入る（既存の差し替えで消されない）', r1.map(x => x.key).join(','))
  t(r1.filter(x => x.key === 'a').length === 1 && r1.filter(x => x.key === 'b').length === 1, '★既存が重複しない')
  t(r1.find(x => x.key === 'a').status === '架電済' && r1.find(x => x.key === 'b').status === '留守', '既存は最新の内容に差し替わる')
  t(r1.find(x => x.key === 'c') && r1.find(x => x.key === 'd'), '受け取りに無い既存はそのまま残る')

  const r2 = mergeLatest(prev, [L('N1'), L('c', { status: '見積り' }), L('N2'), L('a')])
  t(r2.length === 6 && new Set(r2.map(x => x.key)).size === 6, '新しいもの複数と差し替えが混ざっても重複・欠落なし', r2.map(x => x.key).join(','))

  const r3 = mergeLatest(prev, [L('a', { status: '架電済' }), L('a', { status: '未架電' })])
  t(r3.length === 4 && r3.find(x => x.key === 'a').status === '架電済', '同じリードが2回来ても1回だけ反映')

  const r4 = mergeLatest(prev, [])
  t(r4.length === 4, '何も来なければ変わらない')
  t(prev.map(x => x.key).join(',') === 'a,b,c,d', '元の配列は書き換えない')
}

console.log('\n--- 画面側：更新ボタンの作り ---')
{
  const src = fs.readFileSync(new URL('../src/tabs/Leads.jsx', import.meta.url).pathname, 'utf8')
  const fn = src.slice(src.indexOf('const refreshLatest = async'), src.indexOf('finally { setRefreshing(false) }'))
  t(/fetch\('\/api\/inbound\?summary=1'\)/.test(fn), '更新ボタンは直近ぶんだけ受け取る')
  t(/total < items\.length/.test(fn), '★件数が減った（誰かが削除した）時は全件を取り直す')
  t(/total - items\.length > latest\.length/.test(fn), '★50件を超えて増えていた時は全件を取り直す（取りこぼさない）')
  t(/catch \(e\)[\s\S]*fetchItems\(\)/.test(fn), '軽い取得に失敗したら全件で取り直す')
  t(/onClick=\{refreshLatest\}/.test(src), '検索欄の横の「更新」ボタンに繋がっている')
  t(!/setLoading\(true\)/.test(fn.split('await fetchItems()')[0]), '軽い更新では「読み込み中」に切り替えない（一覧がちらつかない）')
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
