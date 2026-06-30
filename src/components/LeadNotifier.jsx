// 新着リード通知（CRMをブラウザで開いている全員向け）
// 拡張のあるPCに限らず、CRMを開いていれば数秒間隔で新着を検知し、
// OS通知（ブラウザ通知）＋アプリ内トースト＋ビープ音で知らせる。
// - /api/inbound?recent=5 を POLL_MS ごとにポーリング（軽量）
// - 初回ロード時点の最新を基準にし、それ以降に来た新着のみ通知（過去分は鳴らさない）
// - OS通知は許可時のみ（タブが背面でも表示）。トースト/音は前面表示時に常に動作。
import { useEffect, useRef, useState } from 'react'

const POLL_MS = 12000

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export default function LeadNotifier({ user, switchTab }) {
  const isDemo = user?.mode === 'demo'
  const supported = typeof Notification !== 'undefined'
  const [perm, setPerm] = useState(supported ? Notification.permission : 'unsupported')
  const [toast, setToast] = useState(null)
  const seenAtRef = useRef(null)   // これより新しい savedAt を新着とみなす
  const audioRef = useRef(null)
  const pushRef = useRef(false)    // Web Push 購読済みなら poll 側のOS通知を抑制（二重通知防止）

  // Web Push 購読：SW登録→公開鍵取得→購読→サーバ保存。サーバ未設定/非対応ならポーリング通知にフォールバック。
  const setupPush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const info = await fetch('/api/push').then(r => r.json()).catch(() => null)
      if (!info || !info.enabled || !info.publicKey) return // VAPID未設定
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(info.publicKey) })
      }
      await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub }) })
      pushRef.current = true
    } catch (e) { /* フォールバック（ポーリング通知） */ }
  }

  // 任意のクリックで音声を解錠（自動再生制限の回避）
  useEffect(() => {
    const unlock = () => {
      try {
        if (!audioRef.current) audioRef.current = new (window.AudioContext || window.webkitAudioContext)()
        if (audioRef.current.state === 'suspended') audioRef.current.resume()
      } catch {}
    }
    window.addEventListener('pointerdown', unlock)
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  const enable = async () => {
    if (!supported) return
    try {
      const p = await Notification.requestPermission()
      setPerm(p)
      if (!audioRef.current) { try { audioRef.current = new (window.AudioContext || window.webkitAudioContext)() } catch {} }
      if (p === 'granted') setupPush()
    } catch {}
  }

  // 既に許可済みなら（再訪時）自動で購読を確立
  useEffect(() => {
    if (isDemo) return
    if (supported && Notification.permission === 'granted') setupPush()
  }, [isDemo])

  const beep = () => {
    try {
      const ctx = audioRef.current
      if (!ctx) return
      if (ctx.state === 'suspended') ctx.resume()
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.type = 'sine'; o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45)
      o.start(); o.stop(ctx.currentTime + 0.47)
    } catch {}
  }

  const notify = (lead) => {
    const site = lead.site || ''
    const route = [lead.from, lead.to].filter(Boolean).join(' → ')
    const title = `🆕 新規リード（${site}）`
    const body = `${(lead.name || '名前なし')}　${lead.phone || ''}`.trim() + (route ? `\n${route}` : '')
    try {
      // Web Push 購読済みのときはサーバー側プッシュがOS通知を出すので、ここでは重複を避ける
      if (!pushRef.current && supported && Notification.permission === 'granted') {
        const n = new Notification(title, { body, tag: lead.key || lead.id })
        n.onclick = () => { try { window.focus() } catch {}; if (typeof switchTab === 'function') switchTab('leads'); n.close() }
      }
    } catch {}
    setToast({ title, body, at: Date.now() })
    beep()
  }

  // トーストの自動消去
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 8000)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (isDemo) return
    let timer = null
    const poll = async () => {
      try {
        const res = await fetch('/api/inbound?recent=5')
        const data = await res.json()
        const items = (data.items || []).filter(i => i && i.savedAt)
        if (!items.length) return
        items.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
        const newestAt = items[0].savedAt
        if (seenAtRef.current == null) { seenAtRef.current = newestAt; return } // 初回は基準化のみ（既存は鳴らさない）
        const fresh = items.filter(i => String(i.savedAt) > String(seenAtRef.current)).reverse() // 古い順に通知
        if (fresh.length) {
          fresh.forEach(notify)
          seenAtRef.current = newestAt
        }
      } catch {}
    }
    poll()
    timer = setInterval(poll, POLL_MS)
    return () => { if (timer) clearInterval(timer) }
  }, [isDemo])

  if (isDemo) return null

  return (
    <>
      {supported && perm === 'default' && (
        <button onClick={enable} title="ブラウザ通知を有効化"
          style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 3000, background: '#1E5FA8', color: '#fff', border: 'none', borderRadius: 22, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,.2)', fontFamily: 'inherit' }}>
          🔔 新着通知をON
        </button>
      )}
      {toast && (
        <div onClick={() => { setToast(null); if (typeof switchTab === 'function') switchTab('leads') }}
          style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 3001, width: 300, maxWidth: '90vw', background: '#0F2A4A', color: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 10px 30px rgba(0,0,0,.3)', cursor: 'pointer', borderLeft: '4px solid #22C55E' }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{toast.title}</div>
          <div style={{ fontSize: 12, whiteSpace: 'pre-line', lineHeight: 1.5, opacity: .95 }}>{toast.body}</div>
          <div style={{ fontSize: 10, opacity: .6, marginTop: 6 }}>タップでリード管理を開く</div>
        </div>
      )}
    </>
  )
}
