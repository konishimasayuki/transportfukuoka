// 実handler(api/inbound.js)を使った総合監査。
// 「メモ・ステータスが勝手に書き換わる」経路が本当に塞がっているかを、
// 実運用と同じ順序（巡回POST → 担当者PUT → 再巡回POST）で検証する。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'

const store = new Map()
globalThis.fetch = async (url, opts) => {
  const cmd = JSON.parse(opts.body); const op = cmd[0]; let result
  if (op === 'GET') result = store.has(cmd[1]) ? store.get(cmd[1]) : null
  else if (op === 'SET') { store.set(cmd[1], cmd[2]); result = 'OK' }
  else if (op === 'EVAL') {
    const script = cmd[1], dataKey = cmd[3], verKey = cmd[4]
    if (script.trim().startsWith('return {')) {
      result = [store.has(dataKey) ? store.get(dataKey) : null, store.has(verKey) ? store.get(verKey) : null]
    } else {
      const newRaw = cmd[5], expected = cmd[6], newVersion = cmd[7]
      const cur = store.has(verKey) ? store.get(verKey) : '0'
      if (String(cur) === String(expected)) { store.set(dataKey, newRaw); store.set(verKey, newVersion); result = 1 }
      else result = 0
    }
  }
  return { json: async () => ({ result }) }
}
const { default: handler } = await import('../api/inbound.js')
const KEY = 'transportfukuoka:leads'
const call = (method, body) => new Promise(resolve => {
  const res = { setHeader() {}, statusCode: 200, status(c) { this.statusCode = c; return this },
    end() { resolve({ status: this.statusCode }) }, json(o) { resolve({ status: this.statusCode, body: o }) } }
  handler({ method, body, query: {} }, res)
})
const leads = () => JSON.parse(store.get(KEY) || '[]')
const find = (p) => leads().find(p)
let pass = 0, fail = 0
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${name}${detail ? '  … ' + detail : ''}`) }

// ───────────────────────────────────────────────
console.log('\n【1】報告された不具合の再現シナリオ（侍リード → 担当者入力 → 価格.com/ズバット再巡回）')
store.clear()
// 侍が同一電話のリードを取り込む（侍はmemo/statusを送らない）
await call('POST', { site: '引越し侍', key: '09011112222', phone: '09011112222', name: '山田太郎', request: '備考あり' })
// 担当者がCRMで入力（画面と同じPUT本文：key+phone+patch）
await call('PUT', { key: '09011112222', phone: '09011112222', memo: '17時以降に折り返し希望', memoUpdatedAt: '2026-07-27T00:00:00Z' })
await call('PUT', { key: '09011112222', phone: '09011112222', status: '対応中' })
await call('PUT', { key: '09011112222', phone: '09011112222', staff: '佐藤' })
// 価格.com が同じ電話で巡回（実物どおり memo を送る）
await call('POST', { site: '価格.com', key: '09011112222', phone: '09011112222', name: '山田太郎',
  memo: '間取り:2LDK / 階数:3 / EV:有 / 状況:未対応', detail: true })
// ズバットが同じ電話で巡回（実物どおり memo を送る）
await call('POST', { site: 'ズバット', key: '09011112222', phone: '09011112222', name: '山田太郎',
  memo: 'ズバット側の自動メモ', telStatus: '未架電', request: 'エアコン移設', detail: true })
let L = find(x => x.phone === '09011112222')
check('担当者のメモが保持されている', L.memo === '17時以降に折り返し希望', `memo="${L.memo}"`)
check('メモ最終更新が書き換わらない', L.memoUpdatedAt === '2026-07-27T00:00:00Z')
check('ステータスが保持されている', L.status === '対応中', `status="${L.status}"`)
check('担当者が保持されている', L.staff === '佐藤')
// 仕様変更：要望(request)も既に値があれば巡回で上書きしない（空欄なら埋める）
check('既に入力済みの要望は巡回で書き換わらない', L.request === '備考あり', `request="${L.request}"`)
check('リードは1件に統合されている(サイト跨ぎ統合は仕様どおり)', leads().length === 1, `${leads().length}件`)

// ───────────────────────────────────────────────
console.log('\n【2】同一電話の“別リード”への波及（旧PUTのOR一致バグの再発チェック）')
store.clear()
await call('POST', { site: '引越し侍',  key: 'S-1', phone: '09033334444', name: '田中一郎' })
await call('POST', { site: '価格.com', key: 'K-9', phone: '09033334444', name: '田中花子' }) // 同居家族など同一電話の別リード
await call('PUT',  { key: 'S-1', phone: '09033334444', status: '成約', memo: '侍側のメモ' })
const s1 = find(x => x.key === 'S-1'), k9 = find(x => x.key === 'K-9')
check('対象リードは更新される', s1.status === '成約' && s1.memo === '侍側のメモ')
check('同一電話の別リードは無傷', k9.status === undefined && k9.memo === undefined,
  `相手 status=${JSON.stringify(k9.status)} memo=${JSON.stringify(k9.memo)}`)

// ───────────────────────────────────────────────
console.log('\n【3】同姓・電話なしの別人が統合されないか（"サイト:氏名" 衝突の再発チェック）')
store.clear()
// 電話なし・キーなしの同姓リード2件（受付日時だけが違う別人）
await call('POST', { site: '引越し侍', name: '田中', receivedAt: '2026-07-20 10:00', from: 'A市' })
await call('POST', { site: '引越し侍', name: '田中', receivedAt: '2026-07-25 15:00', from: 'B市' })
check('同姓でも別リードとして2件保持される', leads().length === 2, `${leads().length}件`)
if (leads().length === 2) {
  await call('PUT', { key: leads()[0].key, memo: '片方だけのメモ' })
  check('メモが他方に混入しない', leads().filter(x => x.memo).length === 1)
}

console.log('\n【3b】CSVインポートのキー生成（クライアント側 "サイト:氏名"）で別人が統合されないか')
store.clear()
// 修正後の Leads.jsx CSVインポートは、電話がある時だけ key を送る（無ければサーバ判定に委ねる）
const csvKey = r => r.phone || undefined
const r1 = { site: '引越し侍', name: '田中', receivedAt: '2026-07-20 10:00', from: 'A市' }
const r2 = { site: '引越し侍', name: '田中', receivedAt: '2026-07-25 15:00', from: 'B市' }
await call('POST', { ...r1, key: csvKey(r1), _manual: true })
await call('POST', { ...r2, key: csvKey(r2), _manual: true })
check('CSV取り込みでも同姓の別人が統合されない', leads().length === 2,
  leads().length === 1 ? '★1件に統合された（CSVのキー生成が原因）' : `${leads().length}件`)

// ───────────────────────────────────────────────
console.log('\n【4】担当者のCSVインポートは従来どおりステータス更新できる（回帰チェック）')
store.clear()
await call('POST', { site: '引越し侍', key: '09055556666', phone: '09055556666', name: '鈴木', status: '未架電' })
await call('POST', { site: '引越し侍', key: '09055556666', phone: '09055556666', name: '鈴木', status: '成約', amount: 120000, _manual: true })
const csv = find(x => x.phone === '09055556666')
check('CSV取り込みでステータスを更新できる', csv.status === '成約', `status="${csv.status}"`)
check('CSV取り込みで金額を更新できる', csv.amount === 120000)
check('_manual フラグは保存データに残らない', csv._manual === undefined)

// ───────────────────────────────────────────────
console.log('\n【5】巡回だけは同じ本文でも上書きできない（ガードが効いている裏取り）')
store.clear()
await call('POST', { site: '引越し侍', key: '09077778888', phone: '09077778888', name: '高橋', status: '未架電' })
await call('PUT',  { key: '09077778888', phone: '09077778888', status: '成約' })
await call('POST', { site: '引越し侍', key: '09077778888', phone: '09077778888', name: '高橋', status: '未架電' }) // 巡回(=_manualなし)
check('巡回POSTはステータスを戻せない', find(x => x.phone === '09077778888').status === '成約')

// ───────────────────────────────────────────────
console.log('\n【6】新規リードはメモ・ステータス付きでも正しく作成される（ガードの副作用チェック）')
store.clear()
await call('POST', { site: '価格.com', key: 'NEW-1', phone: '09099990000', name: '新規太郎', memo: '初回メモ', status: '未架電' })
const n = find(x => x.key === 'NEW-1')
check('新規作成時はmemoが入る', n.memo === '初回メモ')
check('新規作成時はstatusが入る', n.status === '未架電')

// ───────────────────────────────────────────────
console.log('\n【7】key を持たない旧リードでも担当者の保存が空振りしないか（単一識別子化の副作用）')
store.clear()
store.set(KEY, JSON.stringify([{ id: 'old1', phone: '09012340000', name: '旧データ', site: '引越し侍' }])) // keyなし
store.set(KEY + ':ver', '0')
await call('PUT', { key: '09012340000', phone: '09012340000', memo: '旧リードへのメモ' }) // 画面は key に電話を代入して送る
const old = find(x => x.id === 'old1')
check('keyなし旧リードにもメモが保存される', old.memo === '旧リードへのメモ',
  old.memo ? '' : '★空振り：keyが無い旧リードは更新されない')

console.log(`\n────────────  合計 ${pass} PASS / ${fail} FAIL  ────────────`)
process.exit(fail ? 1 : 0)
