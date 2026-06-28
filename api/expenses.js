// 月別 掲載費（広告費）の保存／取得
// 構造: { [yyyy-mm]: { samurai_single, samurai_family, zubatto, kakaku, suumo, chirashi, other, note } }
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:expenses'

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

async function setAll(obj) {
  await redis(['SET', KEY, JSON.stringify(obj || {})])
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await getAll()
      return res.json({ data })
    }
    if (req.method === 'POST') {
      const body = req.body || {}
      if (!body.month) return res.status(400).json({ error: 'month (yyyy-mm) required' })
      const all = await getAll()
      all[body.month] = { ...(all[body.month] || {}), ...body.values, updatedAt: new Date().toISOString() }
      await setAll(all)
      return res.json({ ok: true, month: body.month, values: all[body.month] })
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
