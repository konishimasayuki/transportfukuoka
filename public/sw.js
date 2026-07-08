// Service Worker：Web Push 受信 → OS通知を表示（CRMタブが裏でも・閉じていても表示）
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data ? event.data.text() : '' } }
  const title = d.title || '🆕 新規リード'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      tag: d.tag || undefined,
      renotify: true,
      data: { url: d.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes('transportfukuoka') || c.url.startsWith(self.location.origin)) { return c.focus() }
      }
      return clients.openWindow(url)
    })
  )
})

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// PWAインストール要件を満たす最小のfetchハンドラ（ネットワーク優先のパススルー）。
// 常に最新を表示するためキャッシュはせず、ハンドラの存在のみでインストール可能にする。
self.addEventListener('fetch', () => { /* パススルー：ブラウザ既定のfetchに委ねる */ })
