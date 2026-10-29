// Upstash Redis(REST) 用の共有ストアヘルパー。
// 目的：配列を「読む→JSで加工→丸ごと書き戻す」際の同時書き込み競合（lost update）を防ぐ。
//
// 方式：バージョン番号による楽観ロック（compare-and-set）。
//   - 読み込みは data と version を 1 往復（EVAL）で取得。
//   - 書き込みは「version が読んだ時と同じなら更新、違えば失敗」を 1 往復（EVAL）で原子的に実行。
// 競合が無い通常時は「読み1 + 書き1」。競合した時だけ短い待機で再試行する（実運用では稀）。
//
// ★リード（transportfukuoka:leads）だけは「1件ずつ分けて保存」する（分割保存）。
//   以前は全件を1つの値に入れて丸ごと書き戻していたため、全件が約8MBを超えた時点で
//   Upstash の1回あたりの送信上限（10MB）を超え、メモ保存・新着取り込みなど全ての書き込みが
//   「ERR max request size exceeded」で失敗した。
//   分割保存では、変わったリードだけを送るので、1回の送信は数KB〜数百KBで済む。
//     <key>:h      … ハッシュ（項目名=保存ID、値=リード1件のJSON）
//     <key>:order  … 並び順（保存IDの配列。JSON）
//     verKey       … 版（従来どおり）
//   呼び出し側（mutate / readItems など）の使い方は変わらない（配列を受け取り配列を返す）。
//   旧形式（<key> に全件のJSON）が残っていれば、最初に読んだ時に自動で分割保存へ移す。
//   移した後の旧データは <key>:backup に名前を変えて残す（消さない）。

import { randomBytes } from 'node:crypto'

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

// 分割保存にするキー
const SPLIT_KEYS = new Set(['transportfukuoka:leads'])

// 1回の送信の安全上限（Upstash の上限 10MB より余裕を持たせる）
const SAFE_REQUEST_BYTES = 9 * 1024 * 1024
// 移行時の1回あたりの送信量の目安
const MIGRATE_BATCH_BYTES = 2 * 1024 * 1024

export async function redisCmd(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Redis env vars (UPSTASH_REDIS_REST_URL / _TOKEN) missing')
  }
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const data = await res.json()
  if (data.error) throw new Error('Redis error: ' + data.error)
  return data.result
}

// 保存済みJSONを配列に戻す。
// ★重要：壊れたJSONを「空配列」として扱ってはならない。
//   そのまま read-modify-write を続けると、次の書き込みで全件が1件の配列に
//   置き換わり、リードが丸ごと消える。壊れている時は書き込ませずエラーにする。
function parseItems(raw, dataKey) {
  if (raw == null || raw === '') return []
  let v
  try { v = JSON.parse(raw) } catch {
    throw new Error(`stored data is corrupted (invalid JSON): ${dataKey}`)
  }
  if (!Array.isArray(v)) throw new Error(`stored data is not an array: ${dataKey}`)
  return v
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// =====================================================================
// 分割保存（リード用）
// =====================================================================

// 目次（並び順）に持たせる項目。リードを探す（key/id/電話）・件数を数える（サイト/ステータス/日時）のに使う。
// 目次は本体と同じ1回の書き込みで更新するので、本体とずれることはない。
// 目次の1件 = [保存ID, key, id, phone, site, status, savedAt, receivedAt]
const DIR_FIELDS = ['key', 'id', 'phone', 'site', 'status', 'savedAt', 'receivedAt']
const dirEntry = (sid, item) => [sid, ...DIR_FIELDS.map(f => (item && item[f] !== undefined ? item[f] : null))]
// 目次の1件 → 探す・数える用の軽いオブジェクト（__sid に保存ID）
function entryObj(e) {
  const o = { __sid: e[0] }
  DIR_FIELDS.forEach((f, i) => { if (e[i + 1] !== null && e[i + 1] !== undefined) o[f] = e[i + 1] })
  return o
}
// 目次の要素から保存IDを取り出す（旧形式は保存IDの文字列だけ）
const sidOf = (e) => (Array.isArray(e) ? e[0] : e)

const hashKey   = (k) => k + ':h'
const orderKey  = (k) => k + ':order'
const backupKey = (k) => k + ':backup'
const lockKey   = (k) => k + ':migrating'

function newSid(used) {
  for (;;) {
    const sid = Date.now().toString(36) + randomBytes(5).toString('hex')
    if (!used.has(sid)) { used.add(sid); return sid }
  }
}

// 並び順・版・全件を1往復（原子的）で読む。
// 並び順が無い（未移行・データなし）時は先頭を '' で返す。
// ★Lua の配列は nil で打ち切られるため、nil を返さないよう必ず既定値に落とす。
const READ_SPLIT_SCRIPT =
  "local o = redis.call('GET', KEYS[2]) " +
  "local v = redis.call('GET', KEYS[3]) or '0' " +
  "if not o then return { '', v, {} } end " +
  "return { o, v, redis.call('HGETALL', KEYS[1]) }"

// 版が一致する時だけ、変わったリードの書き込み・消えたリードの削除・並び順・版の更新を行う。
// ARGV: [期待する版, 新しい版, 書く件数, (保存ID, JSON)..., 消す件数, 保存ID..., 並び順を書くか('1'/'0'), 並び順JSON]
const WRITE_SPLIT_SCRIPT =
  "if (redis.call('GET', KEYS[3]) or '0') ~= ARGV[1] then return 0 end " +
  "local i = 3 " +
  "local n = tonumber(ARGV[i]); i = i + 1 " +
  "for k = 1, n do redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1]); i = i + 2 end " +
  "local d = tonumber(ARGV[i]); i = i + 1 " +
  "for k = 1, d do redis.call('HDEL', KEYS[1], ARGV[i]); i = i + 1 end " +
  "if ARGV[i] == '1' then redis.call('SET', KEYS[2], ARGV[i + 1]) end " +
  "redis.call('SET', KEYS[3], ARGV[2]) " +
  "return 1"

// 旧形式（全件を1つの値）から分割保存へ移す。版は変えない（サマリの版と食い違わないように）。
async function migrateToSplit(dataKey) {
  // 同時に複数の処理が移行しないよう鍵をかける（2分で自動解除）
  const got = await redisCmd(['SET', lockKey(dataKey), '1', 'NX', 'EX', 120])
  if (got !== 'OK') return false // 他の処理が移行中 → 呼び出し側で待って読み直す
  try {
    // 鍵を取る間に他の処理が移行を終えていないか確認
    if (await redisCmd(['EXISTS', orderKey(dataKey)])) return true
    const raw = await redisCmd(['GET', dataKey])
    const items = parseItems(raw, dataKey) // 壊れていれば例外（＝移行しない）
    // 途中で止まった前回の移行の残りを消してから入れ直す
    await redisCmd(['DEL', hashKey(dataKey)])
    const used = new Set()
    const order = []
    let batch = [], batchBytes = 0
    const flush = async () => {
      if (!batch.length) return
      await redisCmd(['HSET', hashKey(dataKey), ...batch])
      batch = []; batchBytes = 0
    }
    for (const item of items) {
      const sid = newSid(used)
      const json = JSON.stringify(item)
      order.push(dirEntry(sid, item))
      batch.push(sid, json)
      batchBytes += Buffer.byteLength(json) + 40
      if (batchBytes >= MIGRATE_BATCH_BYTES) await flush()
    }
    await flush()
    // 最後に並び順を書いて移行完了。旧データは消さずに backup へ名前を変える。
    const finish =
      "redis.call('SET', KEYS[2], ARGV[1]) " +
      "if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('RENAME', KEYS[1], KEYS[3]) end " +
      "return 1"
    await redisCmd(['EVAL', finish, 3, dataKey, orderKey(dataKey), backupKey(dataKey), JSON.stringify(order)])
    return true
  } finally {
    await redisCmd(['DEL', lockKey(dataKey)]).catch(() => {})
  }
}

// 分割保存を読む。items に加えて、書き込みの差分を出すための元情報（state）を返す。
async function readSplit(dataKey, verKey) {
  for (let a = 0; a < 90; a++) {
    const r = await redisCmd(['EVAL', READ_SPLIT_SCRIPT, 3, hashKey(dataKey), orderKey(dataKey), verKey])
    const orderRaw = r && r[0]
    const version = (r && r[1] != null && r[1] !== '') ? String(r[1]) : '0'
    if (orderRaw) {
      const order = parseItems(orderRaw, orderKey(dataKey))
      const flat = (r && r[2]) || []
      const byId = new Map()
      for (let i = 0; i + 1 < flat.length; i += 2) byId.set(flat[i], flat[i + 1])
      const items = []
      const refs = new Map()   // 読んだオブジェクト → 保存ID（変更されていない物を素早く見分ける）
      const rawToSids = new Map() // JSON文字列 → 保存ID（作り直されただけで中身が同じ物を見分ける）
      for (const e of order) {
        const sid = sidOf(e)
        const raw = byId.get(sid)
        if (raw == null) continue // 並び順にあって本体が無い（通常起きない）→ 飛ばす
        let item
        try { item = JSON.parse(raw) } catch {
          throw new Error(`stored data is corrupted (invalid JSON): ${hashKey(dataKey)} ${sid}`)
        }
        items.push(item)
        refs.set(item, sid)
        if (!rawToSids.has(raw)) rawToSids.set(raw, [])
        rawToSids.get(raw).push(sid)
      }
      return { items, version, state: { orderRaw, sids: new Set(byId.keys()), refs, rawToSids } }
    }
    // 並び順が無い：旧形式が残っていれば移行、何も無ければ空
    const oldExists = await redisCmd(['EXISTS', dataKey])
    if (!oldExists) {
      return { items: [], version, state: { orderRaw: '', sids: new Set(), refs: new Map(), rawToSids: new Map() } }
    }
    const done = await migrateToSplit(dataKey)
    if (!done) await sleep(1000) // 他の処理が移行中 → 少し待って読み直す
  }
  throw new Error('migration in progress: please retry')
}

// 新しい配列と読んだ時の状態から、変わった分だけを版付きで書く。成功=true。
async function writeSplit(dataKey, verKey, expectedVersion, state, newItems, newVersion) {
  const usedOld = new Set() // 再利用した旧保存ID
  const allIds = new Set(state.sids)
  const order = []
  const sets = []
  for (const item of newItems) {
    // ① 読んだオブジェクトそのまま（変更なし）
    const refSid = state.refs.get(item)
    if (refSid && !usedOld.has(refSid)) { usedOld.add(refSid); order.push(dirEntry(refSid, item)); continue }
    // ② 作り直されたが中身が同じ
    const json = JSON.stringify(item)
    const cand = state.rawToSids.get(json)
    const same = cand && cand.find(s => !usedOld.has(s))
    if (same) { usedOld.add(same); order.push(dirEntry(same, item)); continue }
    // ③ 新規 or 変更 → 新しい保存IDで書く（古い方は下で消える）
    const sid = newSid(allIds)
    order.push(dirEntry(sid, item))
    sets.push(sid, json)
  }
  const dels = [...state.sids].filter(s => !usedOld.has(s))
  const orderRaw = JSON.stringify(order)
  const writeOrder = orderRaw !== state.orderRaw
  const args = [expectedVersion, newVersion, String(sets.length / 2), ...sets, String(dels.length), ...dels,
    writeOrder ? '1' : '0', writeOrder ? orderRaw : '']
  const cmd = ['EVAL', WRITE_SPLIT_SCRIPT, 3, hashKey(dataKey), orderKey(dataKey), verKey, ...args]
  const bytes = Buffer.byteLength(JSON.stringify(cmd))
  if (bytes > SAFE_REQUEST_BYTES) {
    throw new Error(`too many changes in one write (${Math.round(bytes / 1024 / 1024)}MB): ${dataKey}`)
  }
  const r = await redisCmd(cmd)
  return r === 1 || r === '1'
}

// ---------------------------------------------------------------------
// 1件だけ読んで1件だけ書く（分割保存のキー専用）
// ---------------------------------------------------------------------
// 全件（約10MB）を読まず、目次（全件の数%）と対象の1件だけを読む。
//   pick(entries)   … 目次（軽いオブジェクトの配列。並びは本体と同じ）から対象の位置を返す。無ければ -1
//   update(item)    … 対象の1件を受け取り { item: 新しい1件, result } か { skipWrite: true, result } を返す
//   extraSids(entries) … 書き込みと同時に読みたい他のリードの保存ID（サマリ用）。書き込み後の目次が渡る
// 戻り値：
//   { fallback: true }                         … この方式では扱えない（呼び出し側で従来の全件方式に切り替える）
//   { notFound: true }                         … 対象が見つからない
//   { skipped: true, result }                  … 変更なし
//   { result, version, entries, fetched }      … 書き込み済み。entries は書き込み後の目次、fetched は 保存ID→リード
// 版（version）は全件方式と共通。全件方式の書き込みと同時に起きても、版の照合で必ずどちらかがやり直す。
const READ_DIR_SCRIPT =
  "local o = redis.call('GET', KEYS[1]) " +
  "local v = redis.call('GET', KEYS[2]) or '0' " +
  "if not o then return { '', v } end " +
  "return { o, v }"

// ARGV: [期待する版, 新しい版, 保存ID, JSON, 目次を書くか('1'/'0'), 目次JSON, 同時に読む保存ID...]
const WRITE_ONE_SCRIPT =
  "if (redis.call('GET', KEYS[3]) or '0') ~= ARGV[1] then return { 0 } end " +
  "redis.call('HSET', KEYS[1], ARGV[3], ARGV[4]) " +
  "if ARGV[5] == '1' then redis.call('SET', KEYS[2], ARGV[6]) end " +
  "redis.call('SET', KEYS[3], ARGV[2]) " +
  "if #ARGV > 6 then return { 1, redis.call('HMGET', KEYS[1], unpack(ARGV, 7)) } end " +
  "return { 1, {} }"

export async function updateOne(dataKey, verKey, { pick, update, extraSids }, attempts = 15) {
  if (!SPLIT_KEYS.has(dataKey)) return { fallback: true }
  for (let a = 0; a < attempts; a++) {
    const r = await redisCmd(['EVAL', READ_DIR_SCRIPT, 2, orderKey(dataKey), verKey])
    const orderRaw = r && r[0]
    const version = (r && r[1] != null && r[1] !== '') ? String(r[1]) : '0'
    if (!orderRaw) return { fallback: true } // 未移行・データなし
    const dir = parseItems(orderRaw, orderKey(dataKey))
    if (dir.some(e => !Array.isArray(e) || e.length !== DIR_FIELDS.length + 1)) return { fallback: true } // 目次が旧形式
    const entries = dir.map(entryObj)
    const idx = pick(entries)
    if (idx === -1) return { notFound: true }
    const sid = entries[idx].__sid
    const raw = await redisCmd(['HGET', hashKey(dataKey), sid])
    if (raw == null) return { fallback: true } // 目次にあって本体が無い（通常起きない）
    let item
    try { item = JSON.parse(raw) } catch {
      throw new Error(`stored data is corrupted (invalid JSON): ${hashKey(dataKey)} ${sid}`)
    }
    const out = update(item) || {}
    if (out.skipWrite) return { skipped: true, result: out.result }
    const newItem = out.item
    if (!newItem || typeof newItem !== 'object' || Array.isArray(newItem)) throw new Error('update must return item object')
    const json = JSON.stringify(newItem)
    const newDir = dir.slice()
    newDir[idx] = dirEntry(sid, newItem)
    const dirChanged = JSON.stringify(newDir[idx]) !== JSON.stringify(dir[idx])
    const newEntries = dirChanged ? newDir.map(entryObj) : entries
    const want = extraSids ? [...new Set(extraSids(newEntries))].filter(s => s !== sid) : []
    const newVersion = String((Number(version) || 0) + 1)
    const cmd = ['EVAL', WRITE_ONE_SCRIPT, 3, hashKey(dataKey), orderKey(dataKey), verKey,
      version, newVersion, sid, json, dirChanged ? '1' : '0', dirChanged ? JSON.stringify(newDir) : '', ...want]
    if (Buffer.byteLength(JSON.stringify(cmd)) > SAFE_REQUEST_BYTES) return { fallback: true }
    const w = await redisCmd(cmd)
    if (w && (w[0] === 1 || w[0] === '1')) {
      const fetched = new Map([[sid, newItem]])
      const vals = (w[1]) || []
      want.forEach((s, i) => {
        const v = vals[i]
        if (v == null) return
        try { fetched.set(s, JSON.parse(v)) } catch { /* 読めない物はサマリを作らない（次回作り直し） */ }
      })
      return { result: out.result, version: newVersion, entries: newEntries, fetched }
    }
    // 版が変わっていた（他の書き込みと競合）→ 少し待ってやり直す
    await sleep(8 + Math.floor(Math.random() * (12 * (a + 1))))
  }
  throw new Error('write conflict: retries exhausted')
}

// =====================================================================
// 従来の単一値保存（リード以外：成約・見積書など）
// =====================================================================

// data(JSON配列) と version を 1 往復で取得。
// ★重要：Lua テーブルを RESP へ変換する際、Redis は「最初の nil で配列を打ち切る」。
//   nil を返さないよう Lua 側で必ず既定値に落とす。
async function readSingle(dataKey, verKey) {
  const script = "return { redis.call('GET', KEYS[1]) or '', redis.call('GET', KEYS[2]) or '0' }"
  const r = await redisCmd(['EVAL', script, 2, dataKey, verKey])
  const raw = r && r[0]
  const ver = r && r[1]
  const items = parseItems(raw, dataKey)
  return { items, version: (ver == null || ver === '' ? '0' : String(ver)) }
}

// version が期待値と一致する時だけ data と version を更新（原子的CAS）。成功=true。
async function casWrite(dataKey, verKey, expectedVersion, newRaw, newVersion) {
  const script =
    "if ((redis.call('GET', KEYS[2]) or '0') == ARGV[2]) then " +
    "redis.call('SET', KEYS[1], ARGV[1]); redis.call('SET', KEYS[2], ARGV[3]); return 1 " +
    "else return 0 end"
  const r = await redisCmd(['EVAL', script, 2, dataKey, verKey, newRaw, expectedVersion, newVersion])
  return r === 1 || r === '1'
}

// =====================================================================
// 公開する関数（呼び出し側の使い方は従来どおり）
// =====================================================================

// 単純読み込み（バージョン不要な GET エンドポイント用）。
export async function readItems(dataKey) {
  if (SPLIT_KEYS.has(dataKey)) return (await readSplit(dataKey, dataKey + ':ver')).items
  return parseItems(await redisCmd(['GET', dataKey]), dataKey)
}

// data(配列) と version を取得。
export async function readVersioned(dataKey, verKey) {
  if (SPLIT_KEYS.has(dataKey)) {
    const { items, version } = await readSplit(dataKey, verKey)
    return { items, version }
  }
  return readSingle(dataKey, verKey)
}

// 楽観ロック付き read-modify-write。
// mutator(items) は次のいずれかを返す:
//   { items: <新しい配列>, result: <呼び出し元へ返す値> }  … 書き込みあり
//   { skipWrite: true, result: <値> }                       … 変更なし（書き込み省略）
// 競合時のみ再試行する。バックオフには必ずジッター（乱数）を入れ、再衝突を防ぐ。
export async function mutate(dataKey, verKey, mutator, attempts = 15) {
  return (await mutateWithVersion(dataKey, verKey, mutator, attempts)).result
}

// mutate と同じ。加えて、書き込んだ時の version を返す（書き込み省略時は null）。
export async function mutateWithVersion(dataKey, verKey, mutator, attempts = 15) {
  const split = SPLIT_KEYS.has(dataKey)
  for (let a = 0; a < attempts; a++) {
    const read = split ? await readSplit(dataKey, verKey) : await readSingle(dataKey, verKey)
    const { items, version } = read
    const out = mutator(items) || {}
    if (out.skipWrite) return { result: out.result, version: null }
    if (split && !Array.isArray(out.items)) throw new Error('mutator must return items array')
    const newVersion = String((Number(version) || 0) + 1)
    const ok = split
      ? await writeSplit(dataKey, verKey, version, read.state, out.items, newVersion)
      : await casWrite(dataKey, verKey, version, JSON.stringify(out.items), newVersion)
    if (ok) return { result: out.result, version: newVersion }
    // 競合時のみ：8ms + ランダム(指数的に拡大)。ジッターで再衝突を分散させる。
    await sleep(8 + Math.floor(Math.random() * (12 * (a + 1))))
  }
  throw new Error('write conflict: retries exhausted')
}
