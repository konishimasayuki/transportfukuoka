// =====================================================================
// 引越し侍 監視（content script）
// 対象: https://hikkosizamurai.com/admin/*
//
// ズバットと違い、引越し侍はサーバー描画のHTML（SPA/JSON APIではない）。
// よって「リストHTMLを裏でfetch → 新着の依頼番号を検知 → 詳細HTMLをfetch
// → 解析 → /api/inbound へ送信」という方式で監視する。
// ログイン中のタブが1枚開いていれば、画面リロード無しで新着を取り込む。
//
// 設計メモ:
//  - 初回は表示中の全件を「既知」にしてベースライン化（過去分の一括取込を防止）
//  - 以降は seen に無い依頼番号だけ詳細取得して送信（1サイクルの件数を制限）
//  - 送信は background(NEW_LEAD) 経由。失敗時は直接 /api/inbound へPOST（フォールバック）
//  - セッション切れ（ログイン画面へ飛ばされ詳細リンク0件）はコンソールに明示
// =====================================================================
(() => {
  if (window.top !== window.self) return // サブフレームでは動かさない

  const SITE = '引越し侍'
  const INBOUND_URL = 'https://transportfukuoka.vercel.app/api/inbound'
  const LIST_PATH = '/admin/request/list'
  const detailPath = (id) => `/admin/request/detail/id/${id}`

  const FAST_MS = 15000   // 営業時間中のリスト巡回（15秒）
  const SLOW_MS = 120000  // 営業時間外（2分）
  const BUSY_FROM = 8, BUSY_TO = 23
  const DETAIL_PER_CYCLE = 8   // 1サイクルで取得する詳細の最大件数
  const DETAIL_GAP_MS = 600    // 詳細取得の間隔（負荷配慮）

  const log = (...a) => console.log(`[リード監視:${SITE}]`, ...a)
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const norm = (s) => (s == null ? '' : String(s)).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  const textOf = (el) => norm(el ? el.textContent : '')

  function safeStorageSet(obj) { try { if (chrome.storage && chrome.storage.local) chrome.storage.local.set(obj) } catch {} }

  // ---- 状態（永続）----
  let enabled = true
  let everBaselined = false
  const seen = new Set()             // 取込済みの依頼番号
  let timer = null
  let polling = false
  let lastKickAt = 0

  function persistSeen() { safeStorageSet({ samuraiSeen: Array.from(seen).slice(-5000), samuraiBaselined: true }) }

  // ---- 送信 ----
  async function directSend(lead) {
    try {
      const r = await fetch(INBOUND_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) })
      const d = await r.json().catch(() => ({}))
      return { ok: true, duplicate: !!(d && d.duplicate) }
    } catch (e) { return { ok: false, error: String(e) } }
  }
  async function sendLead(lead) {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        const viaBg = await new Promise(res => {
          try {
            chrome.runtime.sendMessage({ type: 'NEW_LEAD', lead }, r => { if (chrome.runtime.lastError) res(null); else res(r) })
          } catch { res(null) }
        })
        if (viaBg) return viaBg
      }
    } catch {}
    return directSend(lead) // コンテキスト無効化などのフォールバック
  }

  // ---- 解析ヘルパ ----
  // 各行の直下セルを [ラベル, 値, ラベル, 値, …] とみなしてマップ化（2カラムレイアウト対応）
  function buildLabelMap(doc) {
    const map = {}
    doc.querySelectorAll('tr').forEach(tr => {
      const cells = [...tr.children]
      for (let i = 0; i + 1 < cells.length; i++) {
        const k = textOf(cells[i])
        if (k && !(k in map)) map[k] = textOf(cells[i + 1])
      }
    })
    return map
  }

  // 依頼日 "6/30 10:20" → "06/30 10:20"（獲得スピード計算に合わせてゼロ埋め）
  function padMD(s) {
    const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/)
    if (!m) return s || ''
    return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')} ${m[3].padStart(2, '0')}:${m[4]}`
  }

  // リストの1行(tr)から基本情報を取り出す（巡回・取りこぼし取込で共用）
  function baseFromRow(id, tr) {
    const c = tr ? [...tr.children].map(textOf) : []
    return {
      id,
      name: c[1] || '',
      fromPref: c[2] || '',
      toPref: c[3] || '',
      type: c[4] || '',
      receivedAt: padMD(c[5] || ''),
      moveDate: c[6] || '',
    }
  }

  // 家財欄を解析して { kazai:[{name,qty}], boxCount } を返す。
  // 家財ラベルは rowspan で 家具/家電/その他/重量物 の複数行にまたがるため、
  // ラベル行＋後続のサブカテゴリ行をすべて読む。ダンボールは箱数として分離。
  const KAZAI_SUBCATS = new Set(['家具', '家電', 'その他', '重量物'])
  const KAZAI_SKIP = new Set(['家財', '家具', '家電', 'その他', '重量物'])
  function parseKazaiFull(doc) {
    const lbl = [...doc.querySelectorAll('th,td')].find(c => textOf(c) === '家財')
    if (!lbl) return { kazai: [], boxCount: '' }
    const rows = []
    let tr = lbl.closest('tr')
    if (tr) rows.push(tr)
    let nx = tr ? tr.nextElementSibling : null
    while (nx) {
      const first = textOf(nx.querySelector('th,td'))
      if (KAZAI_SUBCATS.has(first)) { rows.push(nx); nx = nx.nextElementSibling } else break
    }
    const tokens = rows.flatMap(r => [...r.querySelectorAll('th,td')]).flatMap(c => textOf(c).split(' ')).filter(Boolean)
    const kazai = []
    let boxCount = ''
    for (let i = 0; i < tokens.length; i++) {
      if (/^\d+$/.test(tokens[i])) {
        const qty = parseInt(tokens[i], 10)
        const name = tokens[i - 1]
        if (!name || KAZAI_SKIP.has(name)) continue
        if (name === 'ダンボール' || name === 'ダンボール箱') { if (qty > 0) boxCount = String(qty); continue }
        if (qty > 0) kazai.push({ name, qty })
      }
    }
    return { kazai, boxCount }
  }

  function parseDetailDoc(doc, id, base) {
    const map = buildLabelMap(doc)
    const get = (k) => map[k] || ''
    const phone = (get('電話番号').match(/0\d{1,4}-\d{1,4}-\d{3,4}/) || [''])[0]
    const email = (get('メールアドレス').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0]
    const name = get('名前').replace(/\s*様$/, '').replace(/\s*さん$/, '')
    const persons = get('引越し人数') || (base && base.type) || ''
    const k = parseKazaiFull(doc)
    return {
      phone,
      email,
      name: name || (base && base.name) || '',
      kana: get('フリガナ'),
      count: persons,
      moveDate: get('引越し希望日') || (base && base.moveDate) || '',
      preferredTime: get('引越し希望時間'),
      referenceFee: get('表示料金相場'),
      request: get('備考・その他要望'),
      kazai: k.kazai,
      boxCount: k.boxCount,
    }
  }

  function leadFromBase(base, detail) {
    return {
      site: SITE,
      key: detail.phone || `${SITE}:${base.id}`,
      phone: detail.phone || '',
      name: detail.name || base.name || '',
      kana: detail.kana || '',
      email: detail.email || '',
      count: detail.count || base.type || '',
      from: base.fromPref || '',
      to: base.toPref || '',
      receivedAt: base.receivedAt || '',
      moveDate: detail.moveDate || base.moveDate || '',
      preferredTime: detail.preferredTime || '',
      referenceFee: detail.referenceFee || '',
      request: detail.request || '',
      orderId: String(base.id),
      kazai: detail.kazai || [],
      boxCount: detail.boxCount || '',
      detail: true,
      detectedAt: new Date().toISOString(),
    }
  }

  // ---- リスト取得（新着検知）----
  async function fetchListRows() {
    // cache:'no-store' とキャッシュバスターで毎回サーバー最新を取得（HTTPキャッシュで古い一覧が返るのを防ぐ）
    const res = await fetch(`${LIST_PATH}?_=${Date.now()}`, {
      credentials: 'include', cache: 'no-store',
      headers: { accept: 'text/html', 'cache-control': 'no-cache', pragma: 'no-cache' },
    })
    if (!res.ok) throw new Error('list ' + res.status)
    const html = await res.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const links = [...doc.querySelectorAll('a[href*="/request/detail/id/"]')]
    if (links.length === 0) { const e = new Error('AUTH'); e.auth = true; throw e } // ログイン切れの可能性
    const rows = []
    const seenIds = new Set()
    for (const a of links) {
      const m = (a.getAttribute('href') || '').match(/id\/(\d+)/)
      if (!m) continue
      const id = m[1]
      if (seenIds.has(id)) continue
      seenIds.add(id)
      rows.push(baseFromRow(id, a.closest('tr')))
    }
    return rows
  }

  async function fetchDetail(id) {
    const res = await fetch(detailPath(id), { credentials: 'include', cache: 'no-store', headers: { accept: 'text/html', 'cache-control': 'no-cache' } })
    if (!res.ok) throw new Error('detail ' + res.status)
    const html = await res.text()
    return new DOMParser().parseFromString(html, 'text/html')
  }

  // ---- 巡回 ----
  async function pollTick() {
    if (!enabled || polling) { schedule(); return }
    polling = true
    try {
      let rows
      try {
        rows = await fetchListRows()
      } catch (e) {
        if (e && e.auth) log('⚠ ログイン切れの可能性。引越し侍に再ログインしてください')
        else log('リスト取得失敗', e)
        return
      }

      // 初回：全件を既知化（過去分の一括取込を防ぐ）
      if (!everBaselined) {
        rows.forEach(r => seen.add(r.id))
        everBaselined = true
        persistSeen()
        log(`初回ベースライン ${rows.length}件を既知化`)
        return
      }

      const fresh = rows.filter(r => !seen.has(r.id))
      if (fresh.length === 0) { log(`新着なし（一覧${rows.length}件）`); return }
      log(`新着 ${fresh.length}件 検知 → 詳細取得`)

      let cnt = 0
      for (const base of fresh) {
        if (cnt >= DETAIL_PER_CYCLE) break
        try {
          const doc = await fetchDetail(base.id)
          const detail = parseDetailDoc(doc, base.id, base)
          const lead = leadFromBase(base, detail)
          const r = await sendLead(lead)
          if (r && r.ok) { seen.add(base.id); persistSeen(); cnt++ }
        } catch (e) { log('詳細取得失敗', base.id, e) }
        await sleep(DETAIL_GAP_MS)
      }
      log(`送信 ${cnt}件 完了`)
    } finally {
      polling = false
      schedule()
    }
  }

  function inBusyHours() { const h = new Date().getHours(); return h >= BUSY_FROM && h < BUSY_TO }
  function schedule() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(pollTick, inBusyHours() ? FAST_MS : SLOW_MS)
  }
  function kickNow(reason) {
    if (!enabled) return
    const now = Date.now()
    if (now - lastKickAt < 8000) return
    lastKickAt = now
    log(`復帰トリガー(${reason}) → 即時チェック`)
    if (timer) clearTimeout(timer)
    pollTick()
  }

  // ---- 取りこぼし取込（手動）----
  // いま表示中のリストページ（1〜22ページのどれでも可）の依頼番号を全部集め、
  // 詳細を取得して送信する。重複はサーバー側で除外されるので新規だけ取り込まれる。
  async function resyncDisplayed() {
    const links = [...document.querySelectorAll('a[href*="/request/detail/id/"]')]
    const ids = []
    const dedup = new Set()
    for (const a of links) {
      const m = (a.getAttribute('href') || '').match(/id\/(\d+)/)
      if (m && !dedup.has(m[1])) { dedup.add(m[1]); ids.push({ id: m[1], tr: a.closest('tr') }) }
    }
    if (!ids.length) return { ok: false, error: 'リストの行が見つかりません。一覧ページを表示してから実行してください' }
    log(`取りこぼし取込 開始（表示中 ${ids.length}件）`)
    let added = 0, dup = 0, fail = 0
    for (const { id, tr } of ids) {
      try {
        const base = baseFromRow(id, tr)
        const doc = await fetchDetail(id)
        const detail = parseDetailDoc(doc, id, base)
        const lead = leadFromBase(base, detail)
        const r = await sendLead(lead)
        if (r && r.ok) { r.duplicate ? dup++ : added++; seen.add(id) } else fail++
      } catch (e) { fail++; log('取りこぼし詳細失敗', id, e) }
      await sleep(300)
    }
    persistSeen()
    log(`取りこぼし取込 完了（新規${added}・重複${dup}・失敗${fail}／${ids.length}件）`)
    return { ok: true, added, dup, fail, total: ids.length }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'SAMURAI_RESYNC') {
      resyncDisplayed().then(sendResponse).catch(e => sendResponse({ ok: false, error: String(e) }))
      return true // 非同期レスポンス
    }
  })

  async function init() {
    try {
      const st = await chrome.storage.local.get(['enabled', 'samuraiSeen', 'samuraiBaselined'])
      enabled = st.enabled !== false
      everBaselined = st.samuraiBaselined === true
      ;(st.samuraiSeen || []).forEach(k => seen.add(k))
    } catch {}
    log(`起動 enabled=${enabled} baselined=${everBaselined} / 巡回 ${FAST_MS / 1000}s（夜間${SLOW_MS / 1000}s）`)
    pollTick()
    window.addEventListener('online', () => kickNow('online'))
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kickNow('visible') })
  }

  init()
})()
