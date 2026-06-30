// =====================================================================
// 通知専用 拡張（子）— 監視はしない。サーバーの新着リードを見て通知するだけ。
// CRMを開かなくても・ログイン不要で、Chromeが動いていれば通知が届く。
// 仕組み：chrome.alarms(1分)で起動し、その間 約12秒ごとに /api/inbound?recent=5 を
//   ポーリング。前回以降に来た新着のみ Windows通知を出す（初回は基準化のみ）。
// =====================================================================
const RECENT_URL = 'https://transportfukuoka.vercel.app/api/inbound?recent=5'
const CRM_URL    = 'https://transportfukuoka.vercel.app/'
const POLL_ALARM = 'notify-poll'
const STEP_MS    = 12000   // バースト内のポーリング間隔（約12秒＝検知の速さ）
const WINDOW_MS  = 56000   // 1分アラーム内で動かす時間（次のアラームまで継続）

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

chrome.runtime.onInstalled.addListener(setup)
chrome.runtime.onStartup.addListener(setup)
function setup() { chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 }); runBurst() }
setup()

chrome.alarms.onAlarm.addListener((a) => { if (a.name === POLL_ALARM) runBurst() })

// SWはアイドルで止まるため、アラームで起きている間だけ短間隔ループを回す（実効 約12秒間隔）
let bursting = false
async function runBurst() {
  if (bursting) return
  bursting = true
  const start = Date.now()
  try {
    while (Date.now() - start < WINDOW_MS) {
      await pollOnce()
      if (Date.now() - start + STEP_MS >= WINDOW_MS) break
      await sleep(STEP_MS)
    }
  } finally { bursting = false }
}

async function pollOnce() {
  const { enabled } = await chrome.storage.local.get(['enabled'])
  if (enabled === false) return
  let data
  try { data = await fetch(RECENT_URL, { cache: 'no-store' }).then(r => r.json()) } catch { return }
  const items = (data.items || []).filter(i => i && i.savedAt).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
  if (!items.length) return
  const newest = items[0].savedAt
  const { notifyLastAt } = await chrome.storage.local.get(['notifyLastAt'])
  if (notifyLastAt == null) { await chrome.storage.local.set({ notifyLastAt: newest }); return } // 初回は基準化（過去分は鳴らさない）
  const fresh = items.filter(i => String(i.savedAt) > String(notifyLastAt)).reverse() // 古い順
  if (!fresh.length) return
  fresh.forEach(showNotif)
  await chrome.storage.local.set({ notifyLastAt: newest })
  await bumpBadge(fresh.length)
}

function showNotif(lead) {
  const route = [lead.from, lead.to].filter(Boolean).join(' → ')
  chrome.notifications.create('lead_' + (lead.key || lead.id || Date.now()) + '_' + Math.floor(Math.random() * 1000), {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: `🆕 新規リード（${lead.site || ''}）`,
    message: `${(lead.name || '名前なし')}　${lead.phone || ''}`.trim() + (route ? `\n${route}` : ''),
    priority: 2,
  })
}

chrome.notifications.onClicked.addListener(async (id) => {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://transportfukuoka.vercel.app/*' })
    if (tabs.length) { await chrome.tabs.update(tabs[0].id, { active: true }); if (tabs[0].windowId != null) chrome.windows.update(tabs[0].windowId, { focused: true }) }
    else await chrome.tabs.create({ url: CRM_URL })
  } catch { try { await chrome.tabs.create({ url: CRM_URL }) } catch {} }
  chrome.notifications.clear(id)
})

// 未読バッジ（ポップアップを開くとクリア）
async function bumpBadge(n) {
  const { unread } = await chrome.storage.local.get(['unread'])
  const next = (unread || 0) + n
  await chrome.storage.local.set({ unread: next })
  chrome.action.setBadgeText({ text: String(next) })
  chrome.action.setBadgeBackgroundColor({ color: '#DC2626' })
}
