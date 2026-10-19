// リード管理を軽くした改修の検証（実 api/inbound.js ＋ 偽Redis）
//
// 本番はリード6,000件近く・一覧APIの応答が8MB超。画面がそれを前提にしていたため
//   ・更新ボタンのたびに全件（2.5〜4秒）を取り直していた
//   ・左メニューの追客バッジの数字ひとつのために全件を読んでいた
// これを「サーバー側で持っているサマリから必要な分だけ返す」形にした。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'
process.env.RESEND_API_KEY = 'test' // api/mail.js の送信は偽物で受ける（実際には送らない）
process.env.MAIL_FROM = 'test@example.com'
import fs from 'node:fs'

let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }

// ===== 偽Redis（api/_kvstore.js が使う GET/SET/EVAL だけ）=====
const store = new Map(); const get = k => (store.has(k) ? store.get(k) : null)
let reads = []
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('resend.com')) return { ok: true, status: 200, json: async () => ({ id: 'm1' }) }
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

console.log('\n--- メール送信（api/mail.js）もサマリに反映する ---')
{
  seed(300)
  await call('GET', undefined, { summary: '1' })
  const { default: mail } = await import('../api/mail.js')
  let out = null, code = 200
  await mail({ method: 'POST', body: { to: 'a@example.com', subject: '件名', text: '本文', leadKey: 'k0' }, query: {} },
    { setHeader() {}, status(c) { code = c; return this }, end() { return this }, json(o) { out = o; return this } })
  t(code === 200 && out && out.ok, 'メール送信が通る（偽物の送信先）', JSON.stringify(out))
  const s = await call('GET', undefined, { summary: '1' })
  const l = s.items.find(x => x.key === 'k0')
  t(l && Array.isArray(l.mailLog) && l.mailLog.length === 1, '★送信履歴が「更新」ボタンの受け取る直近分にも入る（古い内容に戻らない）')
}

console.log('\n--- 新着通知のポーリングは軽いキーだけ読む ---')
{
  seed(300)
  await call('GET', undefined, { summary: '1' })
  reads = []
  await call('GET', undefined, { recent: '5' })
  t(!reads.includes(KEY) && !reads.includes(META + ':full'), '★12秒ごとの通知は全項目のサマリを読まない', `読んだキー: ${reads.join(',')}`)
  const metaBytes = store.get(META).length
  t(metaBytes < 4000, '★通知が読むキーは数KB（全項目50件を入れると約70KB）', `${metaBytes}バイト`)
}

console.log('\n--- 追客タブ：要追客を新しい順に50件ずつ（?follow=1）---')
{
  // 要追客 = i%10===0 → 300件中30件。足りないので要追客を増やした1,000件で見る（要追客100件）
  seed(1000)
  await call('GET', undefined, { summary: '1' })
  reads = []
  const p1 = await call('GET', undefined, { follow: '1' })
  t(p1.items.length === 50 && p1.items.every(l => l.status === '要追客'), '最初は要追客だけ50件', String(p1.items.length))
  t(p1.total === 100 && p1.rest === 50, '全体の件数と残りの件数を返す', `total=${p1.total} rest=${p1.rest}`)
  t(!reads.includes(KEY), '★最初の50件は全件を読まない（サマリから）', `読んだキー: ${reads.join(',')}`)
  t(p1.items.every((l, i, a) => i === 0 || String(a[i - 1].savedAt) >= String(l.savedAt)), '新しい順')
  t('receivedAt' in p1.items[0] && 'phone' in p1.items[0] && 'site' in p1.items[0], '全項目のまま（詳細モーダルを開ける）')
  const last = p1.items[49]
  const p2 = await call('GET', undefined, { follow: '1', beforeSavedAt: last.savedAt, beforeKey: last.key })
  const keys = new Set([...p1.items, ...p2.items].map(l => l.key))
  t(p2.items.length === 50 && p2.rest === 0, '続きの50件', `${p2.items.length}件 rest=${p2.rest}`)
  t(keys.size === 100, '★1ページ目と2ページ目で重複・取りこぼしなし', String(keys.size))
  const pl = await call('GET', undefined, { follow: '1', limit: '80' })
  t(pl.items.length === 80 && pl.rest === 20, '読んだ件数のまま取り直せる（limit）', `${pl.items.length}件 rest=${pl.rest}`)

  // 保存日時が同じリードが並んでも、境目で重複・欠落しない
  const arr = JSON.parse(store.get(KEY))
  arr.forEach(l => { if (l.status === '要追客') l.savedAt = '2026-10-01T00:00:00.000Z' })
  store.set(KEY, JSON.stringify(arr)); store.delete(META); store.delete(META + ':full')
  const q1 = await call('GET', undefined, { follow: '1' })
  const ql = q1.items[49]
  const q2 = await call('GET', undefined, { follow: '1', beforeSavedAt: ql.savedAt, beforeKey: ql.key })
  t(new Set([...q1.items, ...q2.items].map(l => l.key)).size === 100, '★保存日時が全部同じでも重複・取りこぼしなし')

  // ステータスを変えたらサマリの要追客も変わる
  seed(1000)
  await call('GET', undefined, { summary: '1' })
  const top = (await call('GET', undefined, { follow: '1' })).items[0]
  await call('PUT', { key: top.key, phone: top.phone, status: '架電済' })
  const after = await call('GET', undefined, { follow: '1' })
  t(!after.items.some(l => l.key === top.key) && after.total === 99, '★要追客から外したリードは消え、件数も減る', `total=${after.total}`)
}

console.log('\n--- 広告費タブ：指定した月だけ（?months=）---')
{
  const arr = []
  const add = (rec, site, count) => arr.push({ id: 'a' + arr.length, key: 'a' + arr.length, phone: '090-2000-' + String(arr.length).padStart(4, '0'), name: 'x', site, count, receivedAt: rec, kazai: [{ name: '冷蔵庫', qty: 1 }], memo: 'm', savedAt: '2026-10-01T00:00:00.000Z' })
  // 年なしの受付日（引越し侍）は「今年」として読む（画面と同じ）。テストは今年の9月・10月で見る
  const y = new Date().getFullYear()
  add('09/15 10:00', '引越し侍', '1人'); add(`${y}/09/30 23:59`, '価格.com'); add(`${y}/10/01 00:00`, 'ズバット')
  add('08/31 12:00', '引越し侍', '3人'); add(`${y}/07/10 09:00`, '価格.com')
  store.clear(); store.set(KEY, JSON.stringify(arr)); store.set(KEY + ':ver', '1')
  const r = await call('GET', undefined, { months: `${y}-09,${y}-10` })
  const names = r.items.map(l => l.receivedAt).sort()
  t(r.items.length === 3, '指定した2か月のリードだけ返す（月末23:59・月初0:00も含む）', names.join(' / '))
  t(!r.items.some(l => /07\/10|08\/31/.test(l.receivedAt)), '他の月は返さない')
  t(r.items.every(l => !('kazai' in l) && !('memo' in l) && 'site' in l && 'count' in l && 'receivedAt' in l), '★集計に要る項目だけ（家財・メモなどは送らない）', Object.keys(r.items[0] || {}).join(','))
  const bad = await call('GET', undefined, { months: 'abc' })
  t(bad && bad.error, '月の指定がおかしい時はエラー')
}

console.log('\n--- 見積書タブ：一覧を50件ずつ（api/estimate.js ?list=1）---')
{
  const { default: est } = await import('../api/estimate.js')
  const callE = async (query) => { let out = null; await est({ method: 'GET', query }, { setHeader() {}, status() { return this }, end() { return this }, json(o) { out = o; return this } }); return out }
  const y = new Date().getFullYear()
  const ests = [
    { id: 'e1', estimateNo: `EST-${y}0007`, name: 'A', estimateDate: `${y}-10-05`, total: 1000 },
    { id: 'e2', estimateNo: `EST-${y}0003`, name: 'B', estimateDate: `${y}-10-04`, total: 2000, contractId: 'c1' },
    { id: 'e3', estimateNo: `EST-${y - 1}0099`, name: 'C', estimateDate: `${y - 1}-12-01`, total: 500 },
  ]
  const cons = Array.from({ length: 120 }, (_, i) => ({ id: 'c' + i, name: '成約' + i, status: '成約済み', salesDate: `${y}-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}`, amount: 100 }))
  store.clear(); store.set('transportfukuoka:estimates', JSON.stringify(ests)); store.set('transportfukuoka:contracts', JSON.stringify(cons))
  const p1 = await callE({ list: '1', offset: '0', limit: '50', year: String(y) })
  t(p1.rows.length === 50 && p1.total === 122, '50件だけ返し、全体の行数も返す（成約120−見積化1＋見積3）', `${p1.rows.length}件 / 全${p1.total}`)
  t(p1.estCount === 3 && p1.conCount === 119 && p1.sumEst === 3500 && p1.sumCon === 11900, '★件数・合計金額は一覧全体から出す', JSON.stringify({ e: p1.estCount, c: p1.conCount, se: p1.sumEst, sc: p1.sumCon }))
  t(p1.nextNo === `EST-${y}0008`, '★次の見積番号は全見積書の続き（その年の最大＋1）', p1.nextNo)
  const p2 = await callE({ list: '1', offset: '50', limit: '50', year: String(y) })
  const p3 = await callE({ list: '1', offset: '100', limit: '50', year: String(y) })
  const ids = [...p1.rows, ...p2.rows, ...p3.rows].map(r => r.id)
  t(ids.length === 122 && new Set(ids).size === 122, '★全部読むと重複・欠落なし', `${ids.length}件`)
  t(!ids.includes('c_c1') && ids.includes('e2'), '見積書にした成約は見積書の行だけ出る')
  const r = [...p1.rows, ...p2.rows, ...p3.rows].find(x => x.id === 'c_c5')
  t(r && r._contract && r._contract.id === 'c5', '成約の行は「見積書として作成」に要る成約の中身を持つ')
}

console.log('\n--- 画面側：追客・広告費・見積・上部の更新ボタン ---')
{
  const rd = f => fs.readFileSync(new URL('../src/' + f, import.meta.url).pathname, 'utf8')
  const con = rd('tabs/Contracts.jsx'), ad = rd('tabs/AdCost.jsx'), est = rd('tabs/Estimate.jsx'), top = rd('components/Topbar.jsx'), app = rd('App.jsx')
  t(!/fetch\('\/api\/inbound'\)/.test(con), '★追客タブはリード全件を読まない')
  t(/\/api\/inbound\?follow=1/.test(con) && /beforeSavedAt/.test(con), '追客タブは要追客を50件ずつ読む')
  t(/onClick=\{loadMoreFollow\}/.test(con), '「さらに50件読み込む」ボタンがある')
  t(/modeItems\.length \+ followRest/.test(con), '★追客対象の件数は、まだ読んでいない分も足して出す')
  t(!/fetch\('\/api\/inbound'\)/.test(ad), '★広告費タブはリード全件を読まない')
  t(/months\[0\]\.key, months\[1\]\.key/.test(ad), '最初は当月と先月だけ読む')
  t(/loadedMonths\.has\(selMonth\)/.test(ad) && /fetchLeadMonths\(\[m\]\)/.test(ad), '★それより前の月は選んだ時に追加で読む')
  t(/isAutoMonth && !loadedMonths\.has\(selMonth\)/.test(ad), '★読めていない月は保存させない（0件で広告費を上書きしない）')
  t(!/fetch\('\/api\/inbound'\)/.test(est) && /\/api\/inbound\?summary=1/.test(est), '★見積タブはリード全件を読まない（直近50件）')
  t(!/fetch\('\/api\/estimate'\)\.then/.test(est) && !/fetch\('\/api\/contracts'\)\.then/.test(est), '★見積タブは見積書・成約の全件を読まない')
  t(/\/api\/estimate\?list=1&offset=\$\{offset\}&limit=\$\{limit\}/.test(est) && /onClick=\{isDemo \? \(\) => setListLimit\(n => n \+ 50\) : loadMore\}/.test(est), '見積の一覧は50件ずつ読み、「次の50件を読み込む」で追加')
  t(!/⟳ 更新/.test(top) && !/onRefresh/.test(app), '上部の「更新」ボタン（何もしていなかった）を出さない')
}

console.log('\n--- 年なしの受付日（引越し侍・ズバットの一部）の年 ---')
{
  const { receivedAtMs } = await import('../src/lib/sortLeads.js')
  const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  const at = (rec, savedAt, updatedAt) => ymd(receivedAtMs({ receivedAt: rec, savedAt, ...(updatedAt ? { updatedAt } : {}) }))
  t(at('10/18 09:00', '2026-10-18T01:00:00.000Z') === '2026-10-18 09:00', '通常：取得した年')
  // 本番で実際にある形：再問い合わせで受付日時だけ後から更新される（取得の6日後）。updatedAt は付く
  t(at('10/18 16:55', '2026-10-12T01:56:00.000Z', '2026-10-18T08:00:00.000Z') === '2026-10-18 16:55', '★受付日時が取得より後に更新されたリードも同じ年のまま（前年にしない）')
  t(at('12/31 23:50', '2027-01-02T03:00:00.000Z') === '2026-12-31 23:50', '★年明けに取得した12月の受付は前年（今年の12月＝未来にしない）')
  t(at('01/05 10:00', '2026-01-05T02:00:00.000Z', '2027-02-10T00:00:00.000Z') === '2026-01-05 10:00', '★1年前の1月のリードは、後で編集されても1年前のまま（今年の1月として数えない）')
  t(at('06/01 10:00', '2027-01-20T00:00:00.000Z') === '2026-06-01 10:00', '取得がずっと後になった古いリードも、取得日より前の一番近い年')
  // 日本時間の元日0時台に取得（UTCではまだ前年の12/31）。サーバー（UTC）でも画面（日本時間）でも翌年として読む
  t(at('01/01 00:10', '2026-12-31T15:30:00.000Z').startsWith('2027-01-01'), '★日本時間の元日0時台に取得したリードは新しい年')
  t(at('12/31 23:50', '2026-12-31T15:30:00.000Z').startsWith('2026-12-31'), '日本時間の大晦日の受付は前の年のまま')
  const now = new Date(); const md = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} 00:01`
  t(ymd(receivedAtMs({ receivedAt: md })).startsWith(String(now.getFullYear())), '日時が何も無いリードは今日を基準にする')
}

console.log('\n--- 画面側：広告費で別々に読んだ月を合わせる（mergeLeads）---')
{
  const src = fs.readFileSync(new URL('../src/tabs/AdCost.jsx', import.meta.url).pathname, 'utf8')
  const i = src.indexOf('const mergeLeads = (prev, add) => {')
  const mergeLeads = new Function(src.slice(i, src.indexOf('\n  }', i) + 4) + '; return mergeLeads')()
  const L = k => ({ key: k })
  // ★不具合の再現：3か月ずつ分けて頼むと、月の境目のリードが両方の結果に入る
  const r1 = mergeLeads([], [L('a'), L('b'), L('b'), L('c')])
  t(r1.map(x => x.key).join(',') === 'a,b,c', '★受け取った分どうしの重複も除く（7月の広告費が重複で増えていた）', r1.map(x => x.key).join(','))
  const r2 = mergeLeads([L('a')], [L('a'), L('d')])
  t(r2.map(x => x.key).join(',') === 'a,d', '既に持っている分とも重複しない')
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
