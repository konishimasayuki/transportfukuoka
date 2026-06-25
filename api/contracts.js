const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:contracts'

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

async function getItems() {
  const raw = await redis(['GET', KEY])
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function setItems(items) {
  await redis(['SET', KEY, JSON.stringify(items)])
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const items = await getItems()
      return res.json({ items })
    }

    if (req.method === 'POST') {
      const items = await getItems()
      const newItem = { ...req.body, createdAt: new Date().toISOString() }
      await setItems([newItem, ...items])
      return res.json({ ok: true })
    }

    if (req.method === 'PUT') {
      const items = await getItems()
      const updated = items.map(i => i.id === req.body.id ? { ...req.body, updatedAt: new Date().toISOString() } : i)
      await setItems(updated)
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const items = await getItems()
      await setItems(items.filter(i => i.id !== req.body.id))
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
