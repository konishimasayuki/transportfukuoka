// 3周目：データ破損・異常入力に対する堅牢性チェック
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
    if (script.trim().startsWith('return {')) {
      const hasDef = script.includes("or ''")
      const lua = hasDef ? [get(dataKey) == null ? '' : get(dataKey), get(verKey) == null ? '0' : get(verKey)]
                         : [get(dataKey), get(verKey)]
      const arr = []; for (const v of lua) { if (v == null) break; arr.push(v) }
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
const DK = 'transportfukuoka:leads'
const { default: handler } = await import('../api/inbound.js')
const call = (h, method, body, query = {}) => new Promise(resolve => {
  const res = { setHeader() {}, statusCode: 200, status(c) { this.statusCode = c; return this },
    end() { resolve({ status: this.statusCode }) }, json(o) { resolve({ status: this.statusCode, body: o }) } }
  h({ method, body, query }, res)
})
let pass = 0, fail = 0
const check = (n, ok, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  ${n}${d ? '  … ' + d : ''}`) }

console.log('\n【I】保存データが壊れている時、全件消失させないか（最重要）')
store.clear()
store.set(DK, '[{"key":"A","name":"既存1"},{"key":"B","na')  // 途中で切れた壊れJSON
const before = get(DK)
const r = await call(handler, 'POST', { site: '引越し侍', key: 'NEW', phone: '090', name: '新規' })
check('壊れたデータを空とみなして上書きしない', get(DK) === before,
  get(DK) === before ? '元データ保持' : '★全件が上書きされた')
check('エラーとして通知される（黙って成功しない）', r.status === 500, `status=${r.status}`)

console.log('\n【J】配列でないデータが入っていた場合')
store.clear()
store.set(DK, '{"not":"an array"}')
const r2 = await call(handler, 'POST', { site: '引越し侍', key: 'N2', phone: '091', name: 'X' })
check('配列でなければ書き込まずエラー', r2.status === 500 && get(DK) === '{"not":"an array"}', `status=${r2.status}`)

console.log('\n【K】空・未作成は正常に空配列として扱う（誤検知しないこと）')
store.clear()
const r3 = await call(handler, 'POST', { site: '引越し侍', key: 'N3', phone: '092', name: 'Y' })
check('未作成キーからは正常に新規作成できる', r3.status === 200 && JSON.parse(get(DK)).length === 1, `status=${r3.status}`)
store.clear(); store.set(DK, '')
const r4 = await call(handler, 'POST', { site: '引越し侍', key: 'N4', phone: '093', name: 'Z' })
check('空文字も空配列として扱える', r4.status === 200 && JSON.parse(get(DK)).length === 1, `status=${r4.status}`)

console.log('\n【L】GET（一覧取得）でも壊れたデータを空として返さない')
store.clear()
store.set(DK, '[{"key":"A"},{"br')
const r5 = await call(handler, 'GET', undefined)
check('壊れていれば500（0件と誤表示しない）', r5.status === 500, `status=${r5.status} body=${JSON.stringify(r5.body)}`)

console.log('\n【M】異常な入力でクラッシュしないか')
store.clear()
const r6 = await call(handler, 'POST', undefined)
check('本文なしPOSTは400', r6.status === 400, `status=${r6.status}`)
const r7 = await call(handler, 'PUT', undefined)
check('本文なしPUTは400', r7.status === 400, `status=${r7.status}`)
const r8 = await call(handler, 'DELETE', undefined)
check('本文なしDELETEは400', r8.status === 400, `status=${r8.status}`)
const r9 = await call(handler, 'OPTIONS', undefined)
check('OPTIONS(CORSプリフライト)は200', r9.status === 200, `status=${r9.status}`)
const r10 = await call(handler, 'PATCH', {})
check('未対応メソッドは405', r10.status === 405, `status=${r10.status}`)

console.log('\n【N】?recent=N（拡張の新着ポーリング）が壊れていないか')
store.clear()
await call(handler, 'POST', { site: '引越し侍', key: 'R1', phone: '080', name: 'R1' })
const r11 = await call(handler, 'GET', undefined, { recent: '5' })
check('recent応答が返る', r11.status === 200 && Array.isArray(r11.body.items) && typeof r11.body.count === 'number',
  `count=${r11.body && r11.body.count}`)

console.log(`\n────────────  合計 ${pass} PASS / ${fail} FAIL  ────────────`)
process.exit(fail ? 1 : 0)
