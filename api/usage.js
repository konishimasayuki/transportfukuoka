// Twilio 利用実績（Usage Records）から実請求額を取得する。
// 本アカウントは 1通話ごとの Call.price が null のままのため、請求の元データである
// Usage Records（Today / ThisMonth）から実額(JPY)を集計して返す。
// GET /api/usage → { ready, today:{price,count,usage,unit}, month:{...} }
import { getJpVoicePricing, rateForNumber } from './_twilio.js'

const SID   = process.env.TWILIO_ACCOUNT_SID
const TOKEN = process.env.TWILIO_AUTH_TOKEN

function ready() { return !!(SID && TOKEN) }

async function usage(range, category = 'calls') {
  const auth = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64')
  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Usage/Records/${range}.json?Category=${encodeURIComponent(category)}&PageSize=50`
  const r = await fetch(url, { headers: { Authorization: auth } })
  const d = await r.json()
  if (!r.ok) throw new Error('Twilio: ' + (d.message || r.status))
  const recs = d.usage_records || []
  let price = 0, count = 0, usageVal = 0, unit = 'JPY', usageUnit = 'minutes'
  for (const x of recs) {
    if (x.price != null && x.price !== '') price += Math.abs(Number(x.price)) // Twilioは負値→絶対値
    count += Number(x.count || 0)
    usageVal += Number(x.usage || 0)
    if (x.price_unit) unit = x.price_unit
    if (x.usage_unit) usageUnit = x.usage_unit
  }
  return { price, count, usage: usageVal, unit, usageUnit }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!ready()) return res.json({ ready: false })
  // 診断: ?pricing=1 → 取得した料率(prefix/price)と、サンプル番号の照合結果を返す
  if (req.query && req.query.pricing) {
    try {
      const p = await getJpVoicePricing()
      const test = ['818052490115', '81944875662', '819012345678']
      return res.json({
        ready: true, unit: p.unit, count: p.list.length,
        list: p.list.slice(0, 30),
        match: test.map(n => ({ n, rate: rateForNumber(p, n) })),
      })
    } catch (e) { return res.status(500).json({ ready: true, error: e.message }) }
  }
  try {
    const cat = (req.query && req.query.category) || 'calls'
    const [today, month] = await Promise.all([usage('Today', cat), usage('ThisMonth', cat)])
    // 料金目安用の分単価（このアカウントの実レート）
    let rates = null
    try {
      const p = await getJpVoicePricing()
      rates = {
        unit: p.unit,
        mobile: rateForNumber(p, '819012345678'),   // 携帯 090/080/070
        landline: rateForNumber(p, '81944000000'),  // 固定 0ABJ（例:0944）
        n050: rateForNumber(p, '815012345678'),      // 050
        amdUsd: 0.0075,                              // 留守電判定/通話（Twilio回答値）
      }
    } catch (e) { /* 料率取得失敗時は rates なし */ }
    return res.json({ ready: true, category: cat, today, month, rates })
  } catch (e) {
    return res.status(500).json({ ready: true, error: e.message })
  }
}
