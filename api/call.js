import { placeCall, twilioReady, getCallStatus } from './_twilio.js'

// 手動発信＆発信テスト用エンドポイント
// POST { phone, message? } → 発信（messageで冒頭音声を差し替え可）
// GET  ?sid=... → 発信済み通話の結果（status/duration）／ paramなし → { ready }
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    const sid = req.query && req.query.sid
    if (sid) {
      try { const c = await getCallStatus(sid); return res.json({ ok: true, ...c }) }
      catch (e) { return res.status(500).json({ ok: false, error: e.message }) }
    }
    return res.json({ ready: twilioReady() })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { phone, message, voicemail } = req.body || {}
  if (!phone) return res.status(400).json({ error: 'phone required' })

  try {
    const r = await placeCall(phone, message, voicemail)
    return res.json({ ok: true, sid: r.sid, status: r.status })
  } catch (e) {
    console.error(e)
    return res.status(500).json({ ok: false, error: e.message })
  }
}
