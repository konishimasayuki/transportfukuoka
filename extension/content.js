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
const API_URL = 'https://transportfukuoka.vercel.app/api/inbound'

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

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/
function findEmail(tds) {
  for (const td of tds) {
    const m = (td.innerText || '').match(EMAIL_RE)
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
    email:      findEmail(tds),
  }
}

let enabled = true
let baselined = false       // このセッションで基準化処理を通したか
let everBaselined = false   // 過去に一度でも基準化したか（永続。再起動の差分取り込み判定に使う）
let scanning = false
const seen = new Set()

// 拡張コンテキスト無効化（再読み込み直後など）でも例外で処理を止めないよう、
// chrome.storage 書き込みは必ずこの安全版を通す。失敗しても in-memory 状態は有効。
function safeStorageSet(obj) {
  try {
    if (chrome.runtime && chrome.runtime.id) chrome.storage.local.set(obj)
  } catch (e) { /* context invalidated → 無視（次回F5で復帰、送信は directSend で継続） */ }
}

function persistSeen() {
  safeStorageSet({ seenKeys: Array.from(seen).slice(-3000) })
}

// 拡張コンテキストが無効化されても送れるよう、APIへ直接POST（CORSは * 許可済み）
function directSend(lead) {
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lead),
  })
    .then(r => r.json())
    .then(d => ({ ok: true, duplicate: !!(d && d.duplicate) }))
    .catch(e => ({ ok: false, error: String(e) }))
}

// 通常は background 経由（バッジ更新のため）。コンテキスト無効化時は直接送信にフォールバック。
function sendLead(l) {
  const lead = { site: SITE, key: l.phone, ...l, detectedAt: new Date().toISOString() }
  return new Promise(resolve => {
    if (chrome.runtime && chrome.runtime.id) {
      try {
        chrome.runtime.sendMessage({ type: 'NEW_LEAD', lead }, (res) => {
          if (chrome.runtime.lastError || !res) { directSend(lead).then(resolve); return }
          resolve(res)
        })
        return
      } catch (e) { /* fall through */ }
    }
    directSend(lead).then(resolve)
  })
}

// ===== 詳細ページ（/users/detail/...）の取得 =====
function dtext(el) {
  return (el && el.innerText ? el.innerText : '').replace(/\s+/g, ' ').trim()
}

// 詳細ページから情報を抽出。リードの from/to/moveDate 等は一覧側が書くので
// ここでは「詳細にしか無い項目」中心に集める（一覧の再スキャンと衝突させない）。
// doc を渡すと別ドキュメント（裏のiframe等）からも抽出できる。
function scrapeDetail(doc = document) {
  const d = { site: SITE, detail: true }

  // プロフィール（PC: label/value）
  const prof = {}
  doc.querySelectorAll('.profileBlock_content_row_col_item').forEach(it => {
    const label = dtext(it.querySelector('.profileBlock_content_row_col_item_label'))
    const value = dtext(it.querySelector('.profileBlock_content_row_col_item_value'))
    if (label) prof[label] = value
  })
  const telRaw = prof['電話番号'] || ''
  const m = telRaw.match(PHONE_RE)
  d.phone = m ? m[0] : telRaw
  d.name = prof['名前'] || ''
  d.kana = prof['フリガナ'] || ''
  d.email = prof['メールアドレス'] || ''
  d.count = prof['引越し人数'] || ''
  d.orderId = prof['依頼者番号'] || ''
  d.requestedAt = prof['依頼日'] || ''
  d.moveDateDetail = prof['引越し希望日'] || ''
  d.request = prof['その他ご要望'] || ''
  d.option = prof['依頼作業(オプション)'] || ''

  // 住所（SP infoBlock をセクション見出しで判定：構造が素直）
  doc.querySelectorAll('.infoBlock_wrapper').forEach(w => {
    const header = dtext(w.querySelector('.infoBlock_wrapper_header'))
    if (header !== '引越し元' && header !== '引越し先') return
    const rows = {}
    w.querySelectorAll('.infoBlock_wrapper_row').forEach(r => {
      const l = dtext(r.querySelector('.infoBlock_wrapper_row_label'))
      const c = dtext(r.querySelector('.infoBlock_wrapper_row_cont'))
      if (l) rows[l] = c
    })
    if (header === '引越し元') {
      d.fromZip = rows['郵便番号'] || ''
      d.fromAddress = rows['住所'] || ''
      d.fromType = rows['建物種別'] || ''
    } else {
      d.toZip = rows['郵便番号'] || ''
      d.toAddress = rows['住所'] || rows['市区町村'] || ''
      d.toType = rows['建物種別'] || ''
    }
  })

  // 対応状況（PC）
  doc.querySelectorAll('.statusBlockPc_content_row_col_item').forEach(it => {
    const label = dtext(it.querySelector('.statusBlockPc_content_row_col_item_label'))
    const value = dtext(it.querySelector('.statusBlockPc_content_row_col_item_value'))
    if (label === '電話連絡') d.telStatus = value
    if (label === 'メール対応') d.mailStatus = value
  })

  // 家財状況（PC：数量>0 のみ。ダンボールは別枠）
  const kazai = []
  doc.querySelectorAll('.kazaiBlock[data-device="pc"] .kazaiBlock_wrapper_row_item').forEach(it => {
    const name = dtext(it.querySelector('.kazaiBlock_wrapper_row_item_label'))
    const qtyT = dtext(it.querySelector('.kazaiBlock_wrapper_row_item_cont'))
    if (!name) return
    const n = parseInt(qtyT, 10)
    if (name === 'ダンボール') { d.boxCount = qtyT; return }
    if (n > 0) kazai.push({ name, qty: n })
  })
  d.kazai = kazai
  d.kazaiUnknown = 0 // DOMからは全品名が取れるので未知ぶんは無い（裏取得の「他N品」を打ち消す）

  d.key = d.phone
  d.detailFetchedAt = new Date().toISOString()
  return d
}

// 詳細ページから取得して1回だけ送信（SPA描画待ちのリトライ付き）
function captureDetail() {
  const url = location.href
  let done = false
  const trySend = async () => {
    if (done) return true
    if (location.href !== url) return true // 別ページへ移動した
    const d = scrapeDetail()
    if (!d.phone) return false // まだ描画中
    done = true
    const res = await sendLead(d)
    console.log(`[リード監視:${SITE}] 詳細取得`, d.phone, (res && res.ok) ? 'OK' : 'NG', `家財${(d.kazai || []).length}種`)
    return true
  }
  trySend()
  const iv = setInterval(async () => { if (await trySend()) clearInterval(iv) }, 800)
  setTimeout(() => clearInterval(iv), 15000)
}

// SPA(Nuxt)は遷移で content script が再実行されないため、URL変化を監視して詳細を取得
let lastDetailUrl = ''
function checkDetailRoute() {
  if (!location.pathname.startsWith('/users/detail/')) return
  if (location.href === lastDetailUrl) return
  lastDetailUrl = location.href
  console.log(`[リード監視:${SITE}] 詳細ページ検知 → 取得`, location.pathname)
  captureDetail()
}

// =====================================================================
// バックグラウンド自動取得（ズバットAPI経由）
//  スタッフが各詳細ページを開かなくても、新着リードを検知して
//  詳細（フリガナ/メール/住所/家財）まで自動でCRMに取り込む。
//  経路はすべて実機検証済み：
//   1) GET  /csrf                         → { csrfToken }
//   2) POST /supplier-kanri/order-info-list（csrf-tokenヘッダ・期間/件数指定）
//      → 各リードに orderId / companyId が付く
//   3) POST /supplier-kanri/order-info {orderId, companyId} → 詳細JSON（detailFromApi）
// =====================================================================
const ZBA_API = 'https://hikkoshi-kanri.zba.jp/hikkoshi-kanriengine-api'
const DETAIL_DAYS_BACK = 14        // 取得対象の期間（直近N日）
const DETAIL_PER_CYCLE = 8         // 1サイクルで取得する詳細の最大件数（API直叩きなので軽い）
const DETAIL_GAP_MS    = 500       // 詳細取得の間隔（負荷配慮）
const API_SYNC_MS      = 60000     // APIサイクル間隔
// 詳細取り込みロジックを変えたら +1。既存の取得済みフラグをリセットして全件取り直す。
const DETAIL_VERSION   = 3          // v3: 家財品名マップを43品に拡充（乾燥機/ゴルフセット追加）
const detailDone = new Set()       // 詳細取得済みの orderId（永続）

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
function persistDetailDone() {
  safeStorageSet({ detailDoneIds: Array.from(detailDone).slice(-3000) })
}
function yyyymmdd(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

async function getCsrfToken() {
  const r = await fetch(`${ZBA_API}/csrf`, { credentials: 'include', headers: { accept: 'application/json' } })
  const j = await r.json()
  return j && j.csrfToken
}

// 一覧APIを叩いて注文リスト（orderId/companyId付き）を取得
async function fetchOrderList() {
  const token = await getCsrfToken()
  if (!token) throw new Error('csrf token取得失敗')
  const to = new Date()
  const from = new Date(Date.now() - DETAIL_DAYS_BACK * 86400000)
  const body = {
    orderNewId: null, nameKanji1: null, nameKanji2: null, nameKana1: null, nameKana2: null,
    tel: null, email: null, prefId: null, nextPrefId: null,
    completeDateFrom: yyyymmdd(from), completeDateTo: yyyymmdd(to),
    dateFixId: null, month: null, day: null, personNum: null,
    supportStatusTel: null, memo: null, limit: 100, offset: 1,
  }
  const r = await fetch(`${ZBA_API}/supplier-kanri/order-info-list`, {
    method: 'POST', credentials: 'include',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'accept-language': 'ja', 'csrf-token': token },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('order-info-list ' + r.status)
  const j = await r.json()
  return (j && j.response) || []
}

// 一覧APIの1件 → CRMリード（基本情報）
// 注意：CRMの orderId は「依頼者番号(=orderNewId)」を指す（詳細スクレイプと統一）。
//       API内部の o.orderId（詳細URL用）はリードには載せない（衝突防止）。
function leadFromApi(o) {
  return {
    site: SITE,
    key: o.tel,
    phone: o.tel,
    name: o.fullNameKanji || '',
    count: o.personNum ? `${o.personNum}人` : '',
    from: [o.address1, o.address2].filter(Boolean).join(''),
    to: [o.nextAddress1, o.nextAddress2].filter(Boolean).join(''),
    receivedAt: o.completeDate || '',
    moveDate: o.preferredDate || '',
    memo: o.memo || '',
    orderId: o.orderNewId != null ? String(o.orderNewId) : '',
  }
}

// 家財コード→品名の対応表（実機の指紋照合で確定。ズバットのマスタは固定）。
// 未掲載のコードは「全サンプルで数量0だったレア品/未使用の汎用名」。出現時は種類数に数え、
// 品名はスタッフが詳細ページを開いた時の DOM 取得（scrapeDetail）で充足する。
const KAZAI_MAP = {
  kazai_02: 'ドレッサー', kazai_04: '布団類', kazai_05: '衣装ケース', kazai_07: 'リビングテーブル',
  kazai_08: 'サイドボード・テレビ台', kazai_12: 'デスクトップパソコン', kazai_13: 'エアコン',
  kazai_15: 'シャンデリア・スタンド', kazai_18: 'ダイニングテーブルセット', kazai_23: 'ストーブ・ヒーター',
  kazai_20: '乾燥機', kazai_24: '扇風機', kazai_25: 'こたつ', kazai_27: 'ゴルフセット', kazai_30: '自転車',
  kazai_40: 'ソファ（1人掛け）', kazai_41: 'ソファ（2人掛け）', kazai_42: 'ソファ（3人掛け）',
  kazai_43: 'テレビ（40インチ未満）', kazai_44: 'テレビ（40インチ以上）',
  kazai_45: 'チェスト（大）', kazai_46: 'チェスト（中・小）', kazai_47: 'ミニコンポ',
  kazai_48: '絨毯・カーペット（10畳未満）', kazai_49: '絨毯・カーペット（10畳以上）',
  kazai_50: '冷蔵庫（２ドア）', kazai_51: '冷蔵庫（3ドア）', kazai_52: '食器棚（大）',
  kazai_53: '食器棚（中・小）', kazai_54: '電子レンジ', kazai_55: '洗濯機（縦型）',
  kazai_56: '洗濯機（ドラム式）', kazai_57: 'ベッド（シングル）', kazai_58: 'ベッド（セミダブル）',
  kazai_59: 'ベッド（ダブル）', kazai_60: 'タンス（中・小）', kazai_61: 'タンス（大）',
  kazai_62: '本棚（中・小）', kazai_63: '本棚（大）', kazai_64: '机', kazai_65: '椅子',
  kazai_67: '物干し竿', kazai_70: 'ステレオ',
}

// 詳細APIの1件 → CRMリード（詳細）。scrapeDetail と同じ形に揃えるのでモーダルがそのまま表示できる。
// 家財は kazai_NN（コード）→ KAZAI_MAP で品名に変換。未掲載コードは unknownCount として種類数に加算。
function detailFromApi(o) {
  const join = (...xs) => xs.filter(s => s != null && s !== '').join('')
  const kazai = []
  let unknownCount = 0
  for (const [k, v] of Object.entries(o)) {
    if (!k.startsWith('kazai_')) continue
    const q = Number(v) || 0
    if (q <= 0) continue
    const name = KAZAI_MAP[k]
    if (name) kazai.push({ name, qty: q })
    else unknownCount++
  }
  const kazaiCount = kazai.length + unknownCount
  const m = String(o.tel || '').match(PHONE_RE)
  const phone = m ? m[0] : (o.tel || '')
  return {
    site: SITE, detail: true,
    phone, key: phone,
    name: [o.nameKanji1, o.nameKanji2].filter(Boolean).join(' '),
    kana: [o.nameKana1, o.nameKana2].filter(Boolean).join(' '),
    email: o.mail || '',
    count: o.personNum ? `${o.personNum}人` : '',
    orderId: o.orderNewId != null ? String(o.orderNewId) : '',
    requestedAt: o.completeDate || '',
    moveDateDetail: o.preferredDate || '',
    fromZip: o.zip || '',
    fromAddress: join(o.address1, o.address2, o.address3, o.address4, o.address5),
    fromType: o.houseType || '',
    toZip: '',
    toAddress: join(o.nextAddress1, o.nextAddress2),
    toType: '',
    telStatus: o.supportStatusTel ? '架電済' : '未架電',
    mailStatus: o.supportStatusMail ? 'メール済' : '未メール',
    request: o.orderComment || '',
    option: o.workOption || '',
    memo: o.memo || '',
    boxCount: o.cardboard_box != null ? String(o.cardboard_box) : '',
    kazai,
    kazaiCount,
    kazaiUnknown: unknownCount,
    detailFetchedAt: new Date().toISOString(),
  }
}

// 詳細を API で取得して送信（POST /supplier-kanri/order-info {orderId, companyId} + csrf）
async function fetchDetailViaApi(orderId, companyId) {
  try {
    const token = await getCsrfToken()
    if (!token) { console.warn(`[リード監視:${SITE}] 詳細API csrf取得失敗`, orderId); return false }
    const r = await fetch(`${ZBA_API}/supplier-kanri/order-info`, {
      method: 'POST', credentials: 'include',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'accept-language': 'ja', 'csrf-token': token },
      body: JSON.stringify({ orderId, companyId }),
    })
    if (!r.ok) { console.warn(`[リード監視:${SITE}] 詳細API失敗`, orderId, r.status); return false }
    const j = await r.json()
    const o = j && j.response
    if (!o || !o.tel) { console.warn(`[リード監視:${SITE}] 詳細API 中身なし`, orderId); return false }
    const d = detailFromApi(o)
    const res = await sendLead(d)
    const ok = !!(res && res.ok)
    console.log(`[リード監視:${SITE}] 自動詳細取得`, d.phone, ok ? 'OK' : 'NG', `家財${d.kazaiCount}種・箱${d.boxCount || 0}`)
    return ok
  } catch (e) { console.warn(`[リード監視:${SITE}] 詳細API例外`, orderId, e); return false }
}

let apiSyncing = false
async function apiSync() {
  if (!enabled || apiSyncing) return
  if (window.top !== window.self) return // 念のため：サブフレームでは動かさない
  apiSyncing = true
  try {
    console.log(`[リード監視:${SITE}] API同期 開始`)
    let list
    try { list = await fetchOrderList() } catch (e) { console.warn(`[リード監視:${SITE}] API一覧取得失敗`, e); return }
    const todo = list.filter(o => o.orderId && !detailDone.has(o.orderId)).length
    console.log(`[リード監視:${SITE}] API同期 一覧${list.length}件 / 詳細未取得${todo}件`)
    if (!list.length) return

    // 1) 基本情報を未送信ぶんだけCRMへ
    let basic = 0
    for (const o of list) {
      const lead = leadFromApi(o)
      if (!lead.phone || seen.has(lead.phone)) continue
      const res = await sendLead(lead)
      if (res && res.ok) { seen.add(lead.phone); persistSeen(); basic++ }
    }
    if (basic) console.log(`[リード監視:${SITE}] 基本情報 ${basic}件 送信`)

    // 2) 詳細を未取得ぶんだけAPIで取得（新しい順・件数制限・間隔あり）
    let cnt = 0
    for (const o of list) {
      if (cnt >= DETAIL_PER_CYCLE) break
      if (!o.orderId || detailDone.has(o.orderId)) continue
      await fetchDetailViaApi(o.orderId, o.companyId)
      detailDone.add(o.orderId)
      persistDetailDone()
      cnt++
      await sleep(DETAIL_GAP_MS)
    }
    console.log(`[リード監視:${SITE}] API同期 完了（今回 詳細${cnt}件）`)
  } finally {
    apiSyncing = false
  }
}

async function init() {
  const st = await chrome.storage.local.get(['enabled', 'seenKeys', 'everBaselined', 'detailDoneIds', 'detailVersion'])
  enabled = st.enabled !== false
  everBaselined = st.everBaselined === true
  ;(st.seenKeys || []).forEach(k => seen.add(k))
  // 詳細ロジックのバージョンが上がっていたら取得済みフラグを破棄し、新ロジックで全件取り直す
  if (st.detailVersion === DETAIL_VERSION) {
    ;(st.detailDoneIds || []).forEach(k => detailDone.add(k))
  } else {
    safeStorageSet({ detailDoneIds: [], detailVersion: DETAIL_VERSION })
    console.log(`[リード監視:${SITE}] 詳細ロジック更新(v${DETAIL_VERSION}) → 全件 再取得`)
  }

  // 一覧監視（詳細ページでは行が無いので空振りするだけ＝無害）
  doScan()
  observe()
  setInterval(doScan, 20000) // 取りこぼし自動リトライ＋定期チェック

  // 詳細ページ取得（初回＋SPA遷移を1秒ごとに検知）
  checkDetailRoute()
  setInterval(checkDetailRoute, 1000)

  // バックグラウンド自動取得（API経由：開かなくても新着の詳細まで取り込む）
  apiSync()
  setInterval(apiSync, API_SYNC_MS)

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
        safeStorageSet({ everBaselined: true })
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
