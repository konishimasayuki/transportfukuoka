// リードのステータスの移り変わり（api/inbound.js と api/lock.js で共有する）
import { updateOne } from './_kvstore.js'
import { metaSidsFromEntries, writeMetaFromEntries } from './_leadmeta.js'

const KEY     = 'transportfukuoka:leads'
const VER_KEY = 'transportfukuoka:leads:ver'

// 新規リードを担当者が開いた時のステータス
export const CALLING = '架電対応中'
// 架電対応中のまま「対応中」の印が切れた時（ブラウザを閉じた・PCが落ちた等）に付けるステータス
export const AFTER_CALLING = '架電済'

// ステータスの移り変わりの記録（一覧のステータス欄に「14:05から対応中 → 14:12 架電済」と出す）。
// ステータスが変わった時だけ、サーバーの時刻で足す（画面から送られた statusLog では変えない）。
//   statusLog: [{ status, at }]  at＝ISO（年月日・時刻）
const STATUS_LOG_MAX = 50
export function withStatusLog(prev, next) {
  const log = Array.isArray(prev.statusLog) ? prev.statusLog : []
  const out = { ...next, statusLog: log }
  const was = prev.status || '未架電', now = next.status || '未架電'
  if (now !== was) out.statusLog = [...log, { status: now, at: new Date().toISOString() }].slice(-STATUS_LOG_MAX)
  return out
}

// 「対応中」の印が切れたリード（印のキー＝リードの key か id）が架電対応中のままなら、架電済にする。
// 架電対応中から未架電に戻すことはない。リードが見つからない・架電対応中でない時は何もしない。
export async function markCalledIfAbandoned(lockKey) {
  try {
    const one = await updateOne(KEY, VER_KEY, {
      pick: (entries) => entries.findIndex(e => e.key === lockKey || e.id === lockKey),
      update: (item) => (item.status === CALLING
        ? { item: withStatusLog(item, { ...item, status: AFTER_CALLING, updatedAt: new Date().toISOString() }), result: true }
        : { skipWrite: true, result: false }),
      extraSids: metaSidsFromEntries,
    })
    if (one && one.result === true && !one.fallback) await writeMetaFromEntries(one.entries, one.fetched, one.version)
    return !!(one && one.result === true)
  } catch (e) {
    console.error('markCalledIfAbandoned failed:', e.message)
    return false
  }
}
