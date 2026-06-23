import { placeCall, twilioReady } from './_twilio.js'

// 手動発信＆発信テスト用エンドポイント
// POST { phone: "090-..." } → その番号に発信し、応答後に事務所へ接続
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    // 設定確認用（番号などは返さない）
    return res.json({ ready: twilioReady() })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { phone } = req.body || {}
  if (!phone) return res.status(400).json({ error: 'phone required' })

  try {
    const r = await placeCall(phone)
    return res.json({ ok: true, sid: r.sid, status: r.status })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
