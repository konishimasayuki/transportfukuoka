// =====================================================================
// background service worker
// content.js から受け取った新規リードを Vercel の受け口へ送信する。
// host_permissions に送信先を入れているため CORS の影響を受けない。
// =====================================================================

const API_URL = 'https://transportfukuoka.vercel.app/api/inbound'

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'NEW_LEAD') {
    handleLead(msg.lead).then(sendResponse)
    return true // 非同期レスポンス
  }
})

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
