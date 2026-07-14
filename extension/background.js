// =====================================================================
// background service worker
// - content.js（ズバット）から受け取ったリードを Vercel の受け口へ送信
// - ズバットのセッション・キープアライブ（chrome.alarms）
// - 引越し侍：ログイン中タブへ高速ポーリングループを注入（タブのリロード不要・約8秒間隔）
// host_permissions に対象を入れているため CORS / Cookie の制約を受けない。
// =====================================================================

const API_URL = 'https://transportfukuoka.vercel.app/api/inbound'
const STATUS_URL = 'https://transportfukuoka.vercel.app/api/status'
const ZBA_CSRF = 'https://hikkoshi-kanri.zba.jp/hikkoshi-kanriengine-api/csrf'

const KEEPALIVE_ALARM    = 'zba-keepalive'
const KEEPALIVE_STALE_MS = 90 * 1000   // タブ側ハートビートがこれより古ければ背面で生存確認
const STALE_RELOAD_MS    = 4 * 60 * 1000 // ハートビートがこれより長く途絶＝frozen/停止とみなしタブ再読込（営業時間中・最短間隔も兼ねる）
const SAMURAI_ALARM      = 'samurai-poll'

chrome.runtime.onInstalled.addListener(ensureAlarm)
chrome.runtime.onStartup.addListener(ensureAlarm)
function ensureAlarm() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 })
  chrome.alarms.create(SAMURAI_ALARM, { periodInMinutes: 1 }) // ループ生存確認＆再注入用
}
ensureAlarm()

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) keepAlive()
  if (alarm.name === SAMURAI_ALARM) { ensureSamuraiLoop(); ensureKakakuLoop() }
})

// 引越し侍タブが読み込まれたら高速ループを注入（開き直し時も自動で復帰）
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab && tab.url && tab.url.startsWith('https://hikkosizamurai.com/admin')) {
    ensureSamuraiLoop()
  }
  // 価格.com 管理画面タブが読み込まれたら高速ループを注入
  if (info.status === 'complete' && tab && tab.url && tab.url.startsWith('https://ssl.kakaku.com/hikkoshi/vender/admin')) {
    ensureKakakuLoop()
  }
})
ensureSamuraiLoop() // SW起動時にも一度試行
ensureKakakuLoop()

// ===== ズバット セッション・キープアライブ =====
async function keepAlive() {
  try {
    const { lastBeatAt, zbaLastReloadAt } = await chrome.storage.local.get(['lastBeatAt', 'zbaLastReloadAt'])
    const beatStale = !lastBeatAt || (Date.now() - lastBeatAt) > STALE_RELOAD_MS
    const _h = new Date().getHours(); const business = _h >= 6 && _h < 24
    // ズバットのタブが休止(discarded)、または長時間ハートビート途絶(frozen/停止)なら再読込してcontent.jsを再起動。
    try {
      const zt = await chrome.tabs.query({ url: 'https://hikkoshi-kanri.zba.jp/*' })
      for (const t of zt) {
        if (t.discarded) { try { chrome.tabs.reload(t.id) } catch {} }
        else if (beatStale && business && (!zbaLastReloadAt || Date.now() - zbaLastReloadAt > STALE_RELOAD_MS)) {
          try { await chrome.tabs.reload(t.id); await chrome.storage.local.set({ zbaLastReloadAt: Date.now() }) } catch {}
        }
      }
    } catch {}
    if (lastBeatAt && (Date.now() - lastBeatAt) < KEEPALIVE_STALE_MS) return // タブが生存ポーリング中
    const r = await fetch(ZBA_CSRF, { method: 'GET', credentials: 'include', headers: { accept: 'application/json' } })
    if (r.status === 401 || r.status === 403) { setAuthBadge(false); await postStatus(false, 'auth'); return }
    if (!r.ok) { await postStatus(false, 'error'); return }
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
    handleLead(msg.lead, msg.notify !== false).then(sendResponse) // notify:false で通知抑制（一括取込など）
    return true // 非同期レスポンス
  }
  if (msg?.type === 'ZBA_AUTH') {
    setAuthBadge(msg.ok)
    return
  }
})

// ===== 新規リードのWindows通知（ブラウザ起動中＝Chrome実行中に表示）=====
function notifyNewLead(lead) {
  try {
    const route = [lead.from, lead.to].filter(Boolean).join(' → ')
    const lines = [`${lead.name || '名前なし'}　${lead.phone || ''}`.trim()]
    if (route) lines.push(route)
    if (lead.moveDate) lines.push('引越し希望: ' + lead.moveDate)
    chrome.notifications.create('lead_' + Date.now() + '_' + Math.floor(Math.random() * 1000), {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: `🆕 新規リード（${lead.site || ''}）`,
      message: lines.join('\n'),
      priority: 2,
      requireInteraction: false,
    })
  } catch (e) { /* notifications未許可など */ }
}

// 通知クリックでCRMを開く（既存タブがあれば前面に）
chrome.notifications.onClicked.addListener(async (id) => {
  const URL = 'https://transportfukuoka.vercel.app/'
  try {
    const tabs = await chrome.tabs.query({ url: 'https://transportfukuoka.vercel.app/*' })
    if (tabs.length) { await chrome.tabs.update(tabs[0].id, { active: true }); if (tabs[0].windowId != null) chrome.windows.update(tabs[0].windowId, { focused: true }) }
    else await chrome.tabs.create({ url: URL })
  } catch { try { await chrome.tabs.create({ url: URL }) } catch {} }
  chrome.notifications.clear(id)
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

async function handleLead(lead, notify = true) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead),
    })
    const data = await res.json().catch(() => ({}))
    if (data && data.duplicate === false) {
      await bumpCount()
      if (notify) notifyNewLead(lead) // 新規（重複でない）かつ通知許可時のみトースト
    }
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

// ===== 引越し侍：ページ内 高速ポーリングループの注入 =====
// 1分ごとのアラーム＋タブ読み込み時に、ログイン中の引越し侍タブへ高速ループを注入する。
// ループはページ側で約8秒間隔で回るためSWのスリープに影響されず、注入は常に最新コード
// なので拡張更新後もタブのリロード不要。世代トークンで多重起動を防止（最新の注入が勝つ）。
async function ensureSamuraiLoop() {
  let tabs = []
  try { tabs = await chrome.tabs.query({ url: 'https://hikkosizamurai.com/admin/*' }) } catch { return }
  if (!tabs.length) return
  const tab = tabs[0]
  // Chromeのメモリセーバーでタブが休止されたら復帰させる（→onUpdated完了でループ再注入）
  if (tab.discarded) { try { await chrome.tabs.reload(tab.id) } catch {} return }
  const td = new Date()
  const todayMD = String(td.getMonth() + 1).padStart(2, '0') + '/' + String(td.getDate()).padStart(2, '0')
  const gen = Date.now()
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: samuraiLoop, args: [gen, todayMD] })
  } catch (e) { /* タブが閉じた等 */ }
}

// ===== 価格.com：ページ内 高速ポーリングループの注入 =====
// 1分ごとのアラーム＋タブ読み込み時に、価格.com管理画面タブへ高速ループを注入する。
// 価格.comはサーバー描画HTML（一覧＝/admin/Index、詳細＝/admin/userdetail/?orderid=）。
async function ensureKakakuLoop() {
  let tabs = []
  try { tabs = await chrome.tabs.query({ url: 'https://ssl.kakaku.com/hikkoshi/vender/admin/*' }) } catch { return }
  if (!tabs.length) return
  const tab = tabs[0]
  if (tab.discarded) { try { await chrome.tabs.reload(tab.id) } catch {} return }
  const td = new Date()
  const today = td.getFullYear() + '/' + String(td.getMonth() + 1).padStart(2, '0') + '/' + String(td.getDate()).padStart(2, '0')
  const gen = Date.now()
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: kakakuLoop, args: [gen, today] })
  } catch (e) { /* タブが閉じた等 */ }
}

// ページに注入される自己完結ループ。約15秒ごとに一覧(no-cache)を取得し、
// 当日(依頼日=今日)で未送信のものだけ詳細取得して background(NEW_LEAD) へ送る。
function kakakuLoop(gen, today) {
  window.__tfKakakuGen = gen
  window.__tfKakakuSeen = window.__tfKakakuSeen || [] // ページ存続中の取込済みorderid（リロードで自然リセット→当日分は再送・サーバ重複除外）
  const seen = new Set(window.__tfKakakuSeen)
  const persist = () => { window.__tfKakakuSeen = Array.from(seen).slice(-5000) }
  const PER = 8, GAP = 300, FAST_MS = 12000, SLOW_MS = 120000
  // 巡回間隔：ほぼ終日(7-24時)は12秒＋0〜4秒ジッター（最速12秒・最遅16秒）、深夜(0-7時)は120秒に減速（負荷・BAN配慮）
  const nextDelay = () => { const h = new Date().getHours(); const base = (h >= 7 && h < 24) ? FAST_MS : SLOW_MS; return base + Math.floor(Math.random() * 4000) }
  const INBOUND = 'https://transportfukuoka.vercel.app/api/inbound'
  const LIST = '/hikkoshi/vender/admin/Index'
  const DETAIL = id => '/hikkoshi/vender/admin/userdetail/?orderid=' + id
  const STATUS = 'https://transportfukuoka.vercel.app/api/status'
  const postStatus = (ok, reason, count) => { try { fetch(STATUS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'kakaku', ok, reason: reason || '', count: count == null ? null : count }) }).catch(() => {}) } catch {} }

  // ===== 自動再ログイン（アカウントロック防止つき）=====（引越し侍と同方式・同ポリシー）
  //  ①ID/PW拒否で即停止（再保存まで再試行しない＝誤PW時は実質1回のみ）②絶対上限3回 ③5分に1回・全タブ共有。
  const MAX_TRIES = 2 // 失敗ログインの上限（厳しめ・毎朝6時にリセット）
  async function relogin(loginDoc) {
    if ([22, 23, 0, 1, 2, 3, 4, 5].includes(new Date().getHours())) return false // 夜間22〜6時は再ログイン休止
    const set = p => { try { chrome.storage.local.set(p) } catch {} }
    let st = {}
    try { st = await chrome.storage.local.get(['kakakuCreds', 'kakakuReloginBlocked', 'kakakuReloginLastAt', 'kakakuReloginTries', 'kakakuReloginMorning']) } catch {}
    // 朝5時以降の初回：前日までの停止・試行回数をリセットして監視を再開（毎朝ログインし直す）
    const _md = new Date(); const _mkey = _md.getFullYear() + '-' + String(_md.getMonth() + 1).padStart(2, '0') + '-' + String(_md.getDate()).padStart(2, '0')
    if (st.kakakuReloginMorning !== _mkey) {
      st.kakakuReloginBlocked = false; st.kakakuReloginTries = 0; st.kakakuReloginLastAt = 0
      set({ kakakuReloginBlocked: false, kakakuReloginTries: 0, kakakuReloginLastAt: 0, kakakuReloginMorning: _mkey })
    }
    const creds = st.kakakuCreds
    if (!creds || !creds.username || !creds.password) { postStatus(false, 'auth'); set({ kakakuReloginResult: 'failed', kakakuReloginReason: 'no-creds', kakakuReloginAt: Date.now() }); return false }
    if (st.kakakuReloginBlocked) { postStatus(false, 'auth'); return false } // 停止中（ID/PWを保存し直すと解除）
    const now = Date.now()
    if (st.kakakuReloginLastAt && now - st.kakakuReloginLastAt < 5 * 60 * 1000) return false // 5分に1回まで（全タブ共有）
    if ((st.kakakuReloginTries || 0) >= MAX_TRIES) { set({ kakakuReloginBlocked: true, kakakuReloginResult: 'failed', kakakuReloginReason: 'max-tries', kakakuReloginAt: now }); postStatus(false, 'auth'); return false }
    const pw = loginDoc.querySelector('input[type="password"]')
    const form = pw && pw.closest('form')
    if (!form) { set({ kakakuReloginBlocked: true, kakakuReloginResult: 'failed', kakakuReloginReason: 'no-form', kakakuReloginAt: now }); postStatus(false, 'auth'); return false }
    const base = loginDoc.__srcUrl || location.href // リダイレクト後のログインページURLを基準にaction解決
    const action = new URL(form.getAttribute('action') || base, base).href
    const method = (form.getAttribute('method') || 'POST').toUpperCase()
    const looksUser = el => {
      const hay = ((el.getAttribute('name') || '') + ' ' + (el.getAttribute('id') || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase()
      return el.type === 'email' || el.type === 'tel' || /mail|user|login|account|\bid\b|ログイン|メール|ユーザ|会員/.test(hay)
    }
    const inputs = [...form.querySelectorAll('input,select,textarea')]
    const params = new URLSearchParams()
    let userSet = false
    for (const el of inputs) {
      const name = el.getAttribute('name'); if (!name) continue
      const type = (el.getAttribute('type') || 'text').toLowerCase()
      if (['submit', 'button', 'image', 'reset'].includes(type)) continue
      if (type === 'password') { params.set(name, creds.password); continue }
      if (type === 'checkbox' || type === 'radio') { if (el.hasAttribute('checked')) params.set(name, el.getAttribute('value') || 'on'); continue }
      if (!userSet && ['text', 'email', 'tel'].includes(type) && (creds.userField ? name === creds.userField : looksUser(el))) { params.set(name, creds.username); userSet = true; continue }
      params.set(name, el.getAttribute('value') || '')
    }
    if (!userSet) {
      const t = inputs.find(el => { const ty = (el.getAttribute('type') || 'text').toLowerCase(); return el.getAttribute('name') && ['text', 'email', 'tel'].includes(ty) })
      if (t) { params.set(t.getAttribute('name'), creds.username); userSet = true }
    }
    if (!userSet) { set({ kakakuReloginBlocked: true, kakakuReloginResult: 'failed', kakakuReloginReason: 'no-userfield', kakakuReloginAt: now }); postStatus(false, 'auth'); return false }
    set({ kakakuReloginLastAt: now, kakakuReloginTries: (st.kakakuReloginTries || 0) + 1 }) // 認証を投げる直前に回数記録
    try {
      await fetch(action, { method, credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
      const check = await fetchDoc(LIST, 'no-cache')
      if (!check.querySelector('input[type="password"]')) { set({ kakakuReloginBlocked: false, kakakuReloginTries: 0, kakakuReloginResult: 'success', kakakuReloginReason: '', kakakuReloginAt: Date.now() }); return true }
      set({ kakakuReloginBlocked: true, kakakuReloginResult: 'failed', kakakuReloginReason: 'invalid-creds', kakakuReloginAt: Date.now() }); postStatus(false, 'auth'); return false // ID/PW拒否→即停止
    } catch (e) {
      set({ kakakuReloginResult: 'failed', kakakuReloginReason: 'fetch-error', kakakuReloginAt: Date.now() }); postStatus(false, 'auth'); return false // 通信エラーは停止せず上限内で再試行
    }
  }

  const norm = s => (s == null ? '' : String(s)).replace(/　/g, ' ').replace(/\s+/g, ' ').trim()
  const textOf = el => norm(el ? el.textContent : '')
  const PHONE_RE = /0\d{9,10}|0\d{1,4}-\d{1,4}-\d{3,4}/
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
  const HDR = { accept: 'text/html', 'cache-control': 'no-cache', pragma: 'no-cache' }

  // 価格.comは Shift_JIS。r.text()（UTF-8既定）だと日本語が文字化けするため、
  // バイト列を取得し charset（Content-Type→metaタグ→既定SJIS）で明示デコードする。
  async function fetchDoc(url, mode) {
    const r = await fetch(url, { credentials: 'include', cache: mode || 'no-store', headers: HDR })
    if (!r.ok) throw new Error(String(r.status))
    const buf = await r.arrayBuffer()
    let enc = ((r.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || [])[1]
    if (!enc) { const head = new TextDecoder('ascii').decode(buf.slice(0, 4096)); enc = ((head.match(/charset=["']?([\w-]+)/i)) || [])[1] }
    enc = (enc || 'shift_jis').toLowerCase()
    if (['sjis', 'x-sjis', 'ms932', 'windows-31j', 'shift-jis'].includes(enc)) enc = 'shift_jis'
    let text
    try { text = new TextDecoder(enc).decode(buf) } catch { text = new TextDecoder('shift_jis').decode(buf) }
    const doc = new DOMParser().parseFromString(text, 'text/html')
    try { doc.__srcUrl = r.url } catch {} // リダイレクト後の最終URL（フォームaction解決の基準に使う）
    return doc
  }

  // 詳細ページからラベル→値を取得（table/dl/div いずれの構造にも対応する総当り）
  const valueFor = (doc, label) => {
    const els = [...doc.querySelectorAll('th,td,dt,dd,div,span,label,p')]
    for (const el of els) {
      if (textOf(el) !== label) continue
      let v = textOf(el.nextElementSibling)
      if (v && v !== label) return v
      const cell = el.closest('td,th,dt,div,li')
      if (cell && cell.nextElementSibling) { v = textOf(cell.nextElementSibling); if (v && v !== label) return v }
    }
    return ''
  }

  const send = (lead) => new Promise(res => {
    let done = false
    try {
      chrome.runtime.sendMessage({ type: 'NEW_LEAD', lead }, r => { done = true; if (chrome.runtime.lastError) res(null); else res(r) })
    } catch { res(null) }
    setTimeout(() => { if (!done) res(null) }, 4000)
  }).then(r => r || fetch(INBOUND, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }).then(() => ({ ok: true })).catch(() => ({ ok: false })))

  // 依頼日 "2026/07/01 19:37:05" の先頭10文字が今日か。
  // 「今日」は毎回その場で算出する（注入時に凍結した today を使うと、0時をまたいだ瞬間に
  // 新しい日のリードが「今日ではない」と判定されて未送信のまま seen 入り＝恒久ロストになるため）。
  const curYMD = () => { const d = new Date(); return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') }
  const isToday = s => norm(s).slice(0, 10) === curYMD()

  async function tick() {
    if (window.__tfKakakuGen !== gen) return // 新しい注入が来たら旧ループは終了
    try {
      let ldoc = await fetchDoc(LIST, 'no-cache')
      // ログイン画面が返る＝セッション切れ。まず自動再ログインを試み、ダメなら未接続通知してスキップ。
      if (ldoc.querySelector('input[type="password"]')) {
        const ok = await relogin(ldoc)
        if (ok) { try { ldoc = await fetchDoc(LIST, 'no-cache') } catch {} }
        if (!ldoc || ldoc.querySelector('input[type="password"]')) {
          if (window.__tfKakakuGen === gen) setTimeout(tick, nextDelay())
          return
        }
      }
      const rows = [...ldoc.querySelectorAll('tr')].filter(tr => tr.querySelector('a[href*="userdetail"]'))
      window.__tfKakakuFail = 0 // 取得成功＝連続エラーをリセット
      postStatus(true, '', rows.length) // 生存ハートビート
      try { chrome.storage.local.set({ kakakuLastPollAt: Date.now(), kakakuLastPollCount: rows.length }) } catch {} // 最終巡回（稼働）時刻
      if (rows.length) {
        // ヘッダ行から「列名→index」を作り、列順が変わっても正しく読めるようにする（フォールバック付き）
        let cm = null
        for (const tr of ldoc.querySelectorAll('tr')) {
          const cells = [...tr.children].map(textOf)
          if (cells.includes('名前') && cells.includes('電話番号')) { cm = {}; cells.forEach((c, i) => { if (c && !(c in cm)) cm[c] = i }); break }
        }
        const idx = (label, fb) => (cm && cm[label] != null) ? cm[label] : fb
        // 指定列で見つからなければ全セルから正規表現で拾う（列ズレ耐性）
        const findBy = (c, re, i) => (c[i] && (c[i].match(re) || [])[0]) || (c.map(x => (x.match(re) || [''])[0]).find(Boolean) || '')
        const parsed = []; const dd = new Set()
        for (const tr of rows) {
          const a = tr.querySelector('a[href*="userdetail"]')
          const m = (a.getAttribute('href') || '').match(/orderid=(\d+)/)
          if (!m || dd.has(m[1])) continue
          dd.add(m[1])
          const c = [...tr.children].map(textOf)
          parsed.push({
            id: m[1],
            requestedAt: c[idx('依頼日', 0)] || '',
            status: c[idx('顧客ステータス', 1)] || '',
            moveDate: c[idx('引越し希望日', 2)] || '',
            count: c[idx('引越し人数', 3)] || '',
            fromPref: c[idx('引越し元', 4)] || '',
            toPref: c[idx('引越し先', 5)] || '',
            name: c[idx('名前', 6)] || '',
            phone: findBy(c, PHONE_RE, idx('電話番号', 7)),
            email: findBy(c, EMAIL_RE, idx('メールアドレス', 8)),
            quoteId: c[idx('見積もりID', 10)] || '',
          })
        }
        let changed = false
        // 当日以外の既存行は「既知」登録のみ（過去ぶんの一括送信を防ぐ）
        parsed.forEach(r => { if (!isToday(r.requestedAt) && !seen.has(r.id)) { seen.add(r.id); changed = true } })
        const fresh = parsed.filter(r => isToday(r.requestedAt) && !seen.has(r.id))
        let cnt = 0
        for (const base of fresh.slice(0, PER)) {
          if (window.__tfKakakuGen !== gen) return
          try {
            let name = base.name, kana = '', fromAddr = '', toAddr = '', fromZip = '', fromType = '', layout = '', floor = '', elevator = ''
            try {
              const doc = await fetchDoc(DETAIL(base.id))
              const shimei = valueFor(doc, '氏名')
              const mk = shimei.match(/^(.+?)[（(](.+?)[）)]/) // 氏名（カナ）
              if (mk) { name = mk[1].trim(); kana = mk[2].trim() } else if (shimei) { name = shimei }
              fromZip = valueFor(doc, '郵便番号')
              fromAddr = valueFor(doc, '発地（住所）') || valueFor(doc, '発地(住所)')
              fromType = valueFor(doc, '建物のタイプ')
              layout = valueFor(doc, '間取り')
              floor = valueFor(doc, 'お住まいの階数')
              elevator = valueFor(doc, 'エレベーター')
              toAddr = valueFor(doc, '着地（お引越し先）') || valueFor(doc, '着地(お引越し先)')
            } catch (e) { /* 詳細失敗→一覧情報だけで送る */ }
            const memo = [
              layout && '間取り:' + layout,
              floor && '階数:' + floor,
              elevator && 'EV:' + elevator,
              base.status && '状況:' + base.status,
            ].filter(Boolean).join(' / ')
            const lead = {
              site: '価格.com',
              key: base.phone || ('価格.com:' + base.id),
              phone: base.phone,
              name, kana, email: base.email,
              count: base.count,
              from: fromAddr || base.fromPref,
              to: toAddr || base.toPref,
              fromZip, fromType,
              receivedAt: base.requestedAt,
              moveDate: base.moveDate,
              memo,
              orderId: base.quoteId || ('A000' + base.id),
              detail: true,
              detectedAt: new Date().toISOString(),
            }
            const r = await send(lead)
            if (r && r.ok) { seen.add(base.id); changed = true; cnt++ }
          } catch (e) { /* skip */ }
          await new Promise(res => setTimeout(res, GAP))
        }
        if (changed) persist()
        if (cnt) { console.log('[リード監視:価格.com] 送信', cnt, '件'); try { chrome.storage.local.set({ kakakuLastLeadAt: Date.now(), kakakuLastLeadCount: cnt }) } catch {} } // 最終取り込み（新規）時刻
      }
    } catch (e) {
      // 一覧取得失敗（504等）。連続エラー時はバックオフして負荷・検知を抑える。CRMには取得エラーを通知。
      window.__tfKakakuFail = (window.__tfKakakuFail || 0) + 1
      postStatus(false, 'error')
    }
    if (window.__tfKakakuGen === gen) {
      const f = window.__tfKakakuFail || 0
      const delay = f > 0 ? Math.min(nextDelay() * Math.pow(2, Math.min(f, 5)), 30 * 1000) : nextDelay() // 連続エラーで最大30秒まで指数バックオフ
      setTimeout(tick, delay)
    }
  }
  tick()
}

// ページに注入される自己完結ループ。約8秒ごとに一覧(no-store)を取得し、
// 当日(依頼日=今日)で未送信のものだけ詳細取得して background(NEW_LEAD) へ送る。
function samuraiLoop(gen, todayMD) {
  window.__tfSamuraiGen = gen
  window.__tfSamuraiSeen = window.__tfSamuraiSeen || [] // ページ存続中の取込済みid（リロードで自然リセット→当日分は再送・サーバ重複除外）
  const seen = new Set(window.__tfSamuraiSeen)
  const persist = () => { window.__tfSamuraiSeen = Array.from(seen).slice(-5000) }
  // 巡回間隔：当日フィルターPOSTで軽く取れる時は日中約15秒。空/失敗で重い全件GETを使った回だけ、
  // 次回を45秒以上に空ける（tick末尾でheavy判定・最悪でも50秒以内）。深夜は120秒。
  const PER = 8, GAP = 300, FAST_MS = 15000, SLOW_MS = 120000
  // 巡回間隔：ほぼ終日(7-24時)は15秒＋0〜8秒ジッター、深夜(0-7時)は120秒に減速（負荷・BAN配慮）
  const nextDelay = () => { const h = new Date().getHours(); const base = (h >= 7 && h < 24) ? FAST_MS : SLOW_MS; return base + Math.floor(Math.random() * 8000) }
  const INBOUND = 'https://transportfukuoka.vercel.app/api/inbound'
  const STATUS  = 'https://transportfukuoka.vercel.app/api/status'
  const LIST    = '/admin/request/list'
  const postStatus = (ok, reason, count) => { try { fetch(STATUS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'samurai', ok, reason: reason || '', count: count == null ? null : count }) }).catch(() => {}) } catch {} }

  // ===== 自動再ログイン（アカウントロック防止つき）=====
  // セッション切れ時、ログインフォームを解析し保存ID/PW(samuraiCreds)でPOSTしてセッション再取得。
  // hidden項目(CSRFトークン等)はフォーム値を引き継ぐため通信キャプチャ不要。
  // ★ロック回避の要：
  //  ①サーバーがID/PWを弾いたら即「停止」＝再保存するまで二度と試行しない（＝誤PW時は実質1回のみ）
  //  ②絶対上限3回（通信エラー等が絡む例外含む）。到達で停止。
  //  ③5分に1回まで。停止/回数/時刻は chrome.storage で全タブ・再注入をまたいで共有（多重や連打を防ぐ）。
  const MAX_TRIES = 2 // 失敗ログインの上限（厳しめ・毎朝6時にリセット）
  async function relogin(loginDoc) {
    if ([22, 23, 0, 1, 2, 3, 4, 5].includes(new Date().getHours())) return false // 夜間22〜6時は再ログイン休止
    const set = p => { try { chrome.storage.local.set(p) } catch {} }
    let st = {}
    try { st = await chrome.storage.local.get(['samuraiCreds', 'samuraiReloginBlocked', 'samuraiReloginLastAt', 'samuraiReloginTries', 'samuraiReloginMorning']) } catch {}
    // 朝5時以降の初回：前日までの停止・試行回数をリセットして監視を再開（毎朝ログインし直す）
    const _md = new Date(); const _mkey = _md.getFullYear() + '-' + String(_md.getMonth() + 1).padStart(2, '0') + '-' + String(_md.getDate()).padStart(2, '0')
    if (st.samuraiReloginMorning !== _mkey) {
      st.samuraiReloginBlocked = false; st.samuraiReloginTries = 0; st.samuraiReloginLastAt = 0
      set({ samuraiReloginBlocked: false, samuraiReloginTries: 0, samuraiReloginLastAt: 0, samuraiReloginMorning: _mkey })
    }
    const creds = st.samuraiCreds
    if (!creds || !creds.username || !creds.password) { postStatus(false, 'auth'); set({ samuraiReloginResult: 'failed', samuraiReloginReason: 'no-creds', samuraiReloginAt: Date.now() }); return false }
    if (st.samuraiReloginBlocked) { postStatus(false, 'auth'); return false } // 停止中（ID/PWを保存し直すと解除）
    const now = Date.now()
    if (st.samuraiReloginLastAt && now - st.samuraiReloginLastAt < 5 * 60 * 1000) return false // 5分に1回まで（全タブ共有）
    if ((st.samuraiReloginTries || 0) >= MAX_TRIES) { set({ samuraiReloginBlocked: true, samuraiReloginResult: 'failed', samuraiReloginReason: 'max-tries', samuraiReloginAt: now }); postStatus(false, 'auth'); return false }
    const pw = loginDoc.querySelector('input[type="password"]')
    const form = pw && pw.closest('form')
    if (!form) { set({ samuraiReloginBlocked: true, samuraiReloginResult: 'failed', samuraiReloginReason: 'no-form', samuraiReloginAt: now }); postStatus(false, 'auth'); return false }
    const base = loginDoc.__srcUrl || location.href // リダイレクト後のログインページURLを基準にaction解決
    const action = new URL(form.getAttribute('action') || base, base).href
    const method = (form.getAttribute('method') || 'POST').toUpperCase()
    const looksUser = el => {
      const hay = ((el.getAttribute('name') || '') + ' ' + (el.getAttribute('id') || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('placeholder') || '')).toLowerCase()
      return el.type === 'email' || el.type === 'tel' || /mail|user|login|account|\bid\b|ログイン|メール|ユーザ|会員/.test(hay)
    }
    const inputs = [...form.querySelectorAll('input,select,textarea')]
    const params = new URLSearchParams()
    let userSet = false
    for (const el of inputs) {
      const name = el.getAttribute('name'); if (!name) continue
      const type = (el.getAttribute('type') || 'text').toLowerCase()
      if (['submit', 'button', 'image', 'reset'].includes(type)) continue
      if (type === 'password') { params.set(name, creds.password); continue }
      if (type === 'checkbox' || type === 'radio') { if (el.hasAttribute('checked')) params.set(name, el.getAttribute('value') || 'on'); continue }
      if (!userSet && ['text', 'email', 'tel'].includes(type) && (creds.userField ? name === creds.userField : looksUser(el))) { params.set(name, creds.username); userSet = true; continue }
      params.set(name, el.getAttribute('value') || '') // hidden(CSRF等)含む既存値をそのまま
    }
    if (!userSet) { // ユーザー名欄が推定できなければ最初のテキスト系inputに入れる
      const t = inputs.find(el => { const ty = (el.getAttribute('type') || 'text').toLowerCase(); return el.getAttribute('name') && ['text', 'email', 'tel'].includes(ty) })
      if (t) { params.set(t.getAttribute('name'), creds.username); userSet = true }
    }
    if (!userSet) { set({ samuraiReloginBlocked: true, samuraiReloginResult: 'failed', samuraiReloginReason: 'no-userfield', samuraiReloginAt: now }); postStatus(false, 'auth'); return false }
    // 実際にサーバーへ認証を投げる直前に、回数と時刻を記録して多重・連打を封じる。
    set({ samuraiReloginLastAt: now, samuraiReloginTries: (st.samuraiReloginTries || 0) + 1 })
    try {
      await fetch(action, { method, credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
      const check = await fetchDoc(LIST, 'no-cache') // 再ログイン後に一覧を取り直して成否判定
      if (!check.querySelector('input[type="password"]')) { set({ samuraiReloginBlocked: false, samuraiReloginTries: 0, samuraiReloginResult: 'success', samuraiReloginReason: '', samuraiReloginAt: Date.now() }); return true }
      // サーバーがID/PWを拒否＝これ以上試すとロックの恐れ。即停止（再保存まで自動試行しない）。
      set({ samuraiReloginBlocked: true, samuraiReloginResult: 'failed', samuraiReloginReason: 'invalid-creds', samuraiReloginAt: Date.now() }); postStatus(false, 'auth'); return false
    } catch (e) {
      // 通信エラーはID/PW拒否ではない→停止はせず、5分後・上限内で再試行可
      set({ samuraiReloginResult: 'failed', samuraiReloginReason: 'fetch-error', samuraiReloginAt: Date.now() }); postStatus(false, 'auth'); return false
    }
  }

  const norm = s => (s == null ? '' : String(s)).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
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
  // 住所抽出：ラベルと同じセルから「漢字の都道府県以降（市区町村＋番地）」を切り出す。〒・カナのフリガナは除外。
  const PREF_RE = /(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/
  const addrOf = (doc, label) => {
    const cell = [...doc.querySelectorAll('th,td')].find(c => textOf(c).startsWith(label))
    if (!cell) return ''
    let s = textOf(cell); if (s.startsWith(label)) s = s.slice(label.length).trim()
    const m = s.match(PREF_RE)
    if (m) return s.slice(m.index).trim()
    return s.replace(/〒?\d{3}-\d{4}/, '').trim()
  }
  const HDR = { accept: 'text/html', 'cache-control': 'no-cache', pragma: 'no-cache' }
  // 「今日」は毎回その場で算出する（注入時に凍結した todayMD を使うと、0時をまたいだ瞬間に
  // 新しい日のリードが「今日ではない」と判定されて未送信のまま seen 入り＝恒久ロストになるため）。
  const curMD = () => { const d = new Date(); return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') }
  const isToday = rs => /^\d{2}\/\d{2}/.test(rs || '') && String(rs).slice(0, 5) === curMD()

  const send = (lead) => new Promise(res => {
    let done = false
    try {
      chrome.runtime.sendMessage({ type: 'NEW_LEAD', lead }, r => { done = true; if (chrome.runtime.lastError) res(null); else res(r) })
    } catch { res(null) }
    setTimeout(() => { if (!done) res(null) }, 4000)
  }).then(r => r || fetch(INBOUND, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }).then(() => ({ ok: true })).catch(() => ({ ok: false })))

  async function fetchDoc(url, mode) {
    // 一覧は no-cache（条件付きGET：変化なしは304で軽量／古い内容は出さない）。詳細は no-store。
    const r = await fetch(url, { credentials: 'include', cache: mode || 'no-store', headers: HDR })
    if (!r.ok) throw new Error(String(r.status))
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html')
    try { doc.__srcUrl = r.url } catch {} // リダイレクト後の最終URL（フォームaction解決の基準に使う）
    return doc
  }

  // form1 の全項目（hidden・CSRF・他フィルタ含む）を name→value で読む。
  // 手動フィルターはフォーム全項目を送るため、日付だけ差し替えて“同じ全項目”を送ると成立率が高い。
  function readForm1Fields(doc) {
    const form = doc.querySelector('#form1') || doc.querySelector('form[action*="/admin/request/list"]')
    if (!form) return null
    const f = {}
    for (const el of form.querySelectorAll('input, select, textarea')) {
      const name = el.getAttribute('name'); if (!name) continue
      if (el.tagName === 'SELECT') {
        const sel = el.querySelector('option[selected]') || el.querySelector('option')
        f[name] = sel ? (sel.getAttribute('value') || '') : ''
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        if (el.hasAttribute('checked')) f[name] = el.getAttribute('value') || 'on'
      } else {
        f[name] = el.getAttribute('value') || ''
      }
    }
    return f
  }

  // 当日フィルターPOST：管理画面の検索フォーム(form.submit)が実際に送る全項目を再現し、日付だけ今日にする。
  // ★実機キャプチャで確定した本文。date_at.hour="0" / date_to.hour="24"（終日）と reply_status_mode="2" が必須。
  //   これらが欠けると結果0件になる（時刻を空で送っていたのが今までの原因）。
  async function fetchTodayDoc() {
    const d = new Date()
    const y = String(d.getFullYear()), mo = String(d.getMonth() + 1), da = String(d.getDate())
    const p = new URLSearchParams()
    p.set('request[key_word]', ''); p.set('request[current_address]', ''); p.set('request[new_address]', '')
    p.set('request[date_at][year]', y); p.set('request[date_at][month]', mo); p.set('request[date_at][day]', da); p.set('request[date_at][hour]', '0')
    p.set('request[date_to][year]', y); p.set('request[date_to][month]', mo); p.set('request[date_to][day]', da); p.set('request[date_to][hour]', '24')
    p.set('request[move_scheduled_date][year]', y); p.set('request[move_scheduled_date][month]', ''); p.set('request[move_scheduled_date][day]', '')
    p.set('request[move_scheduled_to][year]', ''); p.set('request[move_scheduled_to][month]', ''); p.set('request[move_scheduled_to][day]', '')
    p.set('request[re_contact_sort]', '0')
    p.set('request[re_contact_time][year]', ''); p.set('request[re_contact_time][month]', ''); p.set('request[re_contact_time][day]', ''); p.set('request[re_contact_time][hour]', '')
    p.set('request[re_contact_to][year]', ''); p.set('request[re_contact_to][month]', ''); p.set('request[re_contact_to][day]', ''); p.set('request[re_contact_to][hour]', '')
    p.set('request[reply_status_mode]', '2')
    p.set('request[_csrf_token]', window.__tfSamuraiToken || '')
    p.set('type', '')
    const r = await fetch(LIST, { method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'text/html', 'cache-control': 'no-cache', pragma: 'no-cache' }, body: p.toString() })
    if (!r.ok) throw new Error('POST ' + r.status)
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html')
    try { doc.__srcUrl = r.url } catch {}
    try { const t = doc.querySelector('input[name="request[_csrf_token]"]'); if (t) window.__tfSamuraiToken = t.getAttribute('value') || '' } catch {} // 応答のトークンを次回に引き継ぐ
    return doc
  }

  // 当日フィルター(POST)で軽い一覧を取得。ただし「当日リードが実際に返った時（詳細リンクあり）」だけ採用する。
  // 空/失敗/フォーム未取得なら全件GETへフォールバック（確実に取得＋form1全項目とトークンをキャッシュ）。
  // __tfSamuraiHeavy=重いGETを使ったか。tick側で重いGET後は次回巡回を60秒以上に空け、15秒連打の504再発を防ぐ。
  async function fetchList() {
    try {
      const doc = await fetchTodayDoc()
      if (doc && doc.querySelector('input[type="password"]')) { window.__tfSamuraiHeavy = false; return doc } // ログイン画面→再ログインへ
      if (doc && doc.querySelector('a[href*="/request/detail/id/"]')) { window.__tfSamuraiHeavy = false; return doc } // 当日リードあり→軽い応答を採用
      // ここに来る＝フィルターが空/未取得。全件GETへ。
    } catch (e) { /* POST失敗→GETへ */ }
    const full = await fetchDoc(LIST, 'no-cache') // フィルター空/失敗→従来の全件GET（確実に取得）
    window.__tfSamuraiHeavy = true // 重いGETを使った→次回巡回は60秒以上空ける
    try { const t = full.querySelector('input[name="request[_csrf_token]"]'); if (t) window.__tfSamuraiToken = t.getAttribute('value') || '' } catch {} // 次回POST用にトークン確保
    const nf = readForm1Fields(full); if (nf) window.__tfSamuraiForm = nf // form1全項目をキャッシュ（次回フィルターPOSTの土台）
    return full
  }

  async function tick() {
    if (window.__tfSamuraiGen !== gen) return // 新しい注入が来たら旧ループは終了
    try {
      const _listT0 = Date.now()
      let ldoc = await fetchList()
      const listMs = Date.now() - _listT0 // B:一覧取得の所要(ms)
      // ログイン画面が返る＝セッション切れ。まず自動再ログインを試み、ダメなら未接続通知してスキップ。
      if (ldoc && ldoc.querySelector('input[type="password"]')) {
        const ok = await relogin(ldoc)
        if (ok) { try { ldoc = await fetchList() } catch {} }
        if (!ldoc || ldoc.querySelector('input[type="password"]')) {
          if (window.__tfSamuraiGen === gen) setTimeout(tick, nextDelay())
          return
        }
      }
      const links = [...ldoc.querySelectorAll('a[href*="/request/detail/id/"]')]
      window.__tfSamuraiFail = 0 // 取得成功＝連続エラーをリセット
      postStatus(true, '', links.length) // 生存ハートビート
      try { chrome.storage.local.set({ samuraiLastPollAt: Date.now(), samuraiLastPollCount: links.length }) } catch {} // 最終巡回（稼働）時刻
      if (links.length) {
        const dd = new Set(); const rows = []
        for (const a of links) { const m = (a.getAttribute('href') || '').match(/id\/(\d+)/); if (m && !dd.has(m[1])) { dd.add(m[1]); rows.push(baseOf(m[1], a.closest('tr'))) } }
        let changed = false
        rows.forEach(r => { if (!isToday(r.receivedAt) && !seen.has(r.id)) { seen.add(r.id); changed = true } })
        const fresh = rows.filter(r => isToday(r.receivedAt) && !seen.has(r.id))
        let cnt = 0
        for (const base of fresh.slice(0, PER)) {
          if (window.__tfSamuraiGen !== gen) return
          try {
            const _detT0 = Date.now()
            const doc = await fetchDoc('/admin/request/detail/id/' + base.id)
            const detailMs = Date.now() - _detT0 // D:詳細取得の所要(ms)
            const map = buildLabelMap(doc); const get = k => map[k] || ''
            const phone = (get('電話番号').match(/0\d{1,4}-\d{1,4}-\d{3,4}/) || [''])[0]
            const email = (get('メールアドレス').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0]
            const name = get('名前').replace(/\s*様$/, '').replace(/\s*さん$/, '') || base.name
            const k = parseKazaiFull(doc)
            const lead = { site: '引越し侍', key: phone || ('引越し侍:' + base.id), phone, name, kana: get('フリガナ'), email, count: get('引越し人数') || base.type, from: addrOf(doc, '現住所') || base.fromPref, to: addrOf(doc, '引越し先') || base.toPref, receivedAt: base.receivedAt, moveDate: get('引越し希望日') || base.moveDate, preferredTime: get('引越し希望時間'), referenceFee: get('表示料金相場'), request: get('備考・その他要望'), orderId: String(base.id), kazai: k.kazai, boxCount: k.boxCount, detail: true, timing: { list: listMs, detail: detailMs }, detectedAt: new Date().toISOString() }
            const r = await send(lead)
            if (r && r.ok) { seen.add(base.id); changed = true; cnt++ }
          } catch (e) { /* skip */ }
          await new Promise(res => setTimeout(res, GAP))
        }
        if (changed) persist()
        if (cnt) { console.log('[リード監視:引越し侍] 送信', cnt, '件'); try { chrome.storage.local.set({ samuraiLastLeadAt: Date.now(), samuraiLastLeadCount: cnt }) } catch {} } // 最終取り込み（新規）時刻
      }
    } catch (e) {
      // 一覧取得失敗（504等）。連続エラー時はバックオフして負荷・検知を抑える。CRMには取得エラーを通知。
      window.__tfSamuraiFail = (window.__tfSamuraiFail || 0) + 1
      postStatus(false, 'error')
    }
    if (window.__tfSamuraiGen === gen) {
      const f = window.__tfSamuraiFail || 0
      let delay
      if (f > 0) delay = Math.min(nextDelay() * Math.pow(2, Math.min(f, 5)), 30 * 1000) // 連続エラーで最大30秒まで指数バックオフ
      else delay = window.__tfSamuraiHeavy ? Math.max(nextDelay(), 45000) : nextDelay() // 重いGET後は45秒以上（最悪でも50秒以内に取得）、軽いフィルターは約15秒
      setTimeout(tick, delay)
    }
  }
  tick()
}
