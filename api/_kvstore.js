// Upstash Redis(REST) 用の共有ストアヘルパー。
// 目的：配列を「読む→JSで加工→丸ごと書き戻す」際の同時書き込み競合（lost update）を防ぐ。
//
// 方式：バージョン番号による楽観ロック（compare-and-set）。
//   - 読み込みは data と version を 1 往復（EVAL）で取得。
//   - 書き込みは「version が読んだ時と同じなら SET、違えば失敗」を 1 往復（EVAL）で原子的に実行。
// 競合が無い通常時は「読み1 + 書き1」で従来（GET+SET）と同じ往復数＝リード取り込み速度は落ちない。
// 競合した時だけ短い待機で再試行する（実運用では稀）。

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

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
//   置き換わり、リードが丸ごと消える。壊れている時は書き込ませずエラーにする
//   （1件の取り込み失敗で済ませ、全件消失を防ぐ）。
function parseItems(raw, dataKey) {
  if (raw == null || raw === '') return []
  let v
  try { v = JSON.parse(raw) } catch {
    throw new Error(`stored data is corrupted (invalid JSON): ${dataKey}`)
  }
  if (!Array.isArray(v)) throw new Error(`stored data is not an array: ${dataKey}`)
  return v
}

// 単純読み込み（バージョン不要な GET エンドポイント用）。
export async function readItems(dataKey) {
  return parseItems(await redisCmd(['GET', dataKey]), dataKey)
}

// data(JSON配列) と version を 1 往復で取得。
// ★重要：Lua テーブルを RESP へ変換する際、Redis は「最初の nil で配列を打ち切る」。
//   そのため素の redis.call('GET', ...) をそのまま返すと、データキーが未作成・消失した
//   場合に後続の version まで欠落し、version を 0 と誤読 → CAS が永久に失敗して
//   全ての書き込みが 500 になる（＝リード取り込みが停止する）。
//   nil を返さないよう Lua 側で必ず既定値に落とす。
async function readVersioned(dataKey, verKey) {
  const script = "return { redis.call('GET', KEYS[1]) or '', redis.call('GET', KEYS[2]) or '0' }"
  const r = await redisCmd(['EVAL', script, '2', dataKey, verKey])
  const raw = r && r[0]
  const ver = r && r[1]
  // 壊れていれば parseItems が例外を投げる（＝書き込ませない）。
  const items = parseItems(raw, dataKey)
  return { items, version: (ver == null || ver === '' ? '0' : String(ver)) }
}

// version が期待値と一致する時だけ data と version を更新（原子的CAS）。成功=true。
async function casWrite(dataKey, verKey, expectedVersion, newRaw, newVersion) {
  const script =
    "if ((redis.call('GET', KEYS[2]) or '0') == ARGV[2]) then " +
    "redis.call('SET', KEYS[1], ARGV[1]); redis.call('SET', KEYS[2], ARGV[3]); return 1 " +
    "else return 0 end"
  const r = await redisCmd(['EVAL', script, '2', dataKey, verKey, newRaw, expectedVersion, newVersion])
  return r === 1 || r === '1'
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// 楽観ロック付き read-modify-write。
// mutator(items) は次のいずれかを返す:
//   { items: <新しい配列>, result: <呼び出し元へ返す値> }  … 書き込みあり
//   { skipWrite: true, result: <値> }                       … 変更なし（書き込み省略）
// 競合が無い通常時は「読み1 + 書き1」だけで終了し sleep もしない＝速度に影響なし。
// 競合時のみ再試行する。バックオフには必ずジッター（乱数）を入れ、再試行者が
// 同じタイミングで再衝突し続ける（lockstep）のを防ぐ。CAS は毎ラウンド必ず
// 1件は成功するため、ジッターで散らせば同時多数書き込みでも短時間で収束する。
export async function mutate(dataKey, verKey, mutator, attempts = 15) {
  for (let a = 0; a < attempts; a++) {
    const { items, version } = await readVersioned(dataKey, verKey)
    const out = mutator(items) || {}
    if (out.skipWrite) return out.result
    const newVersion = String((Number(version) || 0) + 1)
    const ok = await casWrite(dataKey, verKey, version, JSON.stringify(out.items), newVersion)
    if (ok) return out.result
    // 競合時のみ：8ms + ランダム(指数的に拡大)。ジッターで再衝突を分散させる。
    await sleep(8 + Math.floor(Math.random() * (12 * (a + 1))))
  }
  throw new Error('write conflict: retries exhausted')
}
