const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:leads'

async function redis(cmd) {
  const res = await fetch(`${REDIS_URL}/${cmd.join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  })
  const data = await res.json()
  return data.result
}

async function getItems() {
  const raw = await redis(['get', KEY])
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function setItems(items) {
  await redis(['set', KEY, encodeURIComponent(JSON.stringify(items))])
}

// 重複判定キー：明示key > 電話番号 > サイト+氏名
function leadKey(lead) {
  return lead.key || lead.phone || `${lead.site || ''}:${lead.name || ''}`
}

export default async function handler(req, res) {
  // Chrome拡張など別オリジンからの送信を許可
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const items = await getItems()
      return res.json({ items })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      if (!body.phone && !body.name && !body.key) {
        return res.status(400).json({ error: 'lead data required' })
      }
      const items = await getItems()
      const key = leadKey(body)

      // 既に取り込み済みなら何もしない（取りこぼし防止の重複排除）
      if (items.some(i => leadKey(i) === key)) {
        return res.json({ ok: true, duplicate: true })
      }

      const newItem = {
        ...body,
        key,
        id: body.id || Date.now().toString(),
        receivedAt: new Date().toISOString(),
      }
      await setItems([newItem, ...items])
      return res.json({ ok: true, duplicate: false })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
