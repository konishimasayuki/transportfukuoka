// =====================================================================
// ズバット（hikkoshi-kanri.zba.jp）顧客一覧 監視スクリプト
// 顧客一覧（Vue製SPA）を MutationObserver で監視し、新規行を検知して
// background 経由でサーバー(/api/inbound)へ送信する。検知時は「保存のみ」。
//
// 一覧の列順（td.clickable-cell）:
//   0:名前 1:人数 2:引越し元 3:引越し先 4:電話番号
//   5:受付日時 6:引越し希望日（以降に 対応状況 / メール / メモ）
// =====================================================================

const SITE = 'ズバット'

// 顧客一覧の「1件＝1行」
const ROW_SELECTOR = '.usersBlock table tbody tr'

// 電話番号パターン（090-1234-5678 / 0922345678 等）
const PHONE_RE = /0\d{1,4}-?\d{1,4}-?\d{3,4}/

function cellText(tds, i) {
  return (tds[i] && tds[i].innerText ? tds[i].innerText : '').replace(/\s+/g, ' ').trim()
}

// 想定列(5列目)を優先しつつ、列ズレ時は全セルから電話番号を探す
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
  if (!phone) return null // 電話番号が無い行は対象外（ヘッダ/空行など）
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
let baselined = false // 起動後に初めて一覧を見た時点を基準にする
const seen = new Set()

async function init() {
  const st = await chrome.storage.local.get(['enabled', 'seenKeys'])
  enabled = st.enabled !== false
  ;(st.seenKeys || []).forEach(k => seen.add(k))
  doScan()
  observe()
  console.log(`[リード監視:${SITE}] 起動 enabled=${enabled}`)
}

function observe() {
  const obs = new MutationObserver(scheduleScan)
  obs.observe(document.body, { childList: true, subtree: true })
}

let timer = null
function scheduleScan() {
  clearTimeout(timer)
  timer = setTimeout(doScan, 300) // 連続変化を間引く
}

function doScan() {
  const rows = document.querySelectorAll(ROW_SELECTOR)
  if (!rows.length) return // SPA描画前は何もしない（空を基準にしない）

  // 初回（基準化前）は今ある行を「既知」として登録するだけで送信しない。
  // これでページ表示時の既存リード全件を誤って取り込むのを防ぐ。
  const initial = !baselined
  let added = false

  rows.forEach(row => {
    const lead = extract(row)
    if (!lead) return
    if (seen.has(lead.phone)) return
    seen.add(lead.phone)
    added = true
    if (!initial && enabled) {
      chrome.runtime.sendMessage({
        type: 'NEW_LEAD',
        lead: { site: SITE, key: lead.phone, ...lead, detectedAt: new Date().toISOString() },
      })
      console.log(`[リード監視:${SITE}] 新規検知`, lead.phone, lead.name)
    }
  })

  baselined = true
  if (added) chrome.storage.local.set({ seenKeys: Array.from(seen).slice(-2000) })
}

chrome.storage.onChanged.addListener(ch => {
  if (ch.enabled) enabled = ch.enabled.newValue !== false
})

init()
