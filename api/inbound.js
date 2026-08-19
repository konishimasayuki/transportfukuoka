import { placeCall, twilioReady } from './_twilio.js'
import { sendPushToAll } from './_push.js'
import { readItems, mutate, redisCmd } from './_kvstore.js'

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

// 新着チェック専用の軽量サマリ。
// ねらい：?recent=N（12秒ごとのポーリング）でリードを毎回全件読み出すと、
// 1回あたり数MBが Upstash→Vercel に流れ、帯域課金が跳ね上がる。
// 直近数件の「通知に必要な項目だけ」を別キー（1KB未満）に持ち、そこだけ読む。
const META_KEY = 'transportfukuoka:leads:meta'
const META_MAX = 10 // 保持する直近件数（?recent=N が これを超えたら全件から作り直す）

// 通知に必要な項目だけを抜き出す（本体をそのまま入れると軽量化にならない）
function slimLead(l) {
  return {
    key: l.key, id: l.id, site: l.site, name: l.name, phone: l.phone,
    from: l.from, to: l.to, savedAt: l.savedAt,
    ...(l.isCopy ? { isCopy: true } : null),
  }
}
// 全リードから軽量サマリを作る
function buildMeta(items) {
  const recentLeads = [...items]
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
    .slice(0, META_MAX)
    .map(slimLead)
  return { count: items.length, items: recentLeads, at: new Date().toISOString() }
}
// サマリを保存（失敗しても本体には影響させない。次の機会に作り直される）
async function writeMeta(items) {
  try { await redisCmd(['SET', META_KEY, JSON.stringify(buildMeta(items))]) }
  catch (e) { console.error('meta write failed:', e.message) }
}
// サマリを読む（無い・壊れている場合は null を返して呼び出し側で全件フォールバック）
async function readMeta() {
  try {
    const raw = await redisCmd(['GET', META_KEY])
    if (!raw) return null
    const m = JSON.parse(raw)
    return (m && Array.isArray(m.items) && typeof m.count === 'number') ? m : null
  } catch { return null }
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
])

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
      const recent = parseInt((req.query && req.query.recent) || '', 10)
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
          const merged = [...meta.items.slice(0, recent), ...bc]
            .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
          return res.json({ count: meta.count, items: merged })
        }
      }
      const items = await readItems(KEY)
      if (recent > 0) {
        // サマリが無かった（初回・破損時）のでここで作り直しておく
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
      const result = await mutate(KEY, VER_KEY, (items) => {
        // 既に取り込み済み：空でない新フィールドだけマージ（詳細ページ取得で情報を充実させる）
        // key が null（信頼できる識別子なし）の場合は統合対象を探さない＝必ず新規リードとして追加する。
        let idx = key ? items.findIndex(i => leadKey(i) === key) : -1
        // 電話の取得可否でキーが変わっても同一リードとみなす。
        // 例：1回目は電話が取れず key='引越し侍:123'、2回目に電話が取れて key=電話 になると
        //     別リードとして重複登録されてしまうため、サイト＋受付番号でも照合する。
        if (idx === -1 && body.site && body.orderId) {
          idx = items.findIndex(i => i.site === body.site && i.orderId != null && i.orderId !== '' &&
                                     String(i.orderId) === String(body.orderId))
        }
        if (idx !== -1) {
          const next = { ...items[idx] }
          let changed = false
          for (const [k, v] of Object.entries(body)) {
            if (k === 'key' || k === 'id' || k === 'savedAt') continue
            // 担当者所有の項目は「自動巡回」では上書きしない（メモ・ステータス等の保護）。
            // 人手の取り込み（_manual）は担当者の意思なので従来どおり更新を許可する。
            if (!manual && CRM_OWNED_FIELDS.has(k)) continue
            // 住所・要望・家財は、すでに値が入っていれば巡回では上書きしない（空欄なら埋める）。
            if (!manual && FILL_ONLY_FIELDS.has(k) && !isEmptyValue(next[k])) continue
            const empty = isEmptyValue(v)
            if (!empty && JSON.stringify(next[k]) !== JSON.stringify(v)) { next[k] = v; changed = true }
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
          key: key || `u:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          id: body.id || Date.now().toString(),
          savedAt: new Date().toISOString(),
        }
        const nextItems = [newItem, ...items]
        return { items: nextItems, result: { ok: true, duplicate: false, newItem, items: nextItems } }
      })

      // サマリ（新着チェック用の軽量キー）を更新。本体の書き込みが終わってから行う。
      if (result && result.items) await writeMeta(result.items)
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
      if (!body.key && !body.phone && !body.id) {
        return res.status(400).json({ error: 'key / phone / id required' })
      }
      // 対象は findTargetIndex で「1件だけ」特定する（他リードへの波及を防ぐ）。
      const updated = await mutate(KEY, VER_KEY, (items) => {
        const idx = findTargetIndex(items, body)
        if (idx === -1) return { skipWrite: true, result: false }
        const copy = items.slice()
        copy[idx] = { ...copy[idx], ...body, updatedAt: new Date().toISOString() }
        return { items: copy, result: { ok: true, items: copy } }
      })
      // 対象が見つからない更新は成功扱いにしない（画面側の保存が黙って消えるのを防ぐ）
      if (!updated) return res.status(404).json({ error: 'lead not found', ok: false })
      // 直近リードの氏名やコピー印が変わることがあるのでサマリも更新する
      if (updated && updated.items) await writeMeta(updated.items)
      return res.json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const body = req.body || {}
      if (body.all !== true && !body.key && !body.id && !body.phone) {
        return res.status(400).json({ error: 'phone / key / id or all:true required' })
      }
      const out = await mutate(KEY, VER_KEY, (items) => {
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
      if (out && out.items) await writeMeta(out.items)
      return res.json({ ok: true, removed: out.removed })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
