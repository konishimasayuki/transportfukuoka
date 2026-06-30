async function refresh() {
  const { enabled } = await chrome.storage.local.get(['enabled'])
  const on = enabled !== false
  document.getElementById('toggle').checked = on
  const state = document.getElementById('state')
  state.textContent = on ? 'ON' : 'OFF'
  state.className = on ? 'state-on' : 'state-off'
}

document.getElementById('toggle').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ enabled: e.target.checked })
  refresh()
})

document.getElementById('test').addEventListener('click', () => {
  chrome.notifications.create('test_' + Date.now(), {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: '🔔 テスト通知',
    message: '通知は正常に表示されています。',
    priority: 2,
  })
})

// 未読バッジをクリア
chrome.storage.local.set({ unread: 0 })
chrome.action.setBadgeText({ text: '' })

refresh()
