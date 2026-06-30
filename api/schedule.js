// スケジュール（予定）の保存／取得（Redis: transportfukuoka:schedule = 配列）
// 初回（キー未設定）はサンプルを投入して返す。全削除後は再投入しない。
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = 'transportfukuoka:schedule'

// 各ジャンル2〜3件のサンプル（現状の月に表示される日付で投入）
const SEED = [
  { id: 'seed1', calendar: '引っ越し', title: '田中様 引越し', allDay: false, start: '2026-06-30', startTime: '09:00', end: '2026-06-30', endTime: '12:00', label: 'blue',   location: '東区→博多区', memo: '2tショート / 作業2名', attachments: [] },
  { id: 'seed2', calendar: '引っ越し', title: '佐藤様 引越し', allDay: false, start: '2026-06-30', startTime: '13:30', end: '2026-06-30', endTime: '16:00', label: 'red',    location: '南区→春日市', memo: 'エアコン取外しあり', attachments: [] },
  { id: 'seed3', calendar: '引っ越し', title: '山口様 引越し', allDay: true,  start: '2026-07-01', startTime: '',      end: '2026-07-01', endTime: '',      label: 'orange', location: '西区', memo: '', attachments: [] },
  { id: 'seed4', calendar: '見積り',   title: '浜口様 見積り訪問', allDay: false, start: '2026-06-30', startTime: '10:00', end: '2026-06-30', endTime: '10:30', label: 'yellow', location: '中央区高砂', memo: '家族2名 2LDK', attachments: [] },
  { id: 'seed5', calendar: '見積り',   title: '高松様 見積り', allDay: false, start: '2026-06-29', startTime: '11:00', end: '2026-06-29', endTime: '', label: 'yellow', location: '', memo: '', attachments: [] },
  { id: 'seed6', calendar: '見積り',   title: '鈴木様 見積り', allDay: false, start: '2026-07-02', startTime: '14:00', end: '2026-07-02', endTime: '', label: 'yellow', location: '早良区', memo: '', attachments: [] },
  { id: 'seed7', calendar: '段ボール配達', title: '大川原様 段ボール配達', allDay: true, start: '2026-06-30', startTime: '', end: '2026-06-30', endTime: '', label: 'green', location: '東区', memo: '大10 / 小20', attachments: [] },
  { id: 'seed8', calendar: '段ボール配達', title: '長谷部様 配達', allDay: false, start: '2026-07-01', startTime: '15:00', end: '2026-07-01', endTime: '', label: 'green', location: '', memo: '', attachments: [] },
  { id: 'seed9', calendar: '段ボール配達', title: '庄司様 段ボール配達', allDay: true, start: '2026-06-28', startTime: '', end: '2026-06-28', endTime: '', label: 'green', location: '', memo: '', attachments: [] },
]

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

async function getItems() {
  const raw = await redis(['GET', KEY])
  if (raw == null) return null            // キー未設定
  try { return JSON.parse(raw) } catch { return [] }
}
async function setItems(items) { await redis(['SET', KEY, JSON.stringify(items)]) }

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      let items = await getItems()
      if (!Array.isArray(items)) { items = SEED.slice(); await setItems(items) } // 初回のみ投入
      return res.json({ items })
    }
    if (req.method === 'POST') {
      const items = (await getItems()) || []
      const newItem = { ...req.body, id: req.body.id || Date.now().toString(), createdAt: new Date().toISOString() }
      await setItems([newItem, ...items])
      return res.json({ ok: true, item: newItem })
    }
    if (req.method === 'PUT') {
      const items = (await getItems()) || []
      const updated = items.map(i => i.id === req.body.id ? { ...i, ...req.body, updatedAt: new Date().toISOString() } : i)
      await setItems(updated)
      return res.json({ ok: true })
    }
    if (req.method === 'DELETE') {
      const items = (await getItems()) || []
      await setItems(items.filter(i => i.id !== req.body.id))
      return res.json({ ok: true })
    }
    res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
