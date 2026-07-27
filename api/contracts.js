import { readItems, mutate } from './_kvstore.js'

const KEY     = 'transportfukuoka:contracts'
const VER_KEY = 'transportfukuoka:contracts:ver'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const items = await readItems(KEY)
      return res.json({ items })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      // 楽観ロック付きで「読む→加工→書き戻す」を原子的に実行（同時POSTでの取りこぼし防止）。
      const result = await mutate(KEY, VER_KEY, (items) => {
        // 重複登録の防止：同一 id が既にあれば再登録しない（拡張の再送・二重送信対策）。
        if (body.id && items.some(i => i.id === body.id)) {
          return { skipWrite: true, result: { ok: true, duplicate: true } }
        }
        const newItem = { ...body, createdAt: new Date().toISOString() }
        return { items: [newItem, ...items], result: { ok: true, duplicate: false } }
      })
      return res.json(result)
    }

    if (req.method === 'PUT') {
      const b = req.body || {}
      if (!b.id && !b.leadKey) {
        return res.status(400).json({ error: 'id or leadKey required' })
      }
      await mutate(KEY, VER_KEY, (items) => {
        let updated
        if (b.id) {
          updated = items.map(i => i.id === b.id ? { ...i, ...b, updatedAt: new Date().toISOString() } : i)
        } else {
          // リード側からの同期（金額変更等）。leadKeyで紐づく成約をマージ更新する。
          updated = items.map(i => (i.leadKey && i.leadKey === b.leadKey) ? { ...i, ...b, updatedAt: new Date().toISOString() } : i)
        }
        return { items: updated, result: { ok: true } }
      })
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const id = req.body && req.body.id
      await mutate(KEY, VER_KEY, (items) => ({
        items: items.filter(i => i.id !== id),
        result: { ok: true },
      }))
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
