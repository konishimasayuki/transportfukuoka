// リードの「対応中」印（二重架電の防止）— 画面側
//
// 全員が同じ管理者アカウントでログインするため、サーバーでは人を区別できない。
// ブラウザごとに固定のIDを1つ持ち、それだけで「自分か他人か」を見分ける。
// 名前は出せない（出すには各PCに名前を登録してもらう必要がある）。
import { useEffect, useRef, useState } from 'react'

const ID_KEY = 'tf_client_id'
const LIST_POLL_MS = 10 * 1000 // 一覧のグレーアウトを更新する間隔
const RENEW_MS     = 20 * 1000 // 開いている間、確保を延長する間隔（サーバーのTTLは60秒）

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

async function post(action, key) {
  if (!key) return { ok: true }
  try {
    const r = await fetch('/api/lock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, key, by: clientId() }),
    })
    return await r.json()
  } catch {
    // 通信できない時は「取れた」とみなして作業を止めない。
    // 二重架電は防げなくなるが、開けなくなるほうが業務への害が大きい。
    return { ok: true, offline: true }
  }
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
  const s = Math.max(0, Math.floor((Date.now() - Number(at || 0)) / 1000))
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
      try {
        const d = await fetch('/api/lock').then(r => r.json())
        if (alive && d && d.locks) setLocks(d.locks)
      } catch { /* 取れない時は前の状態のままにする（誤って印を消さない） */ }
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
  return { locks, lockedBy, reload: () => setLocks(l => ({ ...l })) }
}

// ===== 開いている間、確保を保ち続ける =====
// key を渡している間だけ20秒ごとに延長し、外したら解放する。
export function useHoldLock(key) {
  const held = useRef(null)
  useEffect(() => {
    held.current = key || null
    if (!key) return
    const timer = setInterval(() => { renewLock(key) }, RENEW_MS)
    const onHide = () => releaseBeacon(key)
    window.addEventListener('pagehide', onHide)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', onHide)
      releaseLock(key) // 画面を閉じたら「対応中」を外す
      held.current = null
    }
  }, [key])
}
