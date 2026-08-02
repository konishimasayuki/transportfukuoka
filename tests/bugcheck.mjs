// 変更箇所のバグチェック。
// ポイント：Redis の Lua テーブル→RESP 変換は「最初の nil で切り詰められる」。
// 前回のモックはこれを再現していなかったため、忠実に再現して落とし穴を検出する。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'

const store = new Map()
const get = k => (store.has(k) ? store.get(k) : null)

globalThis.fetch = async (url, opts) => {
  const cmd = JSON.parse(opts.body); const op = cmd[0]; let result
  if (op === 'GET') result = get(cmd[1])
  else if (op === 'SET') { store.set(cmd[1], cmd[2]); result = 'OK' }
  else if (op === 'EVAL') {
    const script = cmd[1], dataKey = cmd[3], verKey = cmd[4]
    // 読み取り用スクリプトは "return {" で始まり、CAS書き込み用は "if " で始まる
    if (script.trim().startsWith('return {')) {
      // readVersioned 相当。スクリプトが既定値(or '')を持つかを反映しつつ、
      // Redis の「Luaテーブルは最初のnilで打ち切り」を忠実に再現する。
      // → 既定値を外す改変が入れば、この打ち切り再現が再びバグを検出する。
      const hasDefaults = script.includes("or ''")
      const lua = hasDefaults
        ? [get(dataKey) == null ? '' : get(dataKey), get(verKey) == null ? '0' : get(verKey)]
        : [get(dataKey), get(verKey)]
      const arr = []
      for (const v of lua) { if (v == null) break; arr.push(v) } // ★nil で打ち切り
      result = arr
    } else {
      const newRaw = cmd[5], expected = cmd[6], newVersion = cmd[7]
      const cur = get(verKey) == null ? '0' : get(verKey)
      if (String(cur) === String(expected)) { store.set(dataKey, newRaw); store.set(verKey, newVersion); result = 1 }
      else result = 0
    }
  }
  return { json: async () => ({ result }) }
}

const DK = 'transportfukuoka:leads', VK = 'transportfukuoka:leads:ver'
const { default: handler } = await import('../api/inbound.js')
const { default: contractsHandler } = await import('../api/contracts.js')
const leads = () => JSON.parse(get(DK) || '[]')

const call = (h, method, body) => new Promise(resolve => {
  const res = { setHeader() {}, statusCode: 200, status(c) { this.statusCode = c; return this },
    end() { resolve({ status: this.statusCode }) }, json(o) { resolve({ status: this.statusCode, body: o }) } }
  h({ method, body, query: {} }, res)
})
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${n}${d ? '  … ' + d : ''}`) }

console.log('\n【A】初回書き込み（データもバージョンも未作成）')
store.clear()
let r = await call(handler, 'POST', { site: '引越し侍', key: 'A1', phone: '090', name: 'テスト' })
check('新規リードを保存できる', r.status === 200 && leads().length === 1, `status=${r.status} 件数=${leads().length}`)

console.log('\n【B】本番移行時：既存データあり・バージョンキーなし（★今回の実デプロイ直後の状態）')
store.clear()
store.set(DK, JSON.stringify([{ key: 'OLD', phone: '08000000000', name: '既存', memo: '担当メモ' }]))
// バージョンキーは未作成（デプロイ前のデータはCASを通っていないため）
r = await call(handler, 'PUT', { key: 'OLD', phone: '08000000000', status: '対応中' })
const b = leads().find(x => x.key === 'OLD')
check('既存データを更新できる', r.status === 200 && b && b.status === '対応中', `status=${r.status} 更新後=${b && b.status}`)
check('既存のメモは保持される', b && b.memo === '担当メモ')
check('バージョンキーが作成される', get(VK) === '1', `ver=${get(VK)}`)

console.log('\n【C】データキーだけ消失・バージョンキーは残存（Lua nil 切り詰めの検出）')
store.clear()
store.set(VK, '7')          // バージョンだけ残る
// データキーは無い → Lua は {nil, "7"} を返し、Redis は空配列に切り詰める
r = await call(handler, 'POST', { site: '引越し侍', key: 'C1', phone: '070', name: '復旧テスト' })
check('データキー消失時でも書き込めること', r.status === 200 && leads().length === 1,
  r.status !== 200 ? `★status=${r.status} エラー=${JSON.stringify(r.body)}` : `件数=${leads().length}`)

console.log('\n【D】成約：重複登録の防止と通常登録')
store.clear()
r = await call(contractsHandler, 'POST', { id: 'C-100', name: '田中', amount: 50000 })
const r2 = await call(contractsHandler, 'POST', { id: 'C-100', name: '田中', amount: 50000 })
const cs = JSON.parse(get('transportfukuoka:contracts') || '[]')
check('成約を登録できる', r.body && r.body.duplicate === false)
check('同一idの再送は重複登録されない', r2.body && r2.body.duplicate === true && cs.length === 1, `件数=${cs.length}`)

console.log('\n【E】成約：バージョンキーなしの既存データ（本番移行時）')
store.clear()
store.set('transportfukuoka:contracts', JSON.stringify([{ id: 'OLDC', name: '既存成約' }]))
r = await call(contractsHandler, 'PUT', { id: 'OLDC', amount: 99999 })
const e = JSON.parse(get('transportfukuoka:contracts')).find(x => x.id === 'OLDC')
check('既存成約を更新できる', r.status === 200 && e && e.amount === 99999, `status=${r.status}`)

console.log('\n【F】更新対象が存在しない時（保存が黙って消えないか）')
store.clear()
store.set(DK, JSON.stringify([{ key: 'X', phone: '111', name: 'A' }]))
r = await call(handler, 'PUT', { key: 'NOTFOUND', phone: '999', memo: 'これは保存先が無い' })
check('存在しない対象への更新は404を返す', r.status === 404, `status=${r.status}`)

console.log('\n【G】同一電話が複数ある時、keyで特定できない更新は波及しない')
store.clear()
store.set(DK, JSON.stringify([{ id: 'p1', phone: '222', name: 'A' }, { id: 'p2', phone: '222', name: 'B' }])) // keyなし2件
r = await call(handler, 'PUT', { key: '222', phone: '222', memo: '波及テスト' })
const withMemo = leads().filter(x => x.memo)
check('複数一致時は誰も更新しない（波及防止）', withMemo.length === 0, `更新された件数=${withMemo.length}`)
check('その場合は404で通知される', r.status === 404, `status=${r.status}`)

console.log('\n【H】削除が1件だけであること')
store.clear()
store.set(DK, JSON.stringify([{ key: 'D1', phone: '333', name: 'A' }, { key: 'D2', phone: '333', name: 'B' }]))
r = await call(handler, 'DELETE', { key: 'D1', phone: '333' })
check('指定した1件だけ削除される', leads().length === 1 && leads()[0].key === 'D2', `残=${leads().map(x => x.key).join(',')}`)

console.log(`\n────────────  合計 ${pass} PASS / ${fail} FAIL  ────────────`)
process.exit(fail ? 1 : 0)
