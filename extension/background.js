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
const SAMURAI_ALARM      = 'samurai-poll'
const SAMURAI_VERSION    = 2            // 取込ロジック変更で+1（seenをリセットし当日分を取り直す）

chrome.runtime.onInstalled.addListener(ensureAlarm)
chrome.runtime.onStartup.addListener(ensureAlarm)
function ensureAlarm() {
  // 1分ごとにチェック（タブが動いていれば実際の通信はスキップするので負荷は最小）
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 })
  // 引越し侍：背面ポーリング（毎回最新コードを注入するためタブのリロード不要）
  chrome.alarms.create(SAMURAI_ALARM, { periodInMinutes: 1 })
}
ensureAlarm()

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) keepAlive()
  if (alarm.name === SAMURAI_ALARM) samuraiPoll()
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

// ===== 引越し侍：背面ポーリング =====
// chrome.alarms で1分ごとに発火。ログイン中の引越し侍タブへ最新コードを注入して
// 一覧＋詳細を取得（注入なので拡張更新後もタブのリロード不要）。当日分の未送信のみ取込。
let samuraiBusy = false
async function samuraiPoll() {
  if (samuraiBusy) return
  samuraiBusy = true
  try {
    const tabs = await chrome.tabs.query({ url: 'https://hikkosizamurai.com/admin/*' })
    if (!tabs.length) return // ログイン中のタブが無いと取得できない（セッションCookie/注入先が必要）
    const store = await chrome.storage.local.get(['samuraiSeen', 'samuraiVersion'])
    const seenArr = store.samuraiVersion === SAMURAI_VERSION ? (store.samuraiSeen || []) : []
    const td = new Date()
    const todayMD = String(td.getMonth() + 1).padStart(2, '0') + '/' + String(td.getDate()).padStart(2, '0')

    let frames
    try {
      frames = await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: samuraiCollect, args: [seenArr, todayMD] })
    } catch (e) { console.warn('[引越し侍] 注入失敗', e); return }
    const res = frames && frames[0] && frames[0].result
    if (!res) return
    if (res.auth) { console.warn('[引越し侍] ⚠ ログイン切れの可能性'); setAuthBadge(false); return }
    if (res.error) { console.warn('[引越し侍] 取得失敗', res.error); return }

    const seen = new Set(seenArr)
    ;(res.allIds || []).forEach(x => { if (!x.today) seen.add(x.id) }) // 過去分は対象外として確定
    let added = 0
    for (const lead of (res.leads || [])) {
      const r = await handleLead(lead)
      if (r && r.ok) { seen.add(lead.orderId); if (!r.duplicate) added++ }
    }
    await chrome.storage.local.set({ samuraiSeen: Array.from(seen).slice(-5000), samuraiVersion: SAMURAI_VERSION })
    if (res.leads && res.leads.length) {
      console.log(`[引越し侍] ${res.leads.length}件処理（新規${added}）／当日未取込の残り≈${Math.max(0, (res.freshCount || 0) - res.leads.length)}`)
    }
  } finally { samuraiBusy = false }
}

// ページに注入される自己完結関数：一覧(no-store)＋当日未送信の詳細を取得してリード配列を返す
async function samuraiCollect(seenArr, todayMD) {
  const norm = s => (s == null ? '' : String(s)).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  const textOf = el => norm(el ? el.textContent : '')
  const pad = n => String(n).padStart(2, '0')
  const padMD = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/); return m ? `${pad(m[1])}/${pad(m[2])} ${pad(m[3])}:${m[4]}` : (s || '') }
  const baseOf = (id, tr) => { const c = tr ? [...tr.children].map(textOf) : []; return { id, name: c[1] || '', fromPref: c[2] || '', toPref: c[3] || '', type: c[4] || '', receivedAt: padMD(c[5] || ''), moveDate: c[6] || '' } }
  const buildLabelMap = doc => { const map = {}; doc.querySelectorAll('tr').forEach(tr => { const cells = [...tr.children]; for (let i = 0; i + 1 < cells.length; i++) { const k = textOf(cells[i]); if (k && !(k in map)) map[k] = textOf(cells[i + 1]) } }); return map }
  const SUBCATS = new Set(['家具', '家電', 'その他', '重量物']); const SKIP = new Set(['家財', '家具', '家電', 'その他', '重量物'])
  const parseKazaiFull = doc => {
    const lbl = [...doc.querySelectorAll('th,td')].find(c => textOf(c) === '家財'); if (!lbl) return { kazai: [], boxCount: '' }
    const rows = []; let tr = lbl.closest('tr'); if (tr) rows.push(tr); let nx = tr ? tr.nextElementSibling : null
    while (nx) { const first = textOf(nx.querySelector('th,td')); if (SUBCATS.has(first)) { rows.push(nx); nx = nx.nextElementSibling } else break }
    const tokens = rows.flatMap(r => [...r.querySelectorAll('th,td')]).flatMap(c => textOf(c).split(' ')).filter(Boolean)
    const kazai = []; let boxCount = ''
    for (let i = 0; i < tokens.length; i++) { if (/^\d+$/.test(tokens[i])) { const q = parseInt(tokens[i], 10), n = tokens[i - 1]; if (!n || SKIP.has(n)) continue; if (n === 'ダンボール' || n === 'ダンボール箱') { if (q > 0) boxCount = String(q); continue } if (q > 0) kazai.push({ name: n, qty: q }) } }
    return { kazai, boxCount }
  }
  const HDR = { accept: 'text/html', 'cache-control': 'no-cache', pragma: 'no-cache' }
  let listHtml
  try { const r = await fetch('/admin/request/list?_=' + Date.now(), { credentials: 'include', cache: 'no-store', headers: HDR }); if (!r.ok) return { error: 'list ' + r.status }; listHtml = await r.text() } catch (e) { return { error: String(e) } }
  const ldoc = new DOMParser().parseFromString(listHtml, 'text/html')
  const links = [...ldoc.querySelectorAll('a[href*="/request/detail/id/"]')]
  if (!links.length) return { auth: true }
  const dedup = new Set(); const rows = []
  for (const a of links) { const m = (a.getAttribute('href') || '').match(/id\/(\d+)/); if (m && !dedup.has(m[1])) { dedup.add(m[1]); rows.push(baseOf(m[1], a.closest('tr'))) } }
  const seen = new Set(seenArr || [])
  const isToday = rs => /^\d{2}\/\d{2}/.test(rs || '') && String(rs).slice(0, 5) === todayMD
  const allIds = rows.map(r => ({ id: r.id, today: isToday(r.receivedAt) }))
  const fresh = rows.filter(r => isToday(r.receivedAt) && !seen.has(r.id))
  const PER = 8, GAP = 300
  const leads = []
  for (const base of fresh.slice(0, PER)) {
    try {
      const r = await fetch('/admin/request/detail/id/' + base.id, { credentials: 'include', cache: 'no-store', headers: HDR }); if (!r.ok) continue
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html')
      const map = buildLabelMap(doc); const get = k => map[k] || ''
      const phone = (get('電話番号').match(/0\d{1,4}-\d{1,4}-\d{3,4}/) || [''])[0]
      const email = (get('メールアドレス').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0]
      const name = get('名前').replace(/\s*様$/, '').replace(/\s*さん$/, '') || base.name
      const k = parseKazaiFull(doc)
      leads.push({ site: '引越し侍', key: phone || ('引越し侍:' + base.id), phone, name, kana: get('フリガナ'), email, count: get('引越し人数') || base.type, from: base.fromPref, to: base.toPref, receivedAt: base.receivedAt, moveDate: get('引越し希望日') || base.moveDate, preferredTime: get('引越し希望時間'), referenceFee: get('表示料金相場'), request: get('備考・その他要望'), orderId: String(base.id), kazai: k.kazai, boxCount: k.boxCount, detail: true, detectedAt: new Date().toISOString() })
    } catch {}
    await new Promise(res => setTimeout(res, GAP))
  }
  return { allIds, leads, freshCount: fresh.length }
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
