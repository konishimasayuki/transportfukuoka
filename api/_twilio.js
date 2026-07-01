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

// 発信済み通話の結果＋実請求額を取得（SID指定）。
// ブリッジ方式では 親コール(=顧客レッグ) と <Dial> の子コール(=事務所レッグ) の
// 2本が発生するため、両方の price/duration を取得して合算する。
// price は Twilio が確定後に付与する「実際に請求される金額(USD, 負値)」。未確定の間は null。
// status: queued/ringing/in-progress/completed/busy/no-answer/failed/canceled
export async function getCallStatus(sid) {
  if (!twilioReady()) throw new Error('Twilio env vars missing')
  const auth = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64')
  const base = `https://api.twilio.com/2010-04-01/Accounts/${SID}`

  // 親（顧客レッグ）
  const pRes = await fetch(`${base}/Calls/${encodeURIComponent(sid)}.json`, { headers: { Authorization: auth } })
  const p = await pRes.json()
  if (!pRes.ok) throw new Error('Twilio: ' + (p.message || pRes.status))

  // 子（事務所レッグ＝<Dial>で生成される子コール群）
  let children = []
  try {
    const cRes = await fetch(`${base}/Calls.json?ParentCallSid=${encodeURIComponent(sid)}&PageSize=20`, { headers: { Authorization: auth } })
    const c = await cRes.json()
    if (cRes.ok && Array.isArray(c.calls)) children = c.calls
  } catch { /* 子取得失敗時は親のみで返す */ }

  // Twilio の price は負値文字列（例 "-0.01850"）→ 絶対値の数値に。未確定は null。
  const legOf = (x) => ({
    sid: x.sid,
    to: x.to,
    duration: x.duration != null && x.duration !== '' ? Number(x.duration) : null,
    price: x.price != null && x.price !== '' ? Math.abs(Number(x.price)) : null,
    priceUnit: x.price_unit || 'USD',
    status: x.status,
  })

  const customerLeg = legOf(p)
  const officeLegs = children.map(legOf)
  const allLegs = [customerLeg, ...officeLegs]
  const priced = allLegs.filter(l => l.price != null)
  const priceComplete = allLegs.length > 0 && priced.length === allLegs.length // 全レッグ確定済みか
  const totalPrice = priced.reduce((s, l) => s + l.price, 0)                    // 実請求合計(USD)
  const totalDuration = allLegs.reduce((s, l) => s + (l.duration || 0), 0)

  return {
    status: p.status,
    duration: customerLeg.duration, // 顧客レッグ秒（従来互換）
    to: p.to, from: p.from,
    customerLeg, officeLegs,
    totalPrice, priceComplete, priceUnit: customerLeg.priceUnit || 'USD',
    totalDuration,
  }
}
