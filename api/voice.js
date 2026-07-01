import { toE164 } from './_twilio.js'

// Twilio が発信通話の応答時に叩く TwiML Webhook。
// MachineDetection の結果 AnsweredBy を見て動的に TwiML を返す:
//   human / unknown / 空 → msg を再生 → 事務所へ <Dial>（ブリッジ）
//   machine_* / fax      → vmsg（留守電用メッセージ）を残して <Hangup/>
// msg / vmsg はクエリ（発信時に placeCall が付与）。無ければ環境変数の既定。
const OFFICE    = process.env.OFFICE_PHONE
const CALLER_ID = process.env.CALLER_ID || process.env.TWILIO_FROM // 発信者番号（事務所番号 or FROM）
const DEFAULT_MSG = process.env.CALL_MESSAGE ||
  'お電話ありがとうございます。トランスポート福岡です。担当者におつなぎしますので、少々お待ちください。'
const DEFAULT_VM = process.env.CALL_VOICEMAIL_MESSAGE ||
  'トランスポート福岡です。引越しのお見積りを拝見しました。他社より安くご案内いたします。恐れ入りますが、折り返しご連絡いただけますようお願いいたします。'

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
}

export default function handler(req, res) {
  const q = req.query || {}
  const b = req.body || {}
  // MachineDetection の結果。DetectMessageEnd では human / machine_end_* / fax / unknown 等。
  const answeredBy = String(b.AnsweredBy || q.AnsweredBy || '').toLowerCase()
  const isMachine = answeredBy.startsWith('machine') || answeredBy === 'fax'

  const msg  = (q.msg  != null && String(q.msg)  !== '') ? String(q.msg)  : DEFAULT_MSG
  const vmsg = (q.vmsg != null && String(q.vmsg) !== '') ? String(q.vmsg) : DEFAULT_VM

  let twiml
  if (isMachine) {
    // 留守電/機械 → 留守電用メッセージを残して切断（事務所には繋がない）
    twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Say language="ja-JP" voice="Polly.Mizuki">${escapeXml(vmsg)}</Say>` +
      `<Hangup/>` +
      `</Response>`
  } else {
    // 人 / 判定不能 → 通常アナウンス → 事務所へ接続
    const fromE = toE164(CALLER_ID)
    const officeE = toE164(OFFICE)
    twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Say language="ja-JP" voice="Polly.Mizuki">${escapeXml(msg)}</Say>` +
      `<Dial callerId="${fromE}">${officeE}</Dial>` +
      `</Response>`
  }

  res.setHeader('Content-Type', 'text/xml; charset=utf-8')
  res.status(200).send(twiml)
}
