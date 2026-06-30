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
  if (alarm.name === SAMURAI_ALARM) ensureSamuraiLoop()
})

// 引越し侍タブが読み込まれたら高速ループを注入（開き直し時も自動で復帰）
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete' && tab && tab.url && tab.url.startsWith('https://hikkosizamurai.com/admin')) {
    ensureSamuraiLoop()
  }
})
ensureSamuraiLoop() // SW起動時にも一度試行

// ===== ズバット セッション・キープアライブ =====
async function keepAlive() {
  try {
    const { lastBeatAt } = await chrome.storage.local.get(['lastBeatAt'])
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
  const td = new Date()
  const todayMD = String(td.getMonth() + 1).padStart(2, '0') + '/' + String(td.getDate()).padStart(2, '0')
  const gen = Date.now()
  try {
    await chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, func: samuraiLoop, args: [gen, todayMD] })
  } catch (e) { /* タブが閉じた等 */ }
}

// ページに注入される自己完結ループ。約8秒ごとに一覧(no-store)を取得し、
// 当日(依頼日=今日)で未送信のものだけ詳細取得して background(NEW_LEAD) へ送る。
function samuraiLoop(gen, todayMD) {
  window.__tfSamuraiGen = gen
  window.__tfSamuraiSeen = window.__tfSamuraiSeen || [] // ページ存続中の取込済みid（リロードで自然リセット→当日分は再送・サーバ重複除外）
  const seen = new Set(window.__tfSamuraiSeen)
  const persist = () => { window.__tfSamuraiSeen = Array.from(seen).slice(-5000) }
  const PER = 8, GAP = 300, FAST_MS = 15000, SLOW_MS = 120000
  // 巡回間隔：ほぼ終日(7-24時)は15秒＋0〜8秒ジッター、深夜(0-7時)は120秒に減速（負荷・BAN配慮）
  const nextDelay = () => { const h = new Date().getHours(); const base = (h >= 7 && h < 24) ? FAST_MS : SLOW_MS; return base + Math.floor(Math.random() * 8000) }
  const INBOUND = 'https://transportfukuoka.vercel.app/api/inbound'

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
  const isToday = rs => /^\d{2}\/\d{2}/.test(rs || '') && String(rs).slice(0, 5) === todayMD

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
    return new DOMParser().parseFromString(await r.text(), 'text/html')
  }

  async function tick() {
    if (window.__tfSamuraiGen !== gen) return // 新しい注入が来たら旧ループは終了
    try {
      const ldoc = await fetchDoc('/admin/request/list', 'no-cache')
      const links = [...ldoc.querySelectorAll('a[href*="/request/detail/id/"]')]
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
            const doc = await fetchDoc('/admin/request/detail/id/' + base.id)
            const map = buildLabelMap(doc); const get = k => map[k] || ''
            const phone = (get('電話番号').match(/0\d{1,4}-\d{1,4}-\d{3,4}/) || [''])[0]
            const email = (get('メールアドレス').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0]
            const name = get('名前').replace(/\s*様$/, '').replace(/\s*さん$/, '') || base.name
            const k = parseKazaiFull(doc)
            const lead = { site: '引越し侍', key: phone || ('引越し侍:' + base.id), phone, name, kana: get('フリガナ'), email, count: get('引越し人数') || base.type, from: addrOf(doc, '現住所') || base.fromPref, to: addrOf(doc, '引越し先') || base.toPref, receivedAt: base.receivedAt, moveDate: get('引越し希望日') || base.moveDate, preferredTime: get('引越し希望時間'), referenceFee: get('表示料金相場'), request: get('備考・その他要望'), orderId: String(base.id), kazai: k.kazai, boxCount: k.boxCount, detail: true, detectedAt: new Date().toISOString() }
            const r = await send(lead)
            if (r && r.ok) { seen.add(base.id); changed = true; cnt++ }
          } catch (e) { /* skip */ }
          await new Promise(res => setTimeout(res, GAP))
        }
        if (changed) persist()
        if (cnt) console.log('[リード監視:引越し侍] 送信', cnt, '件')
      }
    } catch (e) { /* 一覧取得失敗。次のtickで再試行 */ }
    if (window.__tfSamuraiGen === gen) setTimeout(tick, nextDelay())
  }
  tick()
}
