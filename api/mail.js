// お客様へのメール送信。
//   GET  … 送信設定の状態と、定型文（件名・本文のひな形）を返す
//   PUT  … 定型文を保存する
//   POST … 1通送る。送れたらリードに送信履歴を残す
import { mailerStatus, sendMail, validAddress } from './_mailer.js'
import { readItems, mutate, redisCmd } from './_kvstore.js'
import { DEFAULT_MAIL_TEMPLATE, fillMailTemplate } from '../src/lib/mailTemplate.js'

const LEADS_KEY = 'transportfukuoka:leads'
const LEADS_VER = 'transportfukuoka:leads:ver'
const TPL_KEY   = 'transportfukuoka:mailtemplate'

// 既定文と差し込みは src/lib/mailTemplate.js に置いて画面と共有している
const DEFAULT_TEMPLATE = DEFAULT_MAIL_TEMPLATE
const fill = fillMailTemplate

async function readTemplate() {
  try {
    const raw = await redisCmd(['GET', TPL_KEY])
    if (!raw) return DEFAULT_TEMPLATE
    const t = JSON.parse(raw)
    return { subject: t.subject || DEFAULT_TEMPLATE.subject, body: t.body || DEFAULT_TEMPLATE.body }
  } catch { return DEFAULT_TEMPLATE }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const template = await readTemplate()
      // ?lead= を付けると、そのリードに差し込んだ状態で返す（画面の下書き用）
      let filled = null
      const key = req.query && (req.query.lead || req.query.key)
      if (key) {
        const lead = (await readItems(LEADS_KEY)).find(l => l.key === key || l.id === key || l.phone === key)
        if (lead) filled = { to: lead.email || '', subject: fill(template.subject, lead), body: fill(template.body, lead) }
      }
      return res.json({ status: mailerStatus(), template, filled, defaults: DEFAULT_TEMPLATE })
    }

    if (req.method === 'PUT') {
      const { subject, body } = req.body || {}
      if (!String(subject || '').trim() || !String(body || '').trim()) {
        return res.status(400).json({ error: '件名と本文を入れてください' })
      }
      await redisCmd(['SET', TPL_KEY, JSON.stringify({ subject, body })])
      return res.json({ ok: true })
    }

    if (req.method === 'POST') {
      const { to, subject, text, leadKey, phone, id } = req.body || {}
      if (!validAddress(to)) return res.status(400).json({ error: '宛先のメールアドレスが正しくありません' })
      const sent = await sendMail({ to, subject, text })
      // 送れたことをリードに残す（画面が閉じても履歴が消えないようサーバ側で書く）
      const at = new Date().toISOString()
      if (leadKey || phone || id) {
        try {
          await mutate(LEADS_KEY, LEADS_VER, (items) => {
            let idx = leadKey ? items.findIndex(x => x.key === leadKey) : -1
            if (idx === -1 && id) idx = items.findIndex(x => x.id === id)
            if (idx === -1 && phone) {
              const hits = []
              items.forEach((x, i) => { if (x.phone === phone) hits.push(i) })
              idx = hits.length === 1 ? hits[0] : -1
            }
            if (idx === -1) return { skipWrite: true, result: false }
            const copy = items.slice()
            const log = Array.isArray(copy[idx].mailLog) ? copy[idx].mailLog.slice(-19) : []
            log.push({ at, to, subject })
            copy[idx] = { ...copy[idx], email: to, mailedAt: at, mailLog: log, updatedAt: at }
            return { items: copy, result: true }
          })
        } catch (e) { console.error('mail log save failed:', e.message) }
      }
      return res.json({ ok: true, id: sent.id, provider: sent.provider, at })
    }

    res.setHeader('Allow', 'GET,POST,PUT,OPTIONS')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('mail api error:', e)
    return res.status(500).json({ error: e.message || 'メールを送れませんでした' })
  }
}
