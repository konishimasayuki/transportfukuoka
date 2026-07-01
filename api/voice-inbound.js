import { toE164 } from './_twilio.js'

// Twilio の日本番号(050)に「着信」があった時に叩かれる TwiML Webhook。
// お客様が折り返し発信 → この050に着信 → 事務所(OFFICE_PHONE=0944)へ <Dial> で転送。
// Twilio Console の当該050番号の「A CALL COMES IN」に
//   https://<本番ドメイン>/api/voice-inbound （HTTP POST）を設定して使う。
//
// callerId は事務所側に表示される番号。Twilio所有/認証済み番号でないと使えないため、
// 既定は CALLER_ID(=050) を使用（＝事務所には「050からの転送」と表示される）。
const OFFICE    = process.env.OFFICE_PHONE
const CALLER_ID = process.env.CALLER_ID || process.env.TWILIO_FROM
// 転送前の任意アナウンス（空なら無音で即転送）。留守電折り返し等の案内に使える。
const INBOUND_GREETING = process.env.INBOUND_GREETING || ''

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
}

export default function handler(req, res) {
  const officeE = toE164(OFFICE)
  const callerE = toE164(CALLER_ID)

  const greeting = INBOUND_GREETING.trim()
    ? `<Say language="ja-JP" voice="Polly.Mizuki">${escapeXml(INBOUND_GREETING.trim())}</Say>`
    : ''

  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    greeting +
    `<Dial callerId="${callerE}">${officeE}</Dial>` +
    `</Response>`

  res.setHeader('Content-Type', 'text/xml; charset=utf-8')
  res.status(200).send(twiml)
}
