// 監視の生存ステータス（ハートビート）保存／取得
// 拡張機能が取得サイクルごとに POST し、CRM が GET して「監視：正常/未接続」を表示する。
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:status'          // 旧: 単一ステータス（ズバット・後方互換）
const MAP_KEY = 'transportfukuoka:statusmap'   // 新: サイト別ステータス（hash: source→JSON）

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

export default async function handler(req, res) {
  // Chrome拡張など別オリジンからの送信を許可
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      // サイト別ステータス（hash）を取得
      const arr = await redis(['HGETALL', MAP_KEY]) // [field, value, field, value, ...]
      const statuses = {}
      if (Array.isArray(arr)) {
        for (let i = 0; i + 1 < arr.length; i += 2) {
          try { statuses[arr[i]] = JSON.parse(arr[i + 1]) } catch { /* skip */ }
        }
      }
      // 後方互換：旧単一キーも読み、zba が無ければ補完
      if (!statuses.zba) {
        const raw = await redis(['GET', KEY])
        try { if (raw) statuses.zba = JSON.parse(raw) } catch { /* skip */ }
      }
      return res.json({ statuses, status: statuses.zba || null })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const source = body.source || 'zba'
      const status = {
        source,
        ok: body.ok !== false,
        reason: body.reason || '',
        count: body.count != null ? body.count : null,
        at: new Date().toISOString(),
      }
      await redis(['HSET', MAP_KEY, source, JSON.stringify(status)])
      if (source === 'zba') await redis(['SET', KEY, JSON.stringify(status)]) // 後方互換
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
