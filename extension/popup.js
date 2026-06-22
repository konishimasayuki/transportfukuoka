async function refresh() {
  const { enabled, count, countDate } = await chrome.storage.local.get(['enabled', 'count', 'countDate'])
  const on = enabled !== false
  const toggle = document.getElementById('toggle')
  const state = document.getElementById('state')
  toggle.checked = on
  state.textContent = on ? 'ON' : 'OFF'
  state.className = on ? 'state-on' : 'state-off'

  const today = new Date().toISOString().slice(0, 10)
  document.getElementById('count').textContent = (countDate === today ? (count || 0) : 0)
  document.getElementById('status').textContent = '送信先: transportfukuoka.vercel.app/api/inbound'
}

document.getElementById('toggle').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ enabled: e.target.checked })
  refresh()
})

refresh()
