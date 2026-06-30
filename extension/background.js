// =====================================================================
// background service worker
// content.js から受け取った新規リードを Vercel の受け口へ送信する。
// host_permissions に送信先を入れているため CORS の影響を受けない。
// =====================================================================

const API_URL = 'https://transportfukuoka.vercel.app/api/inbound'
const STATUS_URL = 'https://transportfukuoka.vercel.app/api/status'
const ZBA_CSRF = 'https://hikkoshi-kanri.zba.jp/hikkoshi-kanriengine-api/csrf'

// ===== セッション・キープアライブ =====
// content.js（タブ）が生存ポーリングしていれば任せる。タブが休止・夜間・PC復帰直後など
// ポーリングが止まっている時だけ、背面で認証必須の軽量API(/csrf)を叩いてセッションを温め、
// 生存状態をCRM(/api/status)に送る。これによりタブが休止してもセッションが切れにくくなる。
const KEEPALIVE_ALARM    = 'zba-keepalive'
const KEEPALIVE_STALE_MS = 90 * 1000   // タブ側ハートビートがこれより古ければ背面で生存確認

chrome.runtime.onInstalled.addListener(ensureAlarm)
chrome.runtime.onStartup.addListener(ensureAlarm)
function ensureAlarm() {
  // 1分ごとにチェック（タブが動いていれば実際の通信はスキップするので負荷は最小）
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 })
}
ensureAlarm()

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) keepAlive()
})

async function keepAlive() {
  try {
    const { lastBeatAt } = await chrome.storage.local.get(['lastBeatAt'])
    if (lastBeatAt && (Date.now() - lastBeatAt) < KEEPALIVE_STALE_MS) return // タブが生存ポーリング中
    const r = await fetch(ZBA_CSRF, { method: 'GET', credentials: 'include', headers: { accept: 'application/json' } })
    if (r.status === 401 || r.status === 403) {
      setAuthBadge(false)
      await postStatus(false, 'auth')
      return
    }
    if (!r.ok) { await postStatus(false, 'error'); return }
    // 生存OK：セッションを温めつつ CRM へハートビート
    await chrome.storage.local.set({ lastBeatAt: Date.now() })
    setAuthBadge(true)
    await postStatus(true, '')
  } catch {
    await postStatus(false, 'error')
  }
}

function postStatus(ok, reason) {
  return fetch(STATUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'zba', ok: !!ok, reason: reason || '', count: null }),
  }).catch(() => {})
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'NEW_LEAD') {
    handleLead(msg.lead).then(sendResponse)
    return true // 非同期レスポンス
  }
  if (msg?.type === 'ZBA_AUTH') {
    setAuthBadge(msg.ok)
    return
  }
})

// ログインセッション切れ時はアイコンに赤い「!」、復帰時は本日件数バッジへ戻す
function setAuthBadge(ok) {
  if (ok === false) {
    chrome.action.setBadgeText({ text: '!' })
    chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
  } else {
    restoreCountBadge()
  }
}

async function restoreCountBadge() {
  const today = new Date().toISOString().slice(0, 10)
  const { countDate, count } = await chrome.storage.local.get(['countDate', 'count'])
  const n = (countDate === today ? (count || 0) : 0)
  chrome.action.setBadgeText({ text: n ? String(n) : '' })
  chrome.action.setBadgeBackgroundColor({ color: '#1E5FA8' })
}

async function handleLead(lead) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    })
    const data = await res.json().catch(() => ({}))
    if (data && data.duplicate === false) await bumpCount()
    return { ok: true, duplicate: !!(data && data.duplicate) }
  } catch (e) {
    console.error('[リード監視] 送信失敗', e)
    return { ok: false, error: String(e) }
  }
}

// 本日の検知件数をバッジに表示
async function bumpCount() {
  const today = new Date().toISOString().slice(0, 10)
  const { countDate, count } = await chrome.storage.local.get(['countDate', 'count'])
  const next = (countDate === today ? (count || 0) : 0) + 1
  await chrome.storage.local.set({ countDate: today, count: next })
  chrome.action.setBadgeText({ text: String(next) })
  chrome.action.setBadgeBackgroundColor({ color: '#1E5FA8' })
}
