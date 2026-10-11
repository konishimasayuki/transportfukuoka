// リードの「対応中」印（二重架電の防止）— 画面側
//
// 全員が同じ管理者アカウントでログインするため、サーバーでは人を区別できない。
// ブラウザごとに固定のIDを1つ持ち、それだけで「自分か他人か」を見分ける。
// 名前は出せない（出すには各PCに名前を登録してもらう必要がある）。
import { useEffect, useState } from 'react'

const ID_KEY = 'tf_client_id'
const LIST_POLL_MS = 10 * 1000 // 一覧のグレーアウトを更新する間隔
const RENEW_MS     = 20 * 1000 // 開いている間、確保を延長する間隔（サーバーのTTLは60秒）
// 「対応中」の印を使うのは新着から10分だけ。
// 二重架電が起きるのは新着通知が鳴った直後で、全員が同じリードに飛びつく時。
// 古いリードまで対象にすると、確認のために開いただけで灰色になり、
// 画面が灰色だらけになって印の意味が薄れる（開きっぱなしで塞がる問題も出る）。
export const LOCK_WINDOW_MS = 10 * 60 * 1000

// サーバー時刻との差。PCの時計がずれていると新着判定が丸ごと狂うため、
// 一覧の取得のたびにサーバーの時刻と突き合わせて補正する。
let skewMs = 0
export const serverNow = () => Date.now() + skewMs

// 新着から10分以内か（savedAt＝CRMが受け取った時刻で判定）
export function withinLockWindow(item) {
  const ms = Date.parse((item && item.savedAt) || '')
  return !!ms && (serverNow() - ms) < LOCK_WINDOW_MS
}

// まだ誰も架電していないか。
// ★「架電済」だけで外すのでは足りない。留守・見積り・要追客・成約・見送り…
//   どれであっても、誰かが一度は手を付けた印なので対象から外す。
//   つまり「未架電のまま」の時だけ対象にする。
export const isUncalled = (item) => ((item && item.status) || '未架電') === '未架電'

// 「対応中」の印を付ける対象か。
// ・未架電のあいだ … 誰も架電していないので、飛びつきが起こりうる
// ・新着から10分  … 架電直後にステータスを付け替える操作の最中も守る
// どちらかに当てはまれば対象。古くて手の付いたリードは対象外（灰色にしない）。
export const shouldLock = (item) => isUncalled(item) || withinLockWindow(item)

// 応答待ちの上限。Vercelの関数はしばらく使われないと起動に数秒かかることがあり、
// 上限を設けないと「リードを押したのに画面が開かない」状態になる。
const ASK_TIMEOUT_MS  = 2500 // リードを開く時（人が待っている）
const LIST_TIMEOUT_MS = 5000 // 一覧の更新（待っている人はいない）

// localStorage が使えない環境（プライベートモード等）ではこのタブ限りのIDにする。
// 固定文字列にすると全員が同一人物とみなされ、誰も他人をブロックできなくなる。
let memoryId = null
export function clientId() {
  try {
    let v = localStorage.getItem(ID_KEY)
    if (!v) { v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem(ID_KEY, v) }
    return v
  } catch {
    if (!memoryId) memoryId = 'tmp' + Math.random().toString(36).slice(2, 10)
    return memoryId
  }
}

// リードを一意に指す値。保存時の照合（api/inbound）と同じ優先順にそろえる。
export const lockKeyOf = (item) => String((item && (item.key || item.id)) || '')

// 応答が遅い／返らない時に画面が固まらないよう、必ず打ち切る。
async function askServer(payload, timeoutMs) {
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = setTimeout(() => { try { if (ac) ac.abort() } catch { /* 中断できなくても下のcatchで拾う */ } }, timeoutMs)
  try {
    const r = await fetch('/api/lock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: ac ? ac.signal : undefined,
    })
    return await r.json()
  } catch {
    return null // 打ち切り・通信不可・応答が壊れている
  } finally { clearTimeout(timer) }
}

async function post(action, key) {
  if (!key) return { ok: true }
  const r = await askServer({ action, key, by: clientId() }, ASK_TIMEOUT_MS)
  // 答えが得られない時は「取れた」とみなして作業を止めない。
  // その間は二重架電を防げなくなるが、リードが開かないほうが業務への害が大きい。
  return r || { ok: true, offline: true }
}
export const acquireLock = (key) => post('acquire', key)
export const renewLock   = (key) => post('renew', key)
export const releaseLock = (key) => post('release', key)

// タブごと閉じられた時の解放。通常の fetch は間に合わないことがある。
export function releaseBeacon(key) {
  if (!key) return
  try {
    const body = JSON.stringify({ action: 'release', key, by: clientId() })
    if (navigator.sendBeacon) navigator.sendBeacon('/api/lock', new Blob([body], { type: 'application/json' }))
  } catch { /* 届かなくても60秒で自動的に無効になる */ }
}

// 「◯分前から」の表示
export function agoText(at) {
  // at はサーバーが付けた時刻。PCの時計がずれていると「◯分前」が狂うので補正後の時刻で測る。
  const s = Math.max(0, Math.floor((serverNow() - Number(at || 0)) / 1000))
  if (s < 60) return `${s}秒前`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}分前` : `${Math.floor(m / 60)}時間前`
}

// ===== 一覧用：いま誰かが対応中のリードを定期的に取る =====
// 見えていない画面に印を出しても意味がないので、表示中だけ問い合わせる。
export function useLeadLocks(enabled) {
  const [locks, setLocks] = useState({})
  useEffect(() => {
    if (!enabled) { setLocks({}); return }
    let alive = true
    const load = async () => {
      // こちらも上限を設ける。応答が返らないまま次のポーリングが重なるのを防ぐ。
      const ac = typeof AbortController !== 'undefined' ? new AbortController() : null
      const timer = setTimeout(() => { try { if (ac) ac.abort() } catch { /* 下のcatchで拾う */ } }, LIST_TIMEOUT_MS)
      try {
        const d = await fetch('/api/lock', { signal: ac ? ac.signal : undefined }).then(r => r.json())
        if (d && d.at) { const sv = Date.parse(d.at); if (sv) skewMs = sv - Date.now() } // 時計のずれを補正
        if (alive && d && d.locks) setLocks(d.locks)
      } catch { /* 取れない時は前の状態のままにする（誤って印を消さない） */ }
      finally { clearTimeout(timer) }
    }
    const tick = () => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') load() }
    load()
    const timer = setInterval(tick, LIST_POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') load() } // 戻ってきたら待たずに取る
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled])

  const me = clientId()
  // 他の人が対応中か（自分が開いているものは灰色にしない）
  const lockedBy = (item) => { const l = locks[lockKeyOf(item)]; return (l && l.by !== me) ? l : null }
  return { locks, lockedBy }
}

// ===== 開いている間、確保を保ち続ける =====
// key を渡している間だけ20秒ごとに延長し、外したら解放する。
export function useHoldLock(key) {
  useEffect(() => {
    if (!key) return
    // ★開始時に1回延長しておく。
    //   開発時のStrictModeは「実行→後片付け→再実行」を行うため、後片付けの解放で
    //   確保が消えたまま20秒間戻らない。ここで必ず置き直す。
    //   何かの拍子に確保が失われていた時の自己修復にもなる。
    renewLock(key)
    const timer = setInterval(() => { renewLock(key) }, RENEW_MS)
    const onHide = () => releaseBeacon(key)
    window.addEventListener('pagehide', onHide)
    // ★この画面に戻ってきたら、20秒を待たずにその場で延長する。
    //   ブラウザIDはタブ間で共通なので、同じリードを2タブで開いて片方を閉じると
    //   「対応中」が消えてしまう（サーバーは保持者を1つしか持たない）。
    //   閉じたあと人が見るのは残ったタブなので、ここで即座に復活させる。
    const onBack = () => { if (document.visibilityState === 'visible') renewLock(key) }
    document.addEventListener('visibilitychange', onBack)
    window.addEventListener('focus', onBack)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onBack)
      window.removeEventListener('focus', onBack)
      releaseLock(key) // 画面を閉じたら「対応中」を外す
    }
  }, [key])
}
