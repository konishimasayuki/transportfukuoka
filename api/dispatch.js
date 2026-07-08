// 配車ボードの保存／取得（日付別の割当ジョブ ＋ 車両フリート設定 ＋ 手動未手配カード）
// 構造: { '_fleet': [vehicles], 'YYYY-MM-DD': { jobs:[...], manualUn:[...], updatedAt } }
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:dispatch'

async function redis(command) {
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

async function getAll() {
  const raw = await redis(['GET', KEY])
  if (!raw) return {}
  try { return JSON.parse(raw) || {} } catch { return {} }
}
async function setAll(obj) { await redis(['SET', KEY, JSON.stringify(obj || {})]) }

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.json({ data: await getAll() })
    }
    if (req.method === 'POST') {
      const body = req.body || {}
      const all = await getAll()
      if (Array.isArray(body.fleet)) all._fleet = body.fleet // 車両フリート（全日共通の設定）
      if (Array.isArray(body.crew)) all._crew = body.crew    // 乗務員(班)ラベル一覧（全日共通）
      if (body.date) { // その日の割当
        all[body.date] = { jobs: body.jobs || [], manualUn: body.manualUn || [], updatedAt: new Date().toISOString() }
      }
      await setAll(all)
      return res.json({ ok: true })
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
