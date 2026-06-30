// プッシュ購読の登録／解除＋公開鍵の取得
// GET    → { enabled, publicKey }（クライアントが購読に使う）
// POST   → { subscription } を保存
// DELETE → { endpoint } を解除
import { addSub, removeSub, vapidPublicKey, pushReady } from './_push.js'

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.json({ enabled: pushReady(), publicKey: vapidPublicKey() })
    }
    if (req.method === 'POST') {
      const sub = (req.body && req.body.subscription) || req.body
      await addSub(sub)
      return res.json({ ok: true })
    }
    if (req.method === 'DELETE') {
      await removeSub(req.body && req.body.endpoint)
      return res.json({ ok: true })
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
