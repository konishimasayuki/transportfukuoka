// Googleマップ共有ヘルパー：APIキー取得とJS APIの遅延ロード、住所→郵便番号の逆引き。
// キーは VITE_GOOGLE_MAPS_KEY（ビルド時）または localStorage 'tf_gmaps_key'（動作確認用）。
// ※参照元(HTTPリファラー)制限のブラウザキーでも動くよう、REST ではなく Maps JS の Geocoder を使う。
export const GMAPS_KEY = ((import.meta && import.meta.env && import.meta.env.VITE_GOOGLE_MAPS_KEY) ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('tf_gmaps_key')) || '').trim()

let gmapsPromise = null
export function loadGmaps(key = GMAPS_KEY) {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.google && window.google.maps) return Promise.resolve()
  if (!key) return Promise.reject(new Error('nokey'))
  if (gmapsPromise) return gmapsPromise
  gmapsPromise = new Promise((resolve, reject) => {
    let done = false
    const finish = (fn, arg) => { if (!done) { done = true; fn(arg) } }
    window.__tfGmapsCb = () => finish(resolve)
    window.gm_authFailure = () => finish(reject, new Error('auth'))
    const s = document.createElement('script')
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&v=weekly&callback=__tfGmapsCb'
    s.async = true; s.defer = true
    s.onerror = () => finish(reject, new Error('load'))
    setTimeout(() => finish(reject, new Error('timeout')), 12000)
    document.head.appendChild(s)
  })
  gmapsPromise.catch(() => { gmapsPromise = null })
  return gmapsPromise
}

// 住所 → 郵便番号（〒XXX-XXXX の数字部分）。成功時 { zip }、失敗時 { error }。
export async function zipFromAddress(address) {
  const addr = String(address || '').trim()
  if (!GMAPS_KEY) return { error: 'nokey' }
  if (!addr) return { error: 'noaddr' }
  try {
    await loadGmaps()
    const g = window.google
    const geocoder = new g.maps.Geocoder()
    const { r, st } = await new Promise((resolve) => {
      geocoder.geocode({ address: addr, region: 'jp', language: 'ja' }, (r, st) => resolve({ r, st }))
    })
    if (st !== 'OK' || !Array.isArray(r) || !r.length) return { error: st || 'error' }
    for (const item of r) {
      const c = (item.address_components || []).find(x => x.types.includes('postal_code'))
      if (c && c.long_name) return { zip: c.long_name }
    }
    return { error: 'no_postal' }
  } catch (e) { return { error: (e && e.message) || 'error' } }
}
