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

// 取りこぼし取り込み：開いているズバット顧客一覧タブで全件スキャンし、未取得分を送信
document.getElementById('resync').addEventListener('click', async () => {
  const btn = document.getElementById('resync')
  const result = document.getElementById('result')
  btn.disabled = true
  result.style.color = '#64748b'
  result.textContent = '取り込み中...'
  try {
    const tabs = await chrome.tabs.query({ url: 'https://hikkoshi-kanri.zba.jp/*' })
    if (!tabs.length) {
      result.style.color = '#dc2626'
      result.textContent = 'ズバットの顧客一覧ページを開いてから実行してください'
      return
    }
    const res = await chrome.tabs.sendMessage(tabs[0].id, { type: 'RESYNC' })
    if (res && res.ok) {
      result.style.color = '#16a34a'
      result.textContent = `${res.sent}件を取り込みました（一覧${res.total}件中）${res.failed ? ` / 失敗${res.failed}件` : ''}`
      refresh()
    } else {
      result.style.color = '#dc2626'
      result.textContent = '取り込みに失敗しました' + (res && res.error ? `: ${res.error}` : '')
    }
  } catch (e) {
    result.style.color = '#dc2626'
    result.textContent = 'ページと通信できません。一覧ページを再読み込みしてください'
  } finally {
    btn.disabled = false
  }
})

refresh()
