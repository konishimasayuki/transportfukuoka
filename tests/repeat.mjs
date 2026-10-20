// 同じお客様から、前の申し込みの30日以上あとに別の依頼番号で依頼が来た時（新しい引越し）
// 実 api/inbound.js ＋ 偽Redis。本番には触らない。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'

let ng = 0, ok = 0
const t = (c, m, d = '') => { c ? (ok++, console.log('✅ ' + m + (d ? ' — ' + d : ''))) : (ng++, console.log('❌ ' + m + (d ? ' — ' + d : ''))) }
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
const { default: h } = await import('../api/inbound.js')
const call = async (method, body) => { let out = null, code = 200; await h({ method, body, query: {} }, { setHeader() {}, status(c) { code = c; return this }, end() { return this }, json(o) { out = o; return this } }); return { ...out, code } }
const all = () => JSON.parse(store.get(KEY))
const DAY = 86400000
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString()
const PHONE = '090-1234-5678', KEYTEL = 'tel:09012345678'
const OLD = { id: 'old', key: KEYTEL, phone: PHONE, site: '引越し侍', orderId: '111', name: '山田 太郎', count: '1人', receivedAt: '06/10 10:00', savedAt: iso(130),
  status: '成約', contracted: true, amount: 50000, memo: '6月に東区→春日市で成約', staff: '佐藤', from: '福岡市東区', to: '春日市',
  fromAddress: '福岡市東区香椎1-1', toAddress: '春日市春日原2-2', kazai: [{ name: '冷蔵庫', qty: 1 }], boxCount: '10', moveDate: '06月20日', detail: true }
const seed = (lead = OLD) => { store.clear(); store.set(KEY, JSON.stringify([lead])); store.set(KEY + ':ver', '1') }
const now = new Date(), p2 = n => String(n).padStart(2, '0'), md = `${p2(now.getMonth() + 1)}/${p2(now.getDate())} ${p2(now.getHours())}:00`
const NEW = { site: '引越し侍', key: PHONE, phone: PHONE, orderId: '999', name: '山田 太郎', count: '2人', receivedAt: md,
  from: '春日市', to: '福岡市博多区', fromAddress: '春日市春日原2-2', toAddress: '福岡市博多区博多駅前3-3', kazai: [{ name: 'ソファ', qty: 1 }], moveDate: '11月15日', detail: true }
const oldLead = () => all().find(l => l.id === 'old'), newLead = () => all().find(l => l.id !== 'old')

console.log('--- 6月に成約したお客様から、4か月後に別の依頼番号で依頼が来た ---')
{
  seed()
  const r = await call('POST', NEW)
  t(all().length === 2, '★新しいリードとして追加される（2件になる）', `${all().length}件`)
  t(r.duplicate === false, '★新着として扱う（新着通知が出る）', JSON.stringify(r))
  const o = oldLead(), n = newLead()
  t(JSON.stringify(o) === JSON.stringify(OLD), '★古いリードには一切触らない（メモ・ステータス・住所・家財・受付日時・依頼番号すべてそのまま）')
  t(n.receivedAt === md && n.status === undefined && !n.memo && n.toAddress === '福岡市博多区博多駅前3-3' && n.kazai[0].name === 'ソファ' && n.orderId === '999',
    '新しいリードは新しい依頼の内容（受付日時・住所・家財）で、メモ・ステータスは空')
  t(n.key !== KEYTEL && n.key !== PHONE && n.repeatOf === KEYTEL, '新しいリードのキーは電話番号と別（画面の保存が古いリードと取り違えない）', n.key)
}

console.log('\n--- その後の申し込み・保存 ---')
{
  seed(); await call('POST', NEW)
  await call('POST', { ...NEW, receivedAt: md, moveDate: '11月16日' }) // 同じ新しい依頼の送り直し
  t(all().length === 2 && newLead().moveDate === '11月16日' && oldLead().moveDate === '06月20日', '★新しい依頼の送り直しは新しいリードにまとまる（古い方に入らない）')
  await call('POST', { site: 'ズバット', key: PHONE, phone: PHONE, orderId: 'Z5', name: '山田 太郎', receivedAt: md, detail: true }) // 同じ引越しで別サイトにも
  t(all().length === 2 && (newLead().inquiries || []).length === 2 && !oldLead().inquiries, '★同じ引越しで別サイトからも来たら新しいリードにまとまり、広告費の記録が残る')
  // 画面からの保存（ステータス変更）が取り違えないか
  await call('PUT', { key: oldLead().key, phone: PHONE, status: '見送り' })
  t(oldLead().status === '見送り' && newLead().status === undefined, '★古いリードのステータス変更は古いリードだけに入る')
  await call('PUT', { key: newLead().key, phone: PHONE, status: '架電済', memo: '新しい依頼のメモ' })
  t(newLead().status === '架電済' && newLead().memo === '新しい依頼のメモ' && oldLead().memo === OLD.memo, '★新しいリードの保存は新しいリードだけに入る（古いメモはそのまま）')
}

console.log('\n--- 新しいリードにしない場合 ---')
{
  seed({ ...OLD, savedAt: iso(10) }) // 前の申し込みから10日
  await call('POST', NEW)
  t(all().length === 1 && (all()[0].inquiries || []).length === 2, '30日未満の別の依頼番号は今まで通りまとめる（広告費の記録は残す）')
  seed()
  await call('POST', { ...NEW, orderId: '111' }) // 30日以上たっても同じ依頼番号（再表示）
  t(all().length === 1 && all()[0].receivedAt === '06/10 10:00', '★同じ依頼番号の再表示は30日以上たってもまとめる（新しいリードにしない・先頭にも移らない）')
  seed()
  await call('POST', { ...NEW, orderId: undefined })
  t(all().length === 1, '依頼番号が無い時は今まで通りまとめる')
  seed()
  await call('POST', { ...NEW, site: 'インポート', _manual: true })
  t(all().length === 1, '人手の取り込み（CSV）は今まで通りまとめる')
  // 同じ電話でも別のキー（同居の家族など）は今まで通り別のリード
  seed()
  await call('POST', { site: '価格.com', key: 'K-9', phone: PHONE, orderId: 'A1', name: '山田 花子', receivedAt: md })
  t(all().length === 2 && oldLead().memo === OLD.memo, '同じ電話番号でもキーが違う別のリードは今まで通り別（古いリードに触らない）')
}

console.log('\n--- 以前に別サイトとまとめたリードで、最初の依頼が30日以上あとに再表示された ---')
{
  // 8/1 引越し侍（111）→ 8/5 ズバット（Z5）とまとめた時に、流入元・依頼番号がズバットに上書きされた（記録の仕組みの前）
  const LEGACY = { ...OLD, site: 'ズバット', orderId: 'Z5', savedAt: iso(80), moveDate: '2026年11月15日 午前中', moveDateDetail: '2026年11月15日 午前中',
    to: '福岡市博多区', toAddress: '福岡市博多区博多駅前3-3', status: '見積り', memo: '見積り済み・返事待ち', contracted: false }
  seed(LEGACY)
  // 引越し侍の一覧で 111 が再表示 → 巡回が送り直す（希望日・引越し先は同じ）
  await call('POST', { site: '引越し侍', key: PHONE, phone: PHONE, orderId: '111', name: '山田 太郎', count: '1人', receivedAt: md,
    moveDate: '11月15日 午前中', to: '福岡県福岡市博多区', detail: true })
  t(all().length === 1, '★希望日と引越し先が同じなら、前の依頼の再表示としてまとめる（新しいリードにしない）', `${all().length}件`)
  t(all()[0].memo === '見積り済み・返事待ち' && all()[0].status === '見積り' && all()[0].receivedAt === '06/10 10:00', 'メモ・ステータス・受付日時はそのまま')
  // 表記違い（2026/11/15・番地まで）でも同じと分かる
  seed(LEGACY)
  await call('POST', { site: '価格.com', key: PHONE, phone: PHONE, orderId: 'A9', name: '山田 太郎', receivedAt: md, moveDate: '2026/11/15', toAddress: '福岡県福岡市博多区博多駅前３－３', detail: true })
  t(all().length === 1, '希望日・引越し先の表記が違っても（2026/11/15・全角の番地）同じ引越しと分かる')
  // 希望日が違う → 新しい引越し
  seed(LEGACY)
  await call('POST', { site: '引越し侍', key: PHONE, phone: PHONE, orderId: '222', name: '山田 太郎', receivedAt: md, moveDate: '03月20日 午後', to: '福岡県福岡市博多区', detail: true })
  t(all().length === 2 && oldLead().memo === '見積り済み・返事待ち', '★希望日が違えば新しい引越しとして新しいリード（古いリードはそのまま）')
  // 希望日は同じでも引越し先が違う → 新しい引越し
  seed(LEGACY)
  await call('POST', { site: '引越し侍', key: PHONE, phone: PHONE, orderId: '333', name: '山田 太郎', receivedAt: md, moveDate: '11月15日', to: '北九州市小倉北区', detail: true })
  t(all().length === 2, '希望日が同じでも引越し先が違えば新しいリード')
  // 希望日が無い → 確かめられないので新しいリード（埋もれさせない）
  seed(LEGACY)
  await call('POST', { site: '引越し侍', key: PHONE, phone: PHONE, orderId: '444', name: '山田 太郎', receivedAt: md, to: '福岡県福岡市博多区', detail: true })
  t(all().length === 2, '希望日が無くて確かめられない時は新しいリード（埋もれさせない）')
}

console.log(`\n${ok} PASS / ${ng} FAIL`)
process.exit(ng ? 1 : 0)
