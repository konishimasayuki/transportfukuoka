import { placeCall, twilioReady } from './_twilio.js'
import { sendPushToAll } from './_push.js'

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

// お知らせメッセージ（/api/broadcast で保存）。?recent 応答に混ぜて子拡張へ届ける。
const BROADCAST_KEY = 'transportfukuoka:broadcasts'
async function getBroadcasts() {
  const raw = await redis(['GET', BROADCAST_KEY])
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function setItems(items) {
  await redis(['SET', KEY, JSON.stringify(items)])
}

// 重複判定（統合）キー。信頼できる識別子が無ければ null を返し、その場合は統合せず別リード扱いにする。
// 優先順位：明示key > 電話番号 > サイト+氏名+受付日時。
// ※ 以前は「サイト+氏名」だけを最終フォールバックにしていたため、
//   電話・氏名が未取得のリード（例: 一覧取得段階のリードや名前欄が空のリード）が
//   "サイト:"（空氏名）や同名で衝突し、別人のリードが統合されてしまっていた
//   （＝新着リードに他リードのメモ・ステータスが混入する不具合）。
//   氏名が空の場合はキー無し(null)とし、受付日時も含めて別リードの衝突を防ぐ。
function leadKey(lead) {
  if (lead.key) return String(lead.key)
  if (lead.phone) return String(lead.phone)
  const name = String(lead.name || '').trim()
  if (!name) return null // 電話・キー・氏名がいずれも無い → 統合しない（一意リード扱い）
  const at = String(lead.receivedAt || lead.requestedAt || '').trim()
  return `${lead.site || ''}:${name}:${at}`
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
      // 軽量モード：?recent=N で直近N件（savedAt降順）＋総数だけ返す（新着通知ポーリング用）
      // お知らせメッセージ（broadcast）も擬似リードとして混ぜ、子拡張(無改修)に通知させる。
      const recent = parseInt((req.query && req.query.recent) || '', 10)
      if (recent > 0) {
        let bcItems = []
        try {
          const bc = await getBroadcasts()
          // 子拡張の表示形式に合わせる：title→site（見出し）、body→name（本文）。
          bcItems = bc.map(b => ({
            key: 'bc_' + b.id,
            site: b.title || 'お知らせ',
            name: '📢 ' + (b.body || ''),
            savedAt: b.savedAt,
            broadcast: true,
          }))
        } catch (e) { /* broadcast取得失敗は無視 */ }
        // 実リードの直近N件は必ず確保（broadcastに枠を奪われて新着通知が消えるのを防ぐ）。
        // broadcastは“追加で”載せ、合算後に再sliceしない（実リードを絶対に押し出さない）。
        const recentLeads = [...items]
          .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
          .slice(0, recent)
        const merged = [...recentLeads, ...bcItems]
          .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
        return res.json({ count: items.length, items: merged })
      }
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
      // key が null（信頼できる識別子なし）の場合は統合対象を探さない＝必ず新規リードとして追加する。
      const idx = key ? items.findIndex(i => leadKey(i) === key) : -1
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

      // key が null のときは一意キーを発行し、以後この行が他リードへ統合されないようにする。
      const newItem = {
        ...body,
        key: key || `u:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        id: body.id || Date.now().toString(),
        savedAt: new Date().toISOString(),
      }
      await setItems([newItem, ...items])
      await maybeAutoCall(newItem)
      // 新着プッシュ通知（拡張なしのブラウザにも即時通知。失敗しても保存は止めない）
      try {
        const route = [newItem.from, newItem.to].filter(Boolean).join(' → ')
        await sendPushToAll({
          title: `🆕 新規リード（${newItem.site || ''}）`,
          body: `${(newItem.name || '名前なし')}　${newItem.phone || ''}`.trim() + (route ? `\n${route}` : ''),
          tag: newItem.key,
          url: '/',
        })
      } catch (e) { console.error('push failed:', e.message) }
      return res.json({ ok: true, duplicate: false })
    }

    if (req.method === 'PUT') {
      const body = req.body || {}
      if (!body.key && !body.phone && !body.id) {
        return res.status(400).json({ error: 'key / phone / id required' })
      }
      const items = await getItems()
      // 対象の特定は「最も確実な識別子」を1つだけ使う。
      // 以前は key/phone/id のいずれかに一致で更新していたため、同じ電話番号を持つ
      // 別リードまで一括で書き換わり、メモ・ステータスが他リードへ波及していた。
      // key があれば key のみ、無ければ id、どちらも無ければ電話で特定する。
      const matchFn = body.key ? (i => i.key === body.key)
        : body.id ? (i => i.id === body.id)
        : (i => body.phone && i.phone === body.phone)
      const updated = items.map(i => matchFn(i) ? { ...i, ...body, updatedAt: new Date().toISOString() } : i)
      await setItems(updated)
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      const items = await getItems()
      let filtered
      if (body.all === true) {
        filtered = []
      } else if (body.key || body.id || body.phone) {
        // 削除も「最も確実な識別子」を1つだけ使う（同一電話の別リードまで巻き込まないため）。
        const matchFn = body.key ? (i => i.key === body.key)
          : body.id ? (i => i.id === body.id)
          : (i => body.phone && i.phone === body.phone)
        filtered = items.filter(i => !matchFn(i))
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
