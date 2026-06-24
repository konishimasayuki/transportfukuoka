import { placeCall, twilioReady } from './_twilio.js'

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:leads'

// 新規リード検知時の自動架電（既定OFF。TWILIO_AUTOCALL=on で有効）
// 安全策：営業時間（JST 9:00〜20:00）内のみ・失敗しても保存は止めない
async function maybeAutoCall(lead) {
  if (process.env.TWILIO_AUTOCALL !== 'on') return
  if (!twilioReady() || !lead.phone) return
  const jstHour = (new Date().getUTCHours() + 9) % 24
  if (jstHour < 9 || jstHour >= 20) return
  try { await placeCall(lead.phone) } catch (e) { console.error('autocall failed:', e.message) }
}

async function redis(command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    throw new Error('Redis env vars (UPSTASH_REDIS_REST_URL / _TOKEN) missing')
  }
  // Upstash REST: コマンドをJSON配列でPOST（値をボディで送るのでURLエンコード不要・日本語/長文も安全）
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

// 重複判定キー：明示key > 電話番号 > サイト+氏名
function leadKey(lead) {
  return lead.key || lead.phone || `${lead.site || ''}:${lead.name || ''}`
}

export default async function handler(req, res) {
  // Chrome拡張など別オリジンからの送信を許可
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
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

      // 既に取り込み済み：空でない新フィールドだけマージ（詳細ページ取得で情報を充実させる）
      const idx = items.findIndex(i => leadKey(i) === key)
      if (idx !== -1) {
        const next = { ...items[idx] }
        let changed = false
        for (const [k, v] of Object.entries(body)) {
          if (k === 'key' || k === 'id' || k === 'savedAt') continue
          const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0)
          if (!empty && JSON.stringify(next[k]) !== JSON.stringify(v)) { next[k] = v; changed = true }
        }
        if (changed) {
          next.updatedAt = new Date().toISOString()
          items[idx] = next
          await setItems(items)
        }
        return res.json({ ok: true, duplicate: true, merged: changed })
      }

      const newItem = {
        ...body,
        key,
        id: body.id || Date.now().toString(),
        savedAt: new Date().toISOString(),
      }
      await setItems([newItem, ...items])
      await maybeAutoCall(newItem)
      return res.json({ ok: true, duplicate: false })
    }

    if (req.method === 'PUT') {
      const body = req.body || {}
      if (!body.key && !body.phone && !body.id) {
        return res.status(400).json({ error: 'key / phone / id required' })
      }
      const items = await getItems()
      const updated = items.map(i => (
        (body.key && i.key === body.key) ||
        (body.phone && i.phone === body.phone) ||
        (body.id && i.id === body.id)
      ) ? { ...i, ...body, updatedAt: new Date().toISOString() } : i)
      await setItems(updated)
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      const items = await getItems()
      let filtered
      if (body.all === true) {
        filtered = []
      } else if (body.phone || body.key || body.id) {
        filtered = items.filter(i => !(
          (body.phone && i.phone === body.phone) ||
          (body.key && i.key === body.key) ||
          (body.id && i.id === body.id)
        ))
      } else {
        return res.status(400).json({ error: 'phone / key / id or all:true required' })
      }
      const removed = items.length - filtered.length
      await setItems(filtered)
      return res.json({ ok: true, removed })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
