// =====================================================================
// 引越し侍 顧客一覧 監視スクリプト（STEP1・骨組み）
// 顧客一覧ページを開いたまま新規行が増えるのを MutationObserver で検知し、
// 新規リードを background 経由でサーバー(/api/inbound)へ送信する。
//
// ※ 下の SELECTORS / extract() は「実際の加盟店管理画面のHTML」に合わせて
//    後で差し替える前提のプレースホルダです。現状は行テキストから電話番号を
//    正規表現で拾う暫定実装。HTMLをもらったらセレクタを確定します。
// =====================================================================

const SITE = '引越し侍'

// TODO: 実DOMに合わせて調整（顧客一覧の「1件＝1行」に当たる要素）
const ROW_SELECTOR = 'table tbody tr'

// 電話番号の暫定抽出（例: 090-1234-5678 / 0922345678 など）
const PHONE_RE = /0\d{1,4}-?\d{1,4}-?\d{3,4}/

// 1行から取り出す。氏名等は実DOMが分かり次第セレクタ指定に置き換える。
function extract(row) {
  const text = (row.innerText || '').replace(/\s+/g, ' ').trim()
  const phoneMatch = text.match(PHONE_RE)
  const phone = phoneMatch ? phoneMatch[0] : ''
  // TODO: const name = row.querySelector('.顧客名セレクタ')?.innerText?.trim() || ''
  const name = ''
  return { phone, name, text }
}

// 重複判定キー（電話番号優先）
function keyOf(lead) {
  return lead.phone || lead.text.slice(0, 60)
}

let enabled = true
const seen = new Set()

async function init() {
  const st = await chrome.storage.local.get(['enabled', 'seenKeys'])
  enabled = st.enabled !== false
  ;(st.seenKeys || []).forEach(k => seen.add(k))

  // 初回は「今ページにある行」を既知として登録するだけ（送信しない）
  doScan(true)
  observe()
  console.log(`[リード監視:${SITE}] 起動 enabled=${enabled}`)
}

function observe() {
  const obs = new MutationObserver(() => scheduleScan())
  obs.observe(document.body, { childList: true, subtree: true })
}

let timer = null
function scheduleScan() {
  clearTimeout(timer)
  timer = setTimeout(() => doScan(false), 300) // 連続変化を間引く
}

function doScan(initial) {
  if (!initial && !enabled) return
  const rows = document.querySelectorAll(ROW_SELECTOR)
  let added = false
  rows.forEach(row => {
    const lead = extract(row)
    if (!lead.phone) return // 電話番号が拾えない行はスキップ（セレクタ調整で改善）
    const key = keyOf(lead)
    if (seen.has(key)) return
    seen.add(key)
    added = true
    if (!initial && enabled) {
      chrome.runtime.sendMessage({
        type: 'NEW_LEAD',
        lead: { site: SITE, key, phone: lead.phone, name: lead.name, raw: lead.text, detectedAt: new Date().toISOString() },
      })
      console.log(`[リード監視:${SITE}] 新規検知`, lead.phone)
    }
  })
  if (added) chrome.storage.local.set({ seenKeys: Array.from(seen).slice(-1000) })
}

chrome.storage.onChanged.addListener(ch => {
  if (ch.enabled) enabled = ch.enabled.newValue !== false
})

init()
