// デバッグ依頼掲示板（東部＝tobunamakon の「デバッグ依頼」仕様を移植）。
//   ・スレッド（親投稿 = title + body + images[] + author）＋ replies[]
//   ・誰でも投稿・返信できる（本サイトはサーバ側認証が無いため author はクライアントから受け取る）
//   ・画像は縮小済み data URL を複数添付可（クライアントで縮小してから送信）
//   ・自動更新なし（画面側で手動取得）
// 保存: Upstash(Redis REST)。スレッドごとにキーを分け、index(sorted set)で新しい順に並べる。
// 既存の api/debug.js（架電テスト）とは Redis キー空間もエンドポイントも完全に別。
import { notifyKonichat, baseUrlFrom } from './_konichat.js'

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const INDEX_KEY  = 'transportfukuoka:debugreq:index'          // sorted set: score=updatedAt(ms)
const THREAD_KEY = (id) => `transportfukuoka:debugreq:thread:${id}`
const MAX_IMG    = 3 * 1024 * 1024   // 1枚あたり 3MB
const MAX_IMAGES = 8                  // 1投稿あたりの枚数上限
const MAX_TOTAL  = 3 * 1024 * 1024   // 1投稿の画像合計(デコード後)上限。Vercelのボディ上限(約4.5MB)対策

async function redis(command) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Redis env vars (UPSTASH_REDIS_REST_URL / _TOKEN) missing')
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const data = await res.json()
  if (data.error) throw new Error('Redis error: ' + data.error)
  return data.result
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function parse(raw) { if (!raw) return null; try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return null } }
function sizeOfDataUrl(s) { if (!s) return 0; const i = s.indexOf(','); const b64 = i >= 0 ? s.slice(i + 1) : s; return Math.floor(b64.length * 3 / 4) }

// 新形式 images[] を優先。旧形式 image(単一)しか無ければ配列化。string以外/空は除去し枚数上限で切る。
function normalizeImages(images, legacy) {
  let arr = []
  if (Array.isArray(images)) arr = images.filter((x) => typeof x === 'string' && x)
  else if (typeof legacy === 'string' && legacy) arr = [legacy]
  return arr.slice(0, MAX_IMAGES)
}
function validateImages(arr) {
  let total = 0
  for (const s of arr) {
    const sz = sizeOfDataUrl(s)
    if (sz > MAX_IMG) return `画像が大きすぎます（1枚あたり最大 ${MAX_IMG / 1024 / 1024}MB）`
    total += sz
  }
  if (total > MAX_TOTAL) return `画像の合計が大きすぎます（合計 ${Math.round(MAX_TOTAL / 1024 / 1024)}MB まで）。枚数を減らしてください`
  return null
}
function normAuthor(a) {
  return (a && a.id) ? { id: String(a.id).slice(0, 40), name: String(a.name || '').slice(0, 60) } : { id: 'anon', name: '匿名' }
}

export default async function handler(req, res) {
  try {
    const idParam = req.query.id
    const id = Array.isArray(idParam) ? idParam[0] : idParam

    // 一覧（新しい順）
    if (req.method === 'GET' && !id) {
      const ids = (await redis(['ZRANGE', INDEX_KEY, 0, -1, 'REV'])) || []
      const threads = []
      for (const tid of ids) { const t = parse(await redis(['GET', THREAD_KEY(tid)])); if (t && t.id) threads.push(t) }
      return res.json({ threads })
    }

    // 単一スレッド取得
    if (req.method === 'GET' && id) {
      const t = parse(await redis(['GET', THREAD_KEY(id)]))
      if (!t) return res.status(404).json({ error: 'スレッドが見つかりません' })
      return res.json({ thread: t })
    }

    // 新規スレッド作成
    if (req.method === 'POST' && !id) {
      const { title, body, image, images, author } = req.body || {}
      const imgs = normalizeImages(images, image)
      if (!String(title || '').trim() && !String(body || '').trim() && !imgs.length) {
        return res.status(400).json({ error: 'タイトル・本文・画像のいずれかは必須です' })
      }
      const verr = validateImages(imgs)
      if (verr) return res.status(400).json({ error: verr })
      const now = new Date().toISOString()
      const thread = {
        id: uid(),
        title: String(title || '').slice(0, 200),
        body: String(body || '').slice(0, 5000),
        image: '',
        images: imgs,
        author: normAuthor(author),
        createdAt: now,
        updatedAt: now,
        replies: [],
      }
      await redis(['SET', THREAD_KEY(thread.id), JSON.stringify(thread)])
      await redis(['ZADD', INDEX_KEY, Date.now(), thread.id])
      // スーパーコニチャットの「デバック依頼」チャンネルへ転送（画像は送らない・失敗しても投稿は成功扱い）
      await notifyKonichat({
        kind: 'thread',
        title: thread.title,
        body: thread.body,
        authorName: thread.author?.name || '匿名',
        url: `${baseUrlFrom(req)}/?tab=debugreq&thread=${encodeURIComponent(thread.id)}`,
      })
      return res.status(201).json({ thread })
    }

    // 返信追加
    if (req.method === 'POST' && id) {
      const { body, image, images, author } = req.body || {}
      const imgs = normalizeImages(images, image)
      if (!String(body || '').trim() && !imgs.length) {
        return res.status(400).json({ error: '本文または画像が必要です' })
      }
      const verr = validateImages(imgs)
      if (verr) return res.status(400).json({ error: verr })
      const t = parse(await redis(['GET', THREAD_KEY(id)]))
      if (!t) return res.status(404).json({ error: 'スレッドが見つかりません' })
      const now = new Date().toISOString()
      const reply = {
        id: uid(),
        body: String(body || '').slice(0, 5000),
        image: '',
        images: imgs,
        author: normAuthor(author),
        createdAt: now,
      }
      t.replies = Array.isArray(t.replies) ? t.replies : []
      t.replies.push(reply)
      t.updatedAt = now
      await redis(['SET', THREAD_KEY(id), JSON.stringify(t)])
      await redis(['ZADD', INDEX_KEY, Date.now(), id])
      // 返信もスーパーコニチャットへ転送
      await notifyKonichat({
        kind: 'reply',
        threadTitle: t.title,
        body: reply.body,
        authorName: reply.author?.name || '匿名',
        url: `${baseUrlFrom(req)}/?tab=debugreq&thread=${encodeURIComponent(id)}`,
      })
      return res.status(201).json({ thread: t })
    }

    // スレッド削除
    if (req.method === 'DELETE' && id) {
      await redis(['DEL', THREAD_KEY(id)])
      await redis(['ZREM', INDEX_KEY, id])
      return res.json({ ok: true })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
