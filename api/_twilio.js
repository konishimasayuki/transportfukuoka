// =====================================================================
// Twilio 発信 共通モジュール（api/ 配下だが _ 始まりのためルートにはならない）
// 顧客に発信し、応答したら社名アナウンス後に事務所へ接続（ブリッジ）する。
// 必要な環境変数（Vercel）:
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM / OFFICE_PHONE
//   (任意) CALL_MESSAGE … 冒頭アナウンス文言
// =====================================================================

const SID     = process.env.TWILIO_ACCOUNT_SID
const TOKEN   = process.env.TWILIO_AUTH_TOKEN
const FROM    = process.env.TWILIO_FROM
const OFFICE  = process.env.OFFICE_PHONE
const MESSAGE = process.env.CALL_MESSAGE ||
  'お電話ありがとうございます。トランスポート福岡です。担当者におつなぎしますので、少々お待ちください。'

export function twilioReady() {
  return !!(SID && TOKEN && FROM && OFFICE)
}

// 国内番号を E.164 へ（090-1234-5678 → +819012345678）
export function toE164(p) {
  const d = String(p || '').replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.startsWith('0'))  return '+81' + d.slice(1)
  if (d.startsWith('81')) return '+' + d
  if (d.startsWith('+'))  return d
  return '+81' + d
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
}

// 顧客(to)に発信 → 応答後にアナウンス → 事務所(OFFICE)へ接続
export async function placeCall(to) {
  if (!twilioReady()) throw new Error('Twilio env vars (SID/TOKEN/FROM/OFFICE_PHONE) missing')
  const toE = toE164(to)
  const fromE = toE164(FROM)
  const officeE = toE164(OFFICE)
  if (!toE) throw new Error('invalid destination number')

  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say language="ja-JP" voice="Polly.Mizuki">${escapeXml(MESSAGE)}</Say>` +
    `<Dial callerId="${fromE}">${officeE}</Dial>` +
    `</Response>`

  const body = new URLSearchParams({ To: toE, From: fromE, Twiml: twiml })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Twilio: ' + (data.message || res.status))
  return data
}
