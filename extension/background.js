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
    // ズバットのタブがメモリセーバーで休止していたら復帰（content.jsを再起動して監視継続）
    try { const zt = await chrome.tabs.query({ url: 'https://hikkoshi-kanri.zba.jp/*' }); zt.forEach(t => { if (t.discarded) chrome.tabs.reload(t.id) }) } catch {}
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
  const PER = 8, GAP = 300, FAST_MS = 15000, SLOW_MS = 120000
  // 巡回間隔：ほぼ終日(7-24時)は15秒＋0〜8秒ジッター、深夜(0-7時)は120秒に減速（負荷・BAN配慮）
  const nextDelay = () => { const h = new Date().getHours(); const base = (h >= 7 && h < 24) ? FAST_MS : SLOW_MS; return base + Math.floor(Math.random() * 8000) }
  const INBOUND = 'https://transportfukuoka.vercel.app/api/inbound'
  const LIST = '/hikkoshi/vender/admin/Index'
  const DETAIL = id => '/hikkoshi/vender/admin/userdetail/?orderid=' + id

  const norm = s => (s == null ? '' : String(s)).replace(/　/g, ' ').replace(/\s+/g, ' ').trim()
  const textOf = el => norm(el ? el.textContent : '')
  const PHONE_RE = /0\d{9,10}|0\d{1,4}-\d{1,4}-\d{3,4}/
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
  const HDR = { accept: 'text/html', 'cache-control': 'no-cache', pragma: 'no-cache' }

  async function fetchDoc(url, mode) {
    const r = await fetch(url, { credentials: 'include', cache: mode || 'no-store', headers: HDR })
    if (!r.ok) throw new Error(String(r.status))
    return new DOMParser().parseFromString(await r.text(), 'text/html')
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

  // 依頼日 "2026/07/01 19:37:05" の先頭10文字が今日か
  const isToday = s => norm(s).slice(0, 10) === today

  async function tick() {
    if (window.__tfKakakuGen !== gen) return // 新しい注入が来たら旧ループは終了
    try {
      const ldoc = await fetchDoc(LIST, 'no-cache')
      const rows = [...ldoc.querySelectorAll('tr')].filter(tr => tr.querySelector('a[href*="userdetail"]'))
      if (rows.length) {
        const parsed = []; const dd = new Set()
        for (const tr of rows) {
          const a = tr.querySelector('a[href*="userdetail"]')
          const m = (a.getAttribute('href') || '').match(/orderid=(\d+)/)
          if (!m || dd.has(m[1])) continue
          dd.add(m[1])
          // 列: 0依頼日 1顧客ステータス 2引越し希望日 3人数 4元 5先 6名前 7電話 8メール 9同時見積社数 10見積もりID 11詳細
          const c = [...tr.children].map(textOf)
          parsed.push({
            id: m[1], requestedAt: c[0], status: c[1], moveDate: c[2], count: c[3],
            fromPref: c[4], toPref: c[5], name: c[6],
            phone: (c[7].match(PHONE_RE) || [''])[0], email: (c[8].match(EMAIL_RE) || [''])[0],
            quoteId: c[10] || '',
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
        if (cnt) console.log('[リード監視:価格.com] 送信', cnt, '件')
      }
    } catch (e) { /* 一覧取得失敗。次のtickで再試行 */ }
    if (window.__tfKakakuGen === gen) setTimeout(tick, nextDelay())
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
