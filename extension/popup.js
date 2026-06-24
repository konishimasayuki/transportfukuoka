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

// 取りこぼし取り込み：ボタン押下時にその場でスクレイプ処理をページへ注入して実行。
// content.js の状態（古い版が残っている等）に依存しないため、F5なしで動く。
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
    // 一覧が iframe 内でも拾えるよう全フレームでスクレイプ
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id, allFrames: true },
      func: scrapeRows,
    })
    const leads = frames.flatMap(f => f.result || [])
    if (!leads.length) {
      result.style.color = '#dc2626'
      result.textContent = '一覧の行が見つかりません。顧客一覧を表示してから実行してください'
      return
    }
    // 取得した全行をサーバへ。重複はサーバ側で除外されるので、新規だけ取り込まれる。
    let added = 0, dup = 0, fail = 0
    for (const lead of leads) {
      const res = await chrome.runtime.sendMessage({ type: 'NEW_LEAD', lead })
      if (res && res.ok) { res.duplicate ? dup++ : added++ } else fail++
    }
    result.style.color = added > 0 ? '#16a34a' : '#64748b'
    result.textContent = `新規${added}件を取り込み（重複${dup}・失敗${fail}／一覧${leads.length}件）`
    refresh()
  } catch (e) {
    result.style.color = '#dc2626'
    result.textContent = 'エラー: ' + (e && e.message ? e.message : String(e))
  } finally {
    btn.disabled = false
  }
})

// ページ内で実行される関数（外部変数を参照しない自己完結。executeScript用）
function scrapeRows() {
  const PHONE_RE = /0\d{1,4}-?\d{1,4}-?\d{3,4}/
  const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/
  const txt = (tds, i) => (tds[i] && tds[i].innerText ? tds[i].innerText : '').replace(/\s+/g, ' ').trim()
  let rows = document.querySelectorAll('.usersBlock table tbody tr')
  if (!rows.length) rows = document.querySelectorAll('table tbody tr') // 念のためのフォールバック
  const out = []
  rows.forEach(row => {
    const tds = row.querySelectorAll('td')
    if (!tds.length) return
    let phone = ''
    const g = txt(tds, 4).match(PHONE_RE)
    if (g) phone = g[0]
    if (!phone) for (const td of tds) { const m = (td.innerText || '').match(PHONE_RE); if (m) { phone = m[0]; break } }
    if (!phone) return // 電話番号が無い行は対象外
    let email = ''
    for (const td of tds) { const m = (td.innerText || '').match(EMAIL_RE); if (m) { email = m[0]; break } }
    out.push({
      site: 'ズバット', key: phone, phone,
      name: txt(tds, 0), count: txt(tds, 1), from: txt(tds, 2), to: txt(tds, 3),
      receivedAt: txt(tds, 5), moveDate: txt(tds, 6), email,
      detectedAt: new Date().toISOString(),
    })
  })
  return out
}

refresh()
