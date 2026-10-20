import { placeCall, twilioReady } from './_twilio.js'
import { sendPushToAll } from './_push.js'
import { readItems, readVersioned, mutateWithVersion, redisCmd } from './_kvstore.js'
import { receivedAtMs } from '../src/lib/sortLeads.js'
import { META_MAX, PAGE, slimLead, newerFirst, buildMeta, writeMeta, readMeta, readMetaBoth } from './_leadmeta.js'

const KEY     = 'transportfukuoka:leads'
const VER_KEY = 'transportfukuoka:leads:ver'

// 新規リード検知時の自動架電（既定OFF。TWILIO_AUTOCALL=on で有効）
// 安全策：営業時間（JST 9:00〜20:00）内のみ・失敗しても保存は止めない
async function maybeAutoCall(lead) {
  if (process.env.TWILIO_AUTOCALL !== 'on') return
  if (!twilioReady() || !lead.phone) return
  const jstHour = (new Date().getUTCHours() + 9) % 24
  if (jstHour < 9 || jstHour >= 20) return
  try { await placeCall(lead.phone) } catch (e) { console.error('autocall failed:', e.message) }
}

// お知らせメッセージ（/api/broadcast で保存）。?recent 応答に混ぜて子拡張へ届ける。
const BROADCAST_KEY = 'transportfukuoka:broadcasts'

// 全件から「軽いほう＋全項目のほう」を作り、保存もしておく（サマリが無い時だけ通る）
async function rebuildMeta() {
  const { items: all, version } = await readVersioned(KEY, VER_KEY) // 本体と版を同時に読む
  writeMeta(all, version)
  return { all, ...buildMeta(all) }
}

// 広告費タブ用：受付日の月（YYYY-MM）。画面と同じ解釈（src/lib/sortLeads.js）を使う。
// サーバーはUTCで動くため、保存日時で判定するリードは日本時間でも見て、どちらかが合えば返す。
// 余分に返った分は画面側の集計で正しい月に振り分けられる（足りないよりは良い）。
function ymOf(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function inMonths(l, months) {
  // 申し込みの記録があれば、そのどれかが指定の月に入っていれば返す（広告費は記録ごとに数えるため）
  const ts = Array.isArray(l.inquiries) && l.inquiries.length
    ? l.inquiries.map(q => receivedAtMs({ receivedAt: q.receivedAt, savedAt: q.at || l.savedAt }))
    : [receivedAtMs(l)]
  return ts.some(t => t && (months.has(ymOf(t)) || months.has(ymOf(t + 9 * 3600 * 1000))))
}
// 広告費の集計に要る項目だけ（家財などを含む全項目は1件1KB超あり、2か月で3MBを超える）
// ★updatedAt / detectedAt も必ず送る。年なしの受付日（引越し侍など）の年を決めるのに使うため
//   （src/lib/sortLeads.js の yearlessMs）。欠けると再問い合わせで受付日時が更新されたリードが
//   前年扱いになり、広告費が少なく出る。
function adLead(l) {
  return {
    key: l.key, site: l.site, count: l.count, receivedAt: l.receivedAt, requestedAt: l.requestedAt,
    savedAt: l.savedAt, updatedAt: l.updatedAt, detectedAt: l.detectedAt,
    ...(Array.isArray(l.inquiries) && l.inquiries.length ? { inquiries: l.inquiries } : null),
  }
}

// 担当者がCRM上で入力・管理する項目（＝巡回では絶対に上書きしてはならない）。
// 巡回(取得)POSTのマージ時、これらのキーは新値が来ても既存値を保持する。
// 目的：侍などの再巡回で担当者のメモ・ステータス等が黙って上書きされる事故を防ぐ。
// ※人手の操作（CSVインポート等）は body._manual = true を付けることでこの保護を外せる。
//   保護対象はあくまで「自動巡回による意図しない上書き」であり、担当者自身の更新は妨げない。
const CRM_OWNED_FIELDS = new Set([
  'memo', 'memoUpdatedAt', // 対応・メモ
  'status',                // ステータス
  'staff',                 // 担当者
  'timetree',              // タイムツリー登録チェック
  'amount', 'contracted',  // 金額・成約フラグ
])

// 巡回で「空欄を埋めるのは可、すでに値があれば上書きしない」項目。
// 住所・要望・家財は、担当者が詳細画面で修正することがあるため巡回で書き換えない。
// ただし完全に禁止すると不都合がある：ズバットは速度優先で
//   ①基本情報（電話・氏名・区間）を先に送る → ②あとから住所・家財・要望を送る
// という2段階のため、一切更新しないと住所・家財が永久に入らなくなる。
// そこで「空のときだけ埋める」とし、取り込みは効かせつつ手入力は守る。
const FILL_ONLY_FIELDS = new Set([
  // 住所（引越し元・先）
  'from', 'to',
  'fromZip', 'fromAddress', 'fromType', 'fromFloor', 'fromElevator', 'fromLayout',
  'toZip', 'toAddress', 'toType', 'toFloor', 'toElevator', 'toLayout',
  // 要望
  'request', 'option',
  // 家財
  'kazai', 'kazaiCount', 'kazaiUnknown', 'boxCount',
  // 受付日時・検知時刻（最初に取り込んだ時の値を保つ）
  // ★取得元の一覧で同じ依頼の日付が新しくなると、巡回が「今日の依頼」として送り直してくる。
  //   受付日時を上書きすると、対応済みの古いリードが新着として一覧の先頭に移ってしまう。
  'receivedAt', 'requestedAt', 'detectedAt', 'timing',
])

// 受付日時の修復で直してよい項目（これ以外は受け付けない）
const REPAIR_FIELDS = ['receivedAt', 'requestedAt', 'detectedAt']
const REPAIR_MAX = 300
function checkRepair(list) {
  if (!Array.isArray(list) || !list.length || list.length > REPAIR_MAX) return { error: `repairReceived は1〜${REPAIR_MAX}件の配列で指定してください` }
  const seen = new Set()
  for (const p of list) {
    if (!p || typeof p.key !== 'string' || !p.key) return { error: 'key が不正です' }
    if (seen.has(p.key)) return { error: `key が重複しています: ${p.key}` }
    seen.add(p.key)
    for (const side of ['from', 'to']) {
      const o = p[side]
      if (!o || typeof o !== 'object' || Array.isArray(o)) return { error: `${side} が不正です` }
      const ks = Object.keys(o)
      if (!ks.length || ks.some(k => !REPAIR_FIELDS.includes(k))) return { error: `${side} に直せない項目があります（${REPAIR_FIELDS.join('・')} だけ）` }
      if (ks.some(k => typeof o[k] !== 'string' || o[k].length > 40)) return { error: `${side} の値が不正です` }
    }
    if (!p.to.receivedAt) return { error: 'to.receivedAt は必須です' }
    if (!Object.keys(p.to).every(k => k in p.from)) return { error: 'to で直す項目は from にも今の値を書いてください' }
  }
  return { list }
}
function summarizeRepair(results) {
  const count = { fixed: 0, changed: 0, notfound: 0 }
  results.forEach(x => { count[x.result]++ })
  return { count, skipped: results.filter(x => x.result !== 'fixed') }
}

// ===== 申し込みの記録（広告費を正しく数えるため）=====
// リードは電話番号でまとめるため、同じお客様が別のサイトからも申し込むと1件になる。
// 掲載費はサイトごとに申し込み1件ずつかかるので、まとめた時に申し込みを記録として残し、
// 広告費はこの記録の件数で数える（src/lib/adcost.js）。リードの表示・メモ・家財などは変えない。
//   inquiries: [{ site, orderId, receivedAt, count, at }]  at＝その申し込みを取り込んだ日時
// 同じサイト・同じ依頼番号の再表示は同じ申し込みなので記録を増やさない。
function inquiryOf(l, at) {
  return { site: l.site || '', orderId: l.orderId != null ? String(l.orderId) : '', receivedAt: l.receivedAt || l.requestedAt || '', count: l.count || '', at: at || '' }
}
const sameInquiry = (a, b) => a.site === b.site && (a.orderId === b.orderId || !a.orderId || !b.orderId)
const AD_SITES = ['引越し侍', 'ズバット', 'ズバッと', '価格.com']
// まとめる時に呼ぶ。新しい申し込みなら記録を足した配列を、そうでなければ null を返す。
function mergedInquiries(existing, body, now) {
  if (!body.site || !AD_SITES.includes(body.site)) return null
  const list = Array.isArray(existing.inquiries) && existing.inquiries.length
    ? existing.inquiries.slice()
    : [inquiryOf(existing, existing.savedAt)] // 最初の申し込み（まとめる前のリードそのもの）
  const inc = inquiryOf(body, now)
  if (list.some(x => sameInquiry(x, inc))) return null
  list.push(inc)
  return list
}

// 同じお客様からの新しい引越しの依頼とみなす間隔（前の申し込みからこれ以上空いて、別の依頼番号）
const REPEAT_GAP_MS = 30 * 24 * 3600 * 1000
// そのリードに、このサイト・依頼番号の申し込みが入っているか（まとめた申し込みの記録も見る）
function hasOrder(l, site, orderId) {
  if (!site || orderId == null || orderId === '') return false
  const o = String(orderId)
  if (l.site === site && l.orderId != null && String(l.orderId) === o) return true
  return Array.isArray(l.inquiries) && l.inquiries.some(q => q.site === site && q.orderId === o)
}
// そのリードの最後の申し込みを取り込んだ日時（記録が無ければリードを取り込んだ日時）
function lastInquiryAt(l) {
  const ts = [Date.parse(l.savedAt || '')]
  if (Array.isArray(l.inquiries)) l.inquiries.forEach(q => ts.push(Date.parse(q.at || '')))
  const ok = ts.filter(t => !isNaN(t))
  return ok.length ? Math.max(...ok) : 0
}

const isEmptyValue = (v) =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0)

// 更新・削除の対象を1件だけ特定する。優先順位：key > id > 電話。
// 電話は「一致が1件だけ」の時しか使わない。
//   - 以前は key/id/電話の“いずれか一致”で更新していたため、同じ電話番号を持つ
//     別リードまで一括で書き換わり、メモ・ステータスが他リードへ波及していた。
//   - かといって key だけで特定すると、key を持たない古いリードの更新が
//     何も起きずに消える（保存の空振り）。そのため電話は一意な時のみ許可する。
// 見つからなければ -1。
function findTargetIndex(items, body) {
  if (body.key) {
    const i = items.findIndex(x => x.key === body.key)
    if (i !== -1) return i
  }
  if (body.id) {
    const i = items.findIndex(x => x.id === body.id)
    if (i !== -1) return i
  }
  if (body.phone) {
    const hits = []
    items.forEach((x, i) => { if (x.phone === body.phone) hits.push(i) })
    if (hits.length === 1) return hits[0] // 複数一致は波及の恐れがあるので触らない
  }
  return -1
}

// 電話番号を照合用に正規化する（ハイフン・空白・全角の表記ゆれを吸収）。
// ※各サイトで電話の書式が異なる（侍はハイフン必須、価格.comはハイフン無しもあり、
//   ズバットはAPIの生値）。正規化しないと同一人物が別リードとして重複登録される。
function normPhone(v) {
  return String(v || '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)) // 全角数字→半角
    .replace(/\D/g, '')                                                     // 数字以外を除去
}
function isPhoneLike(v) {
  const d = normPhone(v)
  return d.length >= 10 && d.length <= 11 && d.startsWith('0')
}

// 重複判定（統合）キー。信頼できる識別子が無ければ null を返し、その場合は統合せず別リード扱いにする。
// 優先順位：明示key > 電話番号 > サイト+氏名+受付日時。
// ※ 以前は「サイト+氏名」だけを最終フォールバックにしていたため、
//   電話・氏名が未取得のリード（例: 一覧取得段階のリードや名前欄が空のリード）が
//   "サイト:"（空氏名）や同名で衝突し、別人のリードが統合されてしまっていた
//   （＝新着リードに他リードのメモ・ステータスが混入する不具合）。
//   氏名が空の場合はキー無し(null)とし、受付日時も含めて別リードの衝突を防ぐ。
function leadKey(lead) {
  // キー・電話が電話番号なら正規化して比較する（保存値は元の表記のまま残す）
  if (lead.key) return isPhoneLike(lead.key) ? 'tel:' + normPhone(lead.key) : String(lead.key)
  if (lead.phone) return isPhoneLike(lead.phone) ? 'tel:' + normPhone(lead.phone) : String(lead.phone)
  const name = String(lead.name || '').trim()
  if (!name) return null // 電話・キー・氏名がいずれも無い → 統合しない（一意リード扱い）
  const at = String(lead.receivedAt || lead.requestedAt || '').trim()
  return `${lead.site || ''}:${name}:${at}`
}

export default async function handler(req, res) {
  // Chrome拡張など別オリジンからの送信を許可
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      // 軽量モード：?recent=N で直近N件（savedAt降順）＋総数だけ返す（新着通知ポーリング用）
      // お知らせメッセージ（broadcast）も擬似リードとして混ぜ、子拡張(無改修)に通知させる。
      const q = req.query || {}

      // ===== 件数だけ（左メニューのバッジ用）=====
      // 以前は「要追客が何件か」を数えるためだけに全件を読んでいた。
      if (q.counts) {
        const meta = await readMeta()
        if (meta && typeof meta.follow === 'number') return res.json({ count: meta.count, follow: meta.follow })
        const { meta: m } = await rebuildMeta()
        return res.json({ count: m.count, follow: m.follow })
      }

      // ===== リード管理の「更新」ボタン用のまとめ =====
      // 全件（8MB超）を取り直さず、件数と直近50件だけ返す。
      if (q.summary) {
        const both = (await readMetaBoth()) || (await rebuildMeta())
        const { meta, full } = both
        return res.json({ count: meta.count, follow: meta.follow, sites: meta.sites, today: meta.today, items: full.items })
      }

      // ===== 追客タブ：要追客のリードを新しい順に50件ずつ =====
      //   ?follow=1                         … 最初の50件（サマリから。全件は読まない）
      //   ?follow=1&beforeSavedAt=..&beforeKey=.. … その続き（ここだけ全件を読む）
      //   ?follow=1&limit=N                 … 先頭からN件（保存失敗で画面を戻す時、読んだ件数のまま取り直す）
      // 返す rest は「まだ読んでいない要追客の件数」。
      if (q.follow) {
        const limit = Math.min(Math.max(parseInt(q.limit || '', 10) || PAGE, 1), 2000)
        const hasCursor = q.beforeSavedAt !== undefined || q.beforeKey !== undefined
        if (!hasCursor && limit <= PAGE) {
          const both = await readMetaBoth()
          if (both) {
            const items = both.full.follow.slice(0, limit)
            return res.json({ items, total: both.meta.follow, rest: Math.max(0, both.meta.follow - items.length) })
          }
        }
        const all = await readItems(KEY)
        let follows = all.filter(l => l.status === '要追客').sort(newerFirst)
        if (hasCursor) {
          const cur = { savedAt: String(q.beforeSavedAt || ''), key: String(q.beforeKey || '') }
          follows = follows.filter(l => newerFirst(cur, l) < 0) // cur より古いものだけ
        }
        const items = follows.slice(0, limit)
        return res.json({ items, total: all.filter(l => l.status === '要追客').length, rest: follows.length - items.length })
      }

      // ===== 広告費タブ：指定した月のリードだけ（集計に要る項目のみ）=====
      //   ?months=2026-09,2026-10
      if (q.months) {
        const list = String(q.months).split(',').map(x => x.trim()).filter(x => /^\d{4}-\d{2}$/.test(x)).slice(0, 3)
        if (!list.length) return res.status(400).json({ error: 'months は YYYY-MM をカンマ区切りで指定してください' })
        const months = new Set(list)
        const all = await readItems(KEY)
        return res.json({ months: list, items: all.filter(l => inMonths(l, months)).map(adLead) })
      }

      const recent = parseInt(q.recent || '', 10)
      // ★帯域対策：直近N件で足りるうちは軽量サマリだけ読む（リード全件を転送しない）。
      //   サマリが無い・壊れている・N が保持件数を超える場合だけ全件から作り直す。
      if (recent > 0 && recent <= META_MAX) {
        const meta = await readMeta()
        if (meta) {
          let bc = []
          try { bc = (await readItems(BROADCAST_KEY)).map(b => ({
            key: 'bc_' + b.id, site: b.title || 'お知らせ', name: '📢 ' + (b.body || ''),
            savedAt: b.savedAt, broadcast: true,
          })) } catch (e) { /* broadcast取得失敗は無視 */ }
          // 新着通知のポーリング（12秒ごと）には通知に要る項目だけ返す。
          // このキーは元から通知用の項目だけ。古い形式で全項目が入っていても削って返す。
          const merged = [...meta.items.slice(0, recent).map(slimLead), ...bc]
            .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
          return res.json({ count: meta.count, items: merged })
        }
      }
      const items = await readItems(KEY)
      if (recent > 0) {
        // サマリが無かった（初回・破損時）のでここで作り直しておく。
        // 版は付けない＝「更新」ボタン等が読む時は古いとみなされ、版付きで作り直される（安全側）
        writeMeta(items)
        let bcItems = []
        try {
          const bc = await readItems(BROADCAST_KEY)
          // 子拡張の表示形式に合わせる：title→site（見出し）、body→name（本文）。
          bcItems = bc.map(b => ({
            key: 'bc_' + b.id,
            site: b.title || 'お知らせ',
            name: '📢 ' + (b.body || ''),
            savedAt: b.savedAt,
            broadcast: true,
          }))
        } catch (e) { /* broadcast取得失敗は無視 */ }
        // 実リードの直近N件は必ず確保（broadcastに枠を奪われて新着通知が消えるのを防ぐ）。
        // broadcastは“追加で”載せ、合算後に再sliceしない（実リードを絶対に押し出さない）。
        const recentLeads = [...items]
          .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
          .slice(0, recent)
          .map(slimLead)
        const merged = [...recentLeads, ...bcItems]
          .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
        return res.json({ count: items.length, items: merged })
      }
      return res.json({ items })
    }

    if (req.method === 'POST') {
      // _manual は「人手による取り込み（CSVインポート等）」の目印。保存データには残さない。
      const { _manual, ...body } = req.body || {}
      const manual = _manual === true
      if (!body.phone && !body.name && !body.key) {
        return res.status(400).json({ error: 'lead data required' })
      }
      const key = leadKey(body)

      // 楽観ロック付きで「読む→統合/追加→書き戻す」を原子的に実行。
      // 同時POSTでの取りこぼし（lost update）を防ぐ。副作用（架電・プッシュ）は
      // 書き込み確定後に一度だけ実行するため、mutator の外へ出す。
      const { result, version } = await mutateWithVersion(KEY, VER_KEY, (items) => {
        // 既に取り込み済み：空でない新フィールドだけマージ（詳細ページ取得で情報を充実させる）
        // key が null（信頼できる識別子なし）の場合は統合対象を探さない＝必ず新規リードとして追加する。
        let idx = -1, repeatKey = null
        if (!manual) {
          // 同じお客様（同じキー。30日以上空いて作った新しいリードも含む）のリードを集める。
          //   ※電話番号だけの一致では探さない（同居の家族など、同じ電話でも別のリードがあるため）
          //   ※依頼番号だけでも探さない（別のお客様と依頼番号が重なった時に、他人のリードへ混ざるため）
          const cands = []
          if (key) items.forEach((i, n) => { if (leadKey(i) === key || i.repeatOf === key) cands.push(n) })
          // ① その中に同じサイト・同じ依頼番号の申し込みがあれば、それにまとめる（再表示・送り直し）
          idx = cands.find(n => hasOrder(items[n], body.site, body.orderId)) ?? -1
          // ② 無ければ、いちばん新しいリードにまとめる
          if (idx === -1 && cands.length) {
            let bestT = -Infinity
            for (const n of cands) { const tt = lastInquiryAt(items[n]); if (tt > bestT) { bestT = tt; idx = n } }
            // ★前の申し込みから30日以上たって別の依頼番号で来たら、新しい引越しの依頼として
            //   新しいリードにする。まとめると、古いリード（成約済み・メモあり）の中に埋もれて
            //   新着通知も出ず、住所・家財も前回のまま残ってしまう。古いリードには一切触らない。
            if (body.orderId && AD_SITES.includes(body.site) && Date.now() - bestT >= REPEAT_GAP_MS) {
              idx = -1
              repeatKey = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` // 電話番号のキーと重ねない
            }
          }
        } else {
          idx = key ? items.findIndex(i => leadKey(i) === key) : -1
        }
        // 電話の取得可否でキーが変わっても同一リードとみなす。
        // 例：1回目は電話が取れず key='引越し侍:123'、2回目に電話が取れて key=電話 になると
        //     別リードとして重複登録されてしまうため、サイト＋受付番号でも照合する。
        if (idx === -1 && !repeatKey && body.site && body.orderId) {
          idx = items.findIndex(i => i.site === body.site && i.orderId != null && i.orderId !== '' &&
                                     String(i.orderId) === String(body.orderId))
        }
        if (idx !== -1) {
          const next = { ...items[idx] }
          let changed = false
          for (const [k, v] of Object.entries(body)) {
            if (k === 'key' || k === 'id' || k === 'savedAt') continue
            if (k === 'inquiries' || k === 'repeatOf') continue // サーバーだけが付ける項目（送られてきた値では変えない）
            // 担当者所有の項目は「自動巡回」では上書きしない（メモ・ステータス等の保護）。
            // 人手の取り込み（_manual）は担当者の意思なので従来どおり更新を許可する。
            if (!manual && CRM_OWNED_FIELDS.has(k)) continue
            // 住所・要望・家財は、すでに値が入っていれば巡回では上書きしない（空欄なら埋める）。
            if (!manual && FILL_ONLY_FIELDS.has(k) && !isEmptyValue(next[k])) continue
            const empty = isEmptyValue(v)
            if (!empty && JSON.stringify(next[k]) !== JSON.stringify(v)) { next[k] = v; changed = true }
          }
          // 別のサイト（または別の依頼番号）からの申し込みなら、広告費のために記録を残す。
          // 人手の取り込み（CSV等）は申し込みではないので記録しない。
          if (!manual) {
            const inq = mergedInquiries(items[idx], body, new Date().toISOString())
            if (inq) { next.inquiries = inq; changed = true }
          }
          // 電話が後から判明したらキーを電話に昇格させる。
          // これで以後は他サイトから同じ電話で届いても同一リードとして統合できる。
          if (isPhoneLike(body.phone) && !isPhoneLike(next.key)) { next.key = String(body.phone); changed = true }
          if (!changed) {
            return { skipWrite: true, result: { ok: true, duplicate: true, merged: false } }
          }
          next.updatedAt = new Date().toISOString()
          const copy = items.slice()
          copy[idx] = next
          return { items: copy, result: { ok: true, duplicate: true, merged: true, items: copy } }
        }

        // key が null のときは一意キーを発行し、以後この行が他リードへ統合されないようにする。
        const newItem = {
          ...body,
          key: repeatKey || key || `u:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          // 30日以上空いた新しい依頼のリードには、元のお客様のキーを残す（次の申し込みをこちらにまとめるため）
          ...(repeatKey ? { repeatOf: key } : null),
          id: body.id || Date.now().toString(),
          savedAt: new Date().toISOString(),
        }
        const nextItems = [newItem, ...items]
        return { items: nextItems, result: { ok: true, duplicate: false, newItem, items: nextItems } }
      })

      // サマリ（新着チェック用の軽量キー）を更新。本体の書き込みが終わってから行う。
      if (result && result.items) await writeMeta(result.items, version)
      // 書き込み確定後にのみ副作用を実行（再試行で重複発火しない）。
      if (result && result.duplicate === false && result.newItem) {
        const newItem = result.newItem
        // コピーは担当者が画面上で複製したもので、新しく届いたリードではない。
        // 新着プッシュ通知と自動架電は行わない（お客様への二重架電を防ぐ）。
        if (newItem.isCopy) return res.json({ ok: true, duplicate: false, copied: true })
        await maybeAutoCall(newItem)
        // 新着プッシュ通知（拡張なしのブラウザにも即時通知。失敗しても保存は止めない）
        try {
          const route = [newItem.from, newItem.to].filter(Boolean).join(' → ')
          await sendPushToAll({
            title: `🆕 新規リード（${newItem.site || ''}）`,
            body: `${(newItem.name || '名前なし')}　${newItem.phone || ''}`.trim() + (route ? `\n${route}` : ''),
            tag: newItem.key,
            url: '/',
          })
        } catch (e) { console.error('push failed:', e.message) }
        return res.json({ ok: true, duplicate: false })
      }
      return res.json({ ok: true, duplicate: true, merged: !!(result && result.merged) })
    }

    if (req.method === 'PUT') {
      const body = req.body || {}
      // ===== 受付日時の修復（一度きりの後始末用）=====
      // 巡回の送り直しで受付日時が上書きされ、古いリードが新着として先頭に移っていた分を元に戻す。
      // 1件ずつ保存すると全件（約8.4MB）の読み書きが件数分起きるため、1回の書き込みでまとめて直す。
      //   body: { repairReceived: [{ key, from: {receivedAt,...}, to: {receivedAt,...} }], dryRun }
      //   ・直せるのは受付日時・依頼日時・検知時刻だけ（ステータス・メモ等は受け付けない）
      //   ・今の値が from と一致するリードだけ直す（確認後に誰かが触ったリードには手を出さない）
      //   ・dryRun: true なら書き込まず、直す予定の結果だけ返す
      if (body.repairReceived !== undefined) {
        const r = checkRepair(body.repairReceived)
        if (r.error) return res.status(400).json({ error: r.error })
        const plan = r.list
        const apply = (items) => {
          const byKey = new Map(items.map((l, i) => [l.key, i]))
          const copy = items.slice()
          const results = plan.map(p => {
            const i = byKey.get(p.key)
            if (i === undefined) return { key: p.key, result: 'notfound' }
            const cur = copy[i]
            const same = REPAIR_FIELDS.every(f => !(f in p.from) || String(cur[f] ?? '') === String(p.from[f] ?? ''))
            if (!same) return { key: p.key, result: 'changed' } // 確認後に値が変わっている → 触らない
            copy[i] = { ...cur, ...p.to }
            return { key: p.key, result: 'fixed' }
          })
          return { copy, results }
        }
        if (body.dryRun === true) {
          const { results } = apply(await readItems(KEY))
          return res.json({ dryRun: true, ...summarizeRepair(results) })
        }
        const { result: out, version } = await mutateWithVersion(KEY, VER_KEY, (items) => {
          const { copy, results } = apply(items)
          if (!results.some(x => x.result === 'fixed')) return { skipWrite: true, result: { results } }
          return { items: copy, result: { results, items: copy } }
        })
        if (out.items) await writeMeta(out.items, version)
        return res.json({ dryRun: false, ...summarizeRepair(out.results) })
      }
      if (!body.key && !body.phone && !body.id) {
        return res.status(400).json({ error: 'key / phone / id required' })
      }
      // 対象は findTargetIndex で「1件だけ」特定する（他リードへの波及を防ぐ）。
      const { result: updated, version } = await mutateWithVersion(KEY, VER_KEY, (items) => {
        const idx = findTargetIndex(items, body)
        if (idx === -1) return { skipWrite: true, result: false }
        const copy = items.slice()
        copy[idx] = { ...copy[idx], ...body, updatedAt: new Date().toISOString() }
        return { items: copy, result: { ok: true, items: copy } }
      })
      // 対象が見つからない更新は成功扱いにしない（画面側の保存が黙って消えるのを防ぐ）
      if (!updated) return res.status(404).json({ error: 'lead not found', ok: false })
      // 直近リードの氏名やコピー印が変わることがあるのでサマリも更新する
      if (updated && updated.items) await writeMeta(updated.items, version)
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      if (body.all !== true && !body.key && !body.id && !body.phone) {
        return res.status(400).json({ error: 'phone / key / id or all:true required' })
      }
      const { result: out, version } = await mutateWithVersion(KEY, VER_KEY, (items) => {
        let filtered
        if (body.all === true) {
          filtered = []
        } else {
          // 削除も対象を1件だけ特定する（同一電話の別リードまで巻き込まないため）。
          const idx = findTargetIndex(items, body)
          if (idx === -1) return { skipWrite: true, result: { removed: 0 } }
          filtered = items.filter((_, i) => i !== idx)
        }
        return { items: filtered, result: { removed: items.length - filtered.length, items: filtered } }
      })
      // 削除で件数が変わるのでサマリも更新する
      if (out && out.items) await writeMeta(out.items, version)
      return res.json({ ok: true, removed: out.removed })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
