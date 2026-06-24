// =====================================================================
// ズバット（hikkoshi-kanri.zba.jp）顧客一覧 監視スクリプト
// 顧客一覧（Vue/Nuxt製SPA）を MutationObserver で監視し、新規行を検知して
// background 経由でサーバー(/api/inbound)へ送信する。検知時は「保存のみ」。
//
// 信頼性方針：
//  - 送信が成功した時だけ seen(既知) に登録 → 失敗は未送信のまま次回再送
//  - 20秒ごとの定期再スキャンで取りこぼしを自動リトライ
//  - 実データ行を見るまで baseline しない（描画途中の誤送信を防ぐ）
//
// 一覧の列順（td.clickable-cell）:
//   0:名前 1:人数 2:引越し元 3:引越し先 4:電話番号
//   5:受付日時 6:引越し希望日（以降に 対応状況 / メール / メモ）
// =====================================================================

const SITE = 'ズバット'
const ROW_SELECTOR = '.usersBlock table tbody tr'
const PHONE_RE = /0\d{1,4}-?\d{1,4}-?\d{3,4}/

function cellText(tds, i) {
  return (tds[i] && tds[i].innerText ? tds[i].innerText : '').replace(/\s+/g, ' ').trim()
}

function findPhone(tds) {
  const guess = cellText(tds, 4).match(PHONE_RE)
  if (guess) return guess[0]
  for (const td of tds) {
    const m = (td.innerText || '').match(PHONE_RE)
    if (m) return m[0]
  }
  return ''
}

function extract(row) {
  const tds = row.querySelectorAll('td')
  if (!tds.length) return null
  const phone = findPhone(tds)
  if (!phone) return null // 電話番号が無い行は対象外（ヘッダ/空行/描画途中）
  return {
    phone,
    name:       cellText(tds, 0),
    count:      cellText(tds, 1),
    from:       cellText(tds, 2),
    to:         cellText(tds, 3),
    receivedAt: cellText(tds, 5),
    moveDate:   cellText(tds, 6),
  }
}

let enabled = true
let baselined = false       // このセッションで基準化処理を通したか
let everBaselined = false   // 過去に一度でも基準化したか（永続。再起動の差分取り込み判定に使う）
let scanning = false
const seen = new Set()

function persistSeen() {
  chrome.storage.local.set({ seenKeys: Array.from(seen).slice(-3000) })
}

// background へ送信し、成功/失敗を待つ（失敗時は ok:false）
function sendLead(l) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(
      { type: 'NEW_LEAD', lead: { site: SITE, key: l.phone, ...l, detectedAt: new Date().toISOString() } },
      (res) => {
        if (chrome.runtime.lastError) { resolve({ ok: false }); return }
        resolve(res || { ok: false })
      }
    )
  })
}

async function init() {
  const st = await chrome.storage.local.get(['enabled', 'seenKeys', 'everBaselined'])
  enabled = st.enabled !== false
  everBaselined = st.everBaselined === true
  ;(st.seenKeys || []).forEach(k => seen.add(k))
  doScan()
  observe()
  setInterval(doScan, 20000) // 取りこぼし自動リトライ＋定期チェック
  console.log(`[リード監視:${SITE}] 起動 enabled=${enabled}`)
}

function observe() {
  const obs = new MutationObserver(scheduleScan)
  obs.observe(document.body, { childList: true, subtree: true })
}

let timer = null
function scheduleScan() {
  clearTimeout(timer)
  timer = setTimeout(doScan, 300)
}

async function doScan() {
  if (scanning) return
  scanning = true
  try {
    const rows = document.querySelectorAll(ROW_SELECTOR)
    if (!rows.length) return

    const leads = []
    rows.forEach(row => { const l = extract(row); if (l) leads.push(l) })
    if (!leads.length) return // 実データ行がまだ無い（描画中）→ 基準化しない

    // 基準化フェーズ（このセッションで1回だけ）
    if (!baselined) {
      baselined = true
      if (!everBaselined) {
        // 初回起動：今ある既存行は「既知」登録のみ（過去ぶんの一括送信を防ぐ）
        leads.forEach(l => seen.add(l.phone))
        everBaselined = true
        chrome.storage.local.set({ everBaselined: true })
        persistSeen()
        return
      }
      // 再起動（監視が途切れた後）：永続 seen を信頼し、再基準化しない。
      // ダウンタイム中に増えた未知行は、下のループで「最新の分から差分」送信する。
      console.log(`[リード監視:${SITE}] 再開 → 差分取り込みチェック`)
    }

    // 基準化後：未送信の新規を送信。成功したものだけ seen に入れる（失敗は次回再送）
    for (const l of leads) {
      if (seen.has(l.phone) || !enabled) continue
      const res = await sendLead(l)
      if (res && res.ok) {
        seen.add(l.phone)
        persistSeen()
        console.log(`[リード監視:${SITE}] 送信OK`, l.phone, l.name)
      } else {
        console.warn(`[リード監視:${SITE}] 送信失敗→次回再送`, l.phone, l.name)
      }
    }
  } finally {
    scanning = false
  }
}

chrome.storage.onChanged.addListener(ch => {
  if (ch.enabled) enabled = ch.enabled.newValue !== false
})

init()
