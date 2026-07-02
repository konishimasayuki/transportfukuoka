// 通知メッセージ（お知らせ）配信用。子拡張を改修せずに通知を届けるため、
// メッセージを専用キーに保存し、/api/inbound?recent=N が応答へ混ぜて返す。
// （子拡張は /api/inbound?recent=5 の新着として拾い、そのまま通知する）
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:broadcasts'
const KEEP = 20 // 保持する最新件数

async function redis(command) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Redis env vars (UPSTASH_REDIS_REST_URL / _TOKEN) missing')
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const data = await res.json()
  if (data.error) throw new Error('Redis error: ' + data.error)
  return data.result
}
async function getItems() {
  const raw = await redis(['GET', KEY])
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}
async function setItems(items) { await redis(['SET', KEY, JSON.stringify(items)]) }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      return res.json({ items: await getItems() })
    }
    if (req.method === 'POST') {
      const body = req.body || {}
      const text = String(body.body || body.message || '').trim()
      if (!text) return res.status(400).json({ error: 'message body required' })
      const items = await getItems()
      const item = {
        id: Date.now().toString(),
        title: String(body.title || '').trim(),
        body: text,
        savedAt: new Date().toISOString(),
      }
      await setItems([item, ...items].slice(0, KEEP))
      return res.json({ ok: true, item })
    }
    if (req.method === 'DELETE') {
      const body = req.body || {}
      if (body.all === true) { await setItems([]); return res.json({ ok: true, cleared: true }) }
      const items = await getItems()
      await setItems(items.filter(i => i.id !== body.id))
      return res.json({ ok: true })
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
