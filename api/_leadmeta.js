// リードの軽量サマリ（api/inbound.js と、リードを書き換える他のAPI（api/mail.js）で共有する）
// リードを書き換えたら必ず writeMeta(書き換え後の全件) を呼ぶこと。
// 呼ばないと「更新」ボタン・追客タブの1ページ目に古い内容が出る。
import { redisCmd } from './_kvstore.js'

const VER_KEY = 'transportfukuoka:leads:ver' // リード本体の版（書き込みのたびに+1）

// 新着チェック専用の軽量サマリ。
// ねらい：?recent=N（12秒ごとのポーリング）でリードを毎回全件読み出すと、
// 1回あたり数MBが Upstash→Vercel に流れ、帯域課金が跳ね上がる。
// 直近数件の「通知に必要な項目だけ」を別キー（数KB）に持ち、そこだけ読む。
const META_KEY = 'transportfukuoka:leads:meta'
// ?recent=N（新着通知）は N がこれ以下ならサマリから返す。
export const META_MAX = 10
// 画面に出すための「全項目のまま」の直近分は別キーに分ける。
// 通知のポーリングのたびにこちら（数十KB）まで読まないようにするため。
const META_FULL_KEY = 'transportfukuoka:leads:meta:full'
// 1回に返す件数。リード管理の1ページ（50件）と同じ。
//   ・リード管理の「更新」ボタン：直近50件だけ受け取り、1ページ目を最新にする
//   ・追客タブ：要追客の直近50件。続きは「さらに50件」で読む
export const PAGE = 50

// 通知に必要な項目だけを抜き出す（本体をそのまま入れると軽量化にならない）
export function slimLead(l) {
  return {
    key: l.key, id: l.id, site: l.site, name: l.name, phone: l.phone,
    from: l.from, to: l.to, savedAt: l.savedAt,
    ...(l.isCopy ? { isCopy: true } : null),
  }
}
// 新しい順。保存日時が同じ時はキーで決める（「続き」を読む時に取りこぼし・重複が出ないように）
export function newerFirst(a, b) {
  return String(b.savedAt || '').localeCompare(String(a.savedAt || '')) || String(b.key || '').localeCompare(String(a.key || ''))
}
// 「本日」の判定は画面（追客タブ）と同じ規則にそろえる。
// 受付日時(MM/DD)が今日と一致。無ければ保存日時で判定する。
function mdOf(d) { return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` }
function isTodayLead(l, todayMD) {
  if (l.receivedAt && /^\d{2}\/\d{2}/.test(l.receivedAt)) return String(l.receivedAt).slice(0, 5) === todayMD
  if (l.savedAt) { const d = new Date(l.savedAt); if (!isNaN(d.getTime())) return mdOf(d) === todayMD }
  return false
}

// 全リードから軽量サマリを作る。
// ★ここに「画面が知りたい数字」をすべて入れておく。
//   こうしないと、件数をひとつ出すためだけに全件（8MB超）を読むことになる。
//   作るのは書き込みの中だけ。その時点で配列は既に手元にあるので追加の読み込みは発生しない。
export function buildMeta(items) {
  const todayMD = mdOf(new Date())
  const sites = {}, todaySites = {}
  let todayTotal = 0
  for (const l of items) {
    const st = l.site || 'その他'
    sites[st] = (sites[st] || 0) + 1
    if (isTodayLead(l, todayMD)) { todayTotal++; todaySites[st] = (todaySites[st] || 0) + 1 }
  }
  const sorted = [...items].sort(newerFirst)
  const follows = sorted.filter(l => l.status === '要追客')
  return {
    // 軽いほう（通知のポーリング・件数バッジが読む）
    meta: {
      count: items.length, follow: follows.length, sites,
      today: { md: todayMD, total: todayTotal, sites: todaySites },
      items: sorted.slice(0, META_MAX).map(slimLead), at: new Date().toISOString(),
    },
    // 全項目のほう（そのまま一覧に出し、詳細モーダルも開ける）
    full: { items: sorted.slice(0, PAGE), follow: follows.slice(0, PAGE) },
  }
}
// サマリを保存（失敗しても本体には影響させない。次の機会に作り直される）
// ver：この items を書き込んだ（読んだ）時のリード本体の版。
//   ほぼ同時に2件書き込まれるとサマリの保存順が入れ替わり、古いサマリが残ることがある。
//   古いサマリのメモを開いて保存すると他の人の新しいメモを上書きしてしまうため、
//   読む側（readMetaBoth）で本体の版と比べ、違えば使わずに全件から作り直す。
export async function writeMeta(items, ver) {
  try {
    const { meta, full } = buildMeta(items)
    meta.ver = full.ver = ver == null ? null : String(ver)
    await Promise.all([
      redisCmd(['SET', META_KEY, JSON.stringify(meta)]),
      redisCmd(['SET', META_FULL_KEY, JSON.stringify(full)]),
    ])
  } catch (e) { console.error('meta write failed:', e.message) }
}
// サマリを読む（無い・壊れている場合は null を返して呼び出し側で全件フォールバック）
export async function readMeta() {
  try {
    const raw = await redisCmd(['GET', META_KEY])
    if (!raw) return null
    const m = JSON.parse(raw)
    return (m && Array.isArray(m.items) && typeof m.count === 'number') ? m : null
  } catch { return null }
}
// 軽いほうと全項目のほうを両方読む。
// どちらか欠けている・リード本体の版と合わない（＝古い）時は null（呼び出し側で全件から作り直す）
export async function readMetaBoth() {
  try {
    const [meta, raw, ver] = await Promise.all([readMeta(), redisCmd(['GET', META_FULL_KEY]), redisCmd(['GET', VER_KEY])])
    const full = raw ? JSON.parse(raw) : null
    if (!meta || !meta.sites || !meta.today || typeof meta.follow !== 'number') return null
    if (!full || !Array.isArray(full.items) || !Array.isArray(full.follow)) return null
    const cur = ver == null || ver === '' ? '0' : String(ver)
    if (meta.ver == null || meta.ver !== cur || full.ver !== cur) return null
    return { meta, full }
  } catch { return null }
}
