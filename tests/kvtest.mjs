// 楽観ロック(_kvstore.js)の検証：メモリ内でRedis(GET/SET/EVAL)を模倣し、
// 「同時書き込みで取りこぼしが起きないこと」を確認する。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'

const store = new Map()
let evalCalls = 0

// 実際のfetchを差し替え、コマンド配列を解釈するモックにする。
// 小さな遅延を入れて2つのmutateを本当に並行させ、read→writeを競合させる。
globalThis.fetch = async (url, opts) => {
  const cmd = JSON.parse(opts.body)
  await new Promise(r => setTimeout(r, 3)) // 往復遅延を模倣（並行interleaveを誘発）
  let result
  const op = cmd[0]
  if (op === 'GET') {
    result = store.has(cmd[1]) ? store.get(cmd[1]) : null
  } else if (op === 'SET') {
    store.set(cmd[1], cmd[2]); result = 'OK'
  } else if (op === 'EVAL') {
    evalCalls++
    const script = cmd[1]
    const dataKey = cmd[3], verKey = cmd[4]
    if (script.trim().startsWith('return {')) {
      // readVersioned
      result = [store.has(dataKey) ? store.get(dataKey) : null,
                store.has(verKey) ? store.get(verKey) : null]
    } else {
      // casWrite: ARGV1=newRaw, ARGV2=expectedVersion, ARGV3=newVersion
      const newRaw = cmd[5], expected = cmd[6], newVersion = cmd[7]
      const cur = store.has(verKey) ? store.get(verKey) : '0'
      if (String(cur) === String(expected)) {
        store.set(dataKey, newRaw); store.set(verKey, newVersion); result = 1
      } else {
        result = 0
      }
    }
  } else {
    throw new Error('unexpected cmd ' + op)
  }
  return { json: async () => ({ result }) }
}

const { mutate, readItems } = await import('../api/_kvstore.js')

const KEY = 'k', VER = 'k:ver'

// --- テスト1：10件の同時追加で1件も失われないこと ---
store.clear(); evalCalls = 0
const N = 10
await Promise.all(Array.from({ length: N }, (_, i) =>
  mutate(KEY, VER, (items) => ({ items: [{ id: 'lead' + i }, ...items], result: { ok: true } }))
))
const after = await readItems(KEY)
const ids = new Set(after.map(x => x.id))
console.log(`テスト1 同時追加: 期待${N}件 → 実際${after.length}件, ユニーク${ids.size}件 ... ` +
  (after.length === N && ids.size === N ? 'PASS ✅' : 'FAIL ❌'))

// --- テスト2：同一レコードへの同時マージ更新（両方の変更が残ること） ---
store.clear()
store.set(KEY, JSON.stringify([{ id: 'a', memo: '', status: '' }]))
store.set(VER, '0')
await Promise.all([
  mutate(KEY, VER, (items) => ({
    items: items.map(i => i.id === 'a' ? { ...i, memo: 'メモ更新' } : i), result: {}
  })),
  mutate(KEY, VER, (items) => ({
    items: items.map(i => i.id === 'a' ? { ...i, status: '対応中' } : i), result: {}
  })),
])
const rec = (await readItems(KEY))[0]
console.log(`テスト2 同時マージ: memo="${rec.memo}" status="${rec.status}" ... ` +
  (rec.memo === 'メモ更新' && rec.status === '対応中' ? 'PASS ✅ (どちらも保持)' : 'FAIL ❌ (取りこぼし)'))

// --- テスト3：skipWrite は書き込まない（バージョンを進めない） ---
store.clear()
store.set(KEY, JSON.stringify([{ id: 'a' }]))
store.set(VER, '5')
const r3 = await mutate(KEY, VER, () => ({ skipWrite: true, result: { ok: true, noop: true } }))
console.log(`テスト3 skipWrite: ver=${store.get(VER)} result=${JSON.stringify(r3)} ... ` +
  (store.get(VER) === '5' && r3.noop ? 'PASS ✅' : 'FAIL ❌'))

// --- テスト4：contracts POST dedup（同一idは二重登録しない） ---
store.clear()
store.set(KEY, JSON.stringify([]))
store.set(VER, '0')
const postContract = (body) => mutate(KEY, VER, (items) => {
  if (body.id && items.some(i => i.id === body.id)) {
    return { skipWrite: true, result: { ok: true, duplicate: true } }
  }
  return { items: [{ ...body }, ...items], result: { ok: true, duplicate: false } }
})
const p1 = await postContract({ id: 'C1', name: '田中' })
const p2 = await postContract({ id: 'C1', name: '田中' }) // 再送
const cs = await readItems(KEY)
console.log(`テスト4 契約dedup: 件数${cs.length} p1=${p1.duplicate} p2=${p2.duplicate} ... ` +
  (cs.length === 1 && p1.duplicate === false && p2.duplicate === true ? 'PASS ✅' : 'FAIL ❌'))

console.log('\n（並行テスト中の総EVAL往復数 = 競合再試行が最小限であることの目安）')
