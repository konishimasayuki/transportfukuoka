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

// 番号を E.164 へ。既に + 付き（例 +15075415802 の米国番号）はそのまま使う。
// 国内表記（0944-.. / 090-..）だけ +81 に変換する。
export function toE164(p) {
  const s = String(p || '').trim()
  if (!s) return ''
  if (s.startsWith('+')) return '+' + s.replace(/[^0-9]/g, '') // 既に国際表記 → 記号だけ除去して維持
  const d = s.replace(/[^0-9]/g, '')
  if (!d) return ''
  if (d.startsWith('0'))  return '+81' + d.slice(1) // 国内 0始まり → 日本
  if (d.startsWith('81')) return '+' + d            // 81始まり
  return '+81' + d                                  // それ以外は国内番号として扱う
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
}

// 顧客(to)に発信 → 応答後にアナウンス → 事務所(OFFICE)へ接続
// message を渡すと冒頭アナウンスをその文言に差し替え（デバッグの音声テスト用）
export async function placeCall(to, message) {
  if (!twilioReady()) throw new Error('Twilio env vars (SID/TOKEN/FROM/OFFICE_PHONE) missing')
  const toE = toE164(to)
  const fromE = toE164(FROM)
  const officeE = toE164(OFFICE)
  if (!toE) throw new Error('invalid destination number')

  const msg = (message && String(message).trim()) || MESSAGE
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Say language="ja-JP" voice="Polly.Mizuki">${escapeXml(msg)}</Say>` +
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

// 発信済み通話の結果を取得（SID指定）。status: queued/ringing/in-progress/completed/busy/no-answer/failed/canceled
export async function getCallStatus(sid) {
  if (!twilioReady()) throw new Error('Twilio env vars missing')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls/${encodeURIComponent(sid)}.json`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64') },
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Twilio: ' + (data.message || res.status))
  return { status: data.status, duration: data.duration, to: data.to, from: data.from }
}
