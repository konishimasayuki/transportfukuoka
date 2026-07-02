// 担当者リストの保存／取得（Redis: transportfukuoka:staff = 文字列配列）
// 初回（未設定）は既定の担当者で初期化して返す。
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:staff'

const DEFAULT_STAFF = ['古賀', '浦田', '春木', '河村', '鷹野', '田中', 'バイト', '現場']

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
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

async function setItems(items) {
  await redis(['SET', KEY, JSON.stringify(items)])
}

const clean = (arr) => {
  const seen = new Set()
  return (arr || [])
    .map(s => String(s == null ? '' : s).trim())
    .filter(s => s && !seen.has(s) && seen.add(s))
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let items = await getItems()
      if (!Array.isArray(items)) {            // 未設定なら既定で初期化
        items = DEFAULT_STAFF.slice()
        await setItems(items)
      }
      return res.json({ items })
    }

    if (req.method === 'POST') {
      // { name } で1件追加、または { items } でまとめて置換
      const body = req.body || {}
      let items = (await getItems()) || DEFAULT_STAFF.slice()
      if (Array.isArray(body.items)) {
        items = clean(body.items)
      } else if (body.name) {
        items = clean([...items, body.name])
      } else {
        return res.status(400).json({ error: 'name or items required' })
      }
      await setItems(items)
      return res.json({ ok: true, items })
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      let items = (await getItems()) || DEFAULT_STAFF.slice()
      if (body.name) items = items.filter(s => s !== body.name)
      await setItems(items)
      return res.json({ ok: true, items })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
