// Web Push 送信ヘルパ（VAPID）
// 購読(subscription)を Redis に保存し、新着リード時に全購読へプッシュ送信する。
// VAPID_PUBLIC / VAPID_PRIVATE が未設定なら push は無効（CRMはポーリング通知にフォールバック）。
import webpush from 'web-push'

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const SUBS_KEY = 'transportfukuoka:pushsubs'

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC
const VAPID_PRIVATE = process.env.VAPID_PRIVATE
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@transportfukuoka.jp'

let configured = false
export function pushReady() {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false
  if (!configured) {
    try { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); configured = true }
    catch (e) { console.error('VAPID設定エラー', e.message); return false }
  }
  return true
}
export function vapidPublicKey() { return VAPID_PUBLIC || '' }

async function redis(command) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Redis env vars missing')
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const data = await res.json()
  if (data.error) throw new Error('Redis error: ' + data.error)
  return data.result
}
async function getSubs() { const raw = await redis(['GET', SUBS_KEY]); if (!raw) return []; try { return JSON.parse(raw) } catch { return [] } }
async function setSubs(subs) { await redis(['SET', SUBS_KEY, JSON.stringify(subs)]) }

export async function addSub(sub) {
  if (!sub || !sub.endpoint) return
  const subs = await getSubs()
  if (!subs.find(s => s.endpoint === sub.endpoint)) { subs.push(sub); await setSubs(subs.slice(-500)) }
}
export async function removeSub(endpoint) {
  if (!endpoint) return
  const subs = await getSubs()
  await setSubs(subs.filter(s => s.endpoint !== endpoint))
}

// 全購読へ送信。404/410（無効購読）は掃除する。
export async function sendPushToAll(payload) {
  if (!pushReady()) return { sent: 0 }
  const subs = await getSubs()
  if (!subs.length) return { sent: 0 }
  const body = JSON.stringify(payload)
  const dead = []
  let sent = 0
  await Promise.all(subs.map(async s => {
    try { await webpush.sendNotification(s, body); sent++ }
    catch (e) { const c = e && e.statusCode; if (c === 404 || c === 410) dead.push(s.endpoint) }
  }))
  if (dead.length) await setSubs(subs.filter(s => !dead.includes(s.endpoint)))
  return { sent }
}
