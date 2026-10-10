// リードの「対応中」印（二重架電の防止）
//
// 背景：全員が同じ管理者アカウントでログインしているため、サーバー側では
// 「誰が」を区別できない。そこでブラウザごとに持つIDだけで自分／他人を見分ける。
//
// いちばん危ないのは新着通知の直後で、複数人がほぼ同時に同じリードを開く瞬間。
// 一覧のグレーアウトはポーリングで伝わるので数秒の空白ができ、そこを防げない。
// そこで「開く時にサーバーへ確保しに行き、取れた人だけが対応中になる」形にする。
//
// 取りこぼし対策：ブラウザが落ちる・タブごと閉じる等で解放されないことがある。
// TTL_MS のあいだ更新が無い確保は無効とみなし、次に開いた人が取れるようにする。
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:leadlocks' // hash: リードのkey → "取得時刻|ブラウザID"
const TTL_MS = 60 * 1000                 // 60秒更新が無ければ無効（画面は20秒ごとに更新を送る）

async function redis(command) {
  if (!REDIS_URL || !REDIS_TOKEN) throw new Error('Redis env vars missing')
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const data = await res.json()
  if (data.error) throw new Error('Redis error: ' + data.error)
  return data.result
}

// 値は "1730000000000|abc123" の形。JSONにしないのは、壊れた値でも
// 取り出しに失敗せず「無効な確保」として扱えるようにするため。
const pack = (at, by) => `${at}|${by}`
function unpack(raw) {
  const s = String(raw || '')
  const i = s.indexOf('|')
  if (i < 0) return null
  const at = Number(s.slice(0, i))
  const by = s.slice(i + 1)
  return (at > 0 && by) ? { at, by } : null
}
const fresh = (lock, now) => !!lock && (now - lock.at) < TTL_MS

// 1回の要求で触れるリードは1件だけ。長すぎるキーは弾く（hashが荒れるのを防ぐ）
const okKey = (k) => typeof k === 'string' && k.length > 0 && k.length <= 200
const okBy  = (b) => typeof b === 'string' && b.length > 0 && b.length <= 64

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const now = Date.now()

    // ===== 一覧用：いま対応中のものを返す =====
    if (req.method === 'GET') {
      const arr = await redis(['HGETALL', KEY])
      const locks = {}
      const stale = []
      if (Array.isArray(arr)) {
        for (let i = 0; i + 1 < arr.length; i += 2) {
          const l = unpack(arr[i + 1])
          if (fresh(l, now)) locks[arr[i]] = l
          else stale.push(arr[i]) // 期限切れ・壊れた値は掃除する
        }
      }
      // 掃除は1コマンドにまとめる。失敗しても表示には影響しないので握りつぶす。
      if (stale.length) { try { await redis(['HDEL', KEY, ...stale]) } catch { /* 次回でよい */ } }
      return res.json({ locks, ttlMs: TTL_MS, at: new Date().toISOString() })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // sendBeacon は Blob で送るため、文字列で届くことがある
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
    body = body || {}
    const { action, key, by } = body
    if (!okKey(key) || !okBy(by)) return res.status(400).json({ error: 'key / by が不正です' })

    // ===== 確保する =====
    if (action === 'acquire') {
      // ★HSETNX は「無ければ書く」を1往復で原子的に行う。
      //   読んでから書くと、同時に開いた2人が両方とも「空いている」と判断しうる。
      if (await redis(['HSETNX', KEY, key, pack(now, by)]) === 1) return res.json({ ok: true })
      const cur = unpack(await redis(['HGET', KEY, key]))
      if (cur && cur.by === by) { // 自分の再取得（画面を開き直した等）
        await redis(['HSET', KEY, key, pack(now, by)])
        return res.json({ ok: true })
      }
      if (fresh(cur, now)) return res.json({ ok: false, held: cur }) // 他の人が対応中
      // 期限切れ：捨ててから取り直す。ここで競合しても「誰もいない」状態なので実害は無い。
      await redis(['HDEL', KEY, key])
      if (await redis(['HSETNX', KEY, key, pack(now, by)]) === 1) return res.json({ ok: true })
      const after = unpack(await redis(['HGET', KEY, key]))
      return res.json(fresh(after, now) ? { ok: false, held: after } : { ok: true })
    }

    // ===== 開いている間の更新 =====
    if (action === 'renew') {
      const cur = unpack(await redis(['HGET', KEY, key]))
      if (cur && cur.by !== by && fresh(cur, now)) return res.json({ ok: false, held: cur })
      await redis(['HSET', KEY, key, pack(now, by)])
      return res.json({ ok: true })
    }

    // ===== 解放する =====
    if (action === 'release') {
      const cur = unpack(await redis(['HGET', KEY, key]))
      // 自分の確保でなければ触らない（他の人の対応中を横から消さない）
      if (cur && cur.by === by) await redis(['HDEL', KEY, key])
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'action が不正です' })
  } catch (e) {
    console.error('lock error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
