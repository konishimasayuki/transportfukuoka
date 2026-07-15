// デバッグ依頼（掲示板）— 東部＝tobunamakon の「デバッグ依頼」仕様を移植。
// ・スレッド一覧（新しい順・自動更新なし。手動「🔄 更新」）
// ・新規依頼（タイトル＋本文＋画像・複数可）
// ・スレッドを開くと本文＋返信が時系列に並び、誰でも返信できる
// バックエンドは /api/debugreq（既存の /api/debug＝架電テストとは別物）。
import { useState, useEffect, Fragment } from 'react'

// 画像をアップロード前に縮小（最大1400px・JPEG）して data URL 化。複数添付でも容量を抑える。
function scaleImageFile(file, maxDim = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('画像の読込に失敗しました'))
    r.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('画像の解析に失敗しました'))
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const c = document.createElement('canvas')
        c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        try { resolve(c.toDataURL('image/jpeg', quality)) } catch (err) { reject(err) }
      }
      img.src = String(r.result || '')
    }
    r.readAsDataURL(file)
  })
}
// 投稿/返信の画像リスト。新形式 images[] を優先し、旧形式 image(単一) にも対応。
const debugImages = (o) => (o && Array.isArray(o.images) && o.images.length) ? o.images : (o && o.image ? [o.image] : [])
const DEBUG_MAX_IMAGES = 8
// data URL 合計がVercelのボディ上限に近いか（枚数を減らしてもらう判定・base64長で概算）
const debugTooBig = (arr) => arr.reduce((n, s) => n + (s ? s.length : 0), 0) > 4000000

// fetch + JSON（エラーは message を投げる）
async function apiJson(url, opts) {
  const res = await fetch(url, opts)
  let data = {}
  try { data = await res.json() } catch { /* noop */ }
  if (!res.ok) throw new Error(data.error || `エラー(${res.status})`)
  return data
}

export default function DebugRequest({ user }) {
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)   // 詳細表示中のスレッドID（null=一覧）
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [newImgs, setNewImgs] = useState([])
  const [posting, setPosting] = useState(false)

  const author = { id: user?.id || 'anon', name: user?.name || '匿名' }

  const reload = async () => {
    setLoading(true)
    try { const d = await apiJson('/api/debugreq'); setThreads(Array.isArray(d.threads) ? d.threads : []) }
    catch (e) { alert('取得エラー: ' + (e?.message || e)) }
    finally { setLoading(false) }
  }
  // 初回のみ取得（自動更新なし）。URL に ?thread=xxx があれば、そのスレッドを開いた状態にする
  //   （チャットの「デバッグ依頼」通知リンクから、該当スレッドへ直接飛べるようにする）。
  useEffect(() => {
    reload()
    try { const tid = new URLSearchParams(window.location.search).get('thread'); if (tid) setOpenId(tid) } catch { /* noop */ }
  }, [])
  const opened = openId ? threads.find(t => t.id === openId) : null

  // 複数画像対応：選んだ画像を縮小して現在の配列に追記（枚数上限あり）
  const onImgs = async (e, current, setter) => {
    const files = Array.from(e.target.files || []); e.target.value = ''
    if (!files.length) return
    const room = DEBUG_MAX_IMAGES - current.length
    if (room <= 0) { alert(`画像は最大 ${DEBUG_MAX_IMAGES} 枚までです`); return }
    const use = files.slice(0, room)
    if (files.length > room) alert(`画像は最大 ${DEBUG_MAX_IMAGES} 枚まで。先頭 ${room} 枚のみ追加します`)
    const out = []
    for (const f of use) {
      if (!/^image\//.test(f.type)) { alert(`「${f.name}」は画像ではありません`); continue }
      if (f.size > 20 * 1024 * 1024) { alert(`「${f.name}」が大きすぎます`); continue }
      try { out.push(await scaleImageFile(f)) } catch (err) { alert('画像の処理に失敗: ' + (err?.message || err)) }
    }
    if (out.length) setter(prev => [...prev, ...out].slice(0, DEBUG_MAX_IMAGES))
  }

  const postThread = async () => {
    if (!newTitle.trim() && !newBody.trim() && !newImgs.length) { alert('タイトル・本文・画像のいずれかを入力してください'); return }
    if (debugTooBig(newImgs)) { alert('画像の合計が大きすぎます。枚数を減らしてください'); return }
    setPosting(true)
    try {
      const d = await apiJson('/api/debugreq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle, body: newBody, images: newImgs, author }) })
      setThreads(prev => [d.thread, ...prev])
      setNewTitle(''); setNewBody(''); setNewImgs([])
    } catch (e) { alert('投稿エラー: ' + (e?.message || e)) }
    finally { setPosting(false) }
  }

  const delThread = async (t) => {
    if (!window.confirm(`スレッドを削除しますか？\n「${t.title || (t.body || '').slice(0, 30)}」`)) return
    try {
      await apiJson('/api/debugreq?id=' + encodeURIComponent(t.id), { method: 'DELETE' })
      setThreads(prev => prev.filter(x => x.id !== t.id))
      if (openId === t.id) setOpenId(null)
    } catch (e) { alert('削除エラー: ' + (e?.message || e)) }
  }

  const fmt = (iso) => {
    try { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` }
    catch { return '' }
  }

  const card = { background: '#fff', border: '1px solid #dde3ed', borderRadius: 10, padding: 14, marginBottom: 12 }
  const lbl = { fontSize: 12, fontWeight: 700, color: '#475467', marginBottom: 4 }
  const inp = { width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '8px 10px', border: '1.5px solid #d4dbe5', borderRadius: 8, fontFamily: 'inherit' }
  const btn = (variant) => ({ border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
    background: variant === 'primary' ? 'linear-gradient(135deg,#1a4d8f,#1a6a9f)' : variant === 'ghost' ? '#fff' : '#eef0f4',
    color: variant === 'primary' ? '#fff' : variant === 'ghost' ? '#3a4a5c' : '#475467',
    ...(variant === 'ghost' ? { border: '1.5px solid #cdd5e0' } : {}) })

  if (opened) {
    return (
      <div style={{ height: '100%', overflow: 'auto', padding: 20, background: '#f3f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button type="button" onClick={() => setOpenId(null)} style={btn('ghost')}>← 一覧へ戻る</button>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1a2332' }}>🐛 デバッグ依頼</h2>
        </div>
        <DebugThreadView thread={opened} author={author} fmt={fmt} onImgs={onImgs} onPosted={(t) => setThreads(prev => prev.map(x => x.id === t.id ? t : x))} onDelete={() => delThread(opened)} />
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 20, background: '#f3f5f9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#1a2332' }}>🐛 デバッグ依頼</h2>
        <button type="button" onClick={reload} disabled={loading} style={btn('ghost')}>🔄 更新</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7a8d' }}>※ 自動更新はしません。新着確認は手動で🔄 更新を押してください</span>
      </div>

      {/* 新規スレッド作成 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2332', marginBottom: 8 }}>＋ 新規依頼を投稿</div>
        <div style={{ marginBottom: 8 }}>
          <div style={lbl}>タイトル</div>
          <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="例: リード管理で並び順がおかしい" style={inp} maxLength={200} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={lbl}>本文（再現手順や期待動作など）</div>
          <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ ...btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }}>📷 スクショ添付（複数可）
            <input type="file" accept="image/*" multiple onChange={e => onImgs(e, newImgs, setNewImgs)} style={{ display: 'none' }} />
          </label>
          {newImgs.map((src, i) => (
            <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
              <img src={src} alt="" style={{ height: 60, border: '1px solid #cdd5e0', borderRadius: 6, display: 'block' }} />
              <button type="button" onClick={() => setNewImgs(list => list.filter((_, j) => j !== i))} title="外す"
                style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, lineHeight: '18px', textAlign: 'center', border: '1px solid #f0c0c0', background: '#fff0f0', color: '#c0392b', borderRadius: '50%', fontSize: 12, cursor: 'pointer', padding: 0 }}>×</button>
            </span>
          ))}
          {newImgs.length > 0 && <span style={{ fontSize: 11, color: '#6b7a8d' }}>{newImgs.length}枚</span>}
          <button type="button" onClick={postThread} disabled={posting} style={{ ...btn('primary'), marginLeft: 'auto', opacity: posting ? 0.6 : 1 }}>{posting ? '投稿中…' : '投稿する'}</button>
        </div>
      </div>

      {/* スレッド一覧 */}
      {loading ? <div style={{ padding: 20, color: '#6b7a8d' }}>読み込み中…</div>
        : threads.length === 0 ? <div style={{ padding: 20, color: '#6b7a8d' }}>まだ依頼はありません。最初の投稿をしてください。</div>
        : threads.map(t => {
          const last = t.replies && t.replies.length ? t.replies[t.replies.length - 1] : null
          return (
            <div key={t.id} style={{ ...card, cursor: 'pointer' }} onClick={() => setOpenId(t.id)}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1a2332' }}>{t.title || '(無題)'}</span>
                <span style={{ fontSize: 12, color: '#6b7a8d' }}>{t.author?.name || '匿名'} ／ {fmt(t.createdAt)}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#1b4ea8', fontWeight: 700 }}>💬 {(t.replies || []).length}</span>
              </div>
              {t.body ? <div style={{ marginTop: 6, fontSize: 13, color: '#3a4a5c', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.body}</div> : null}
              {debugImages(t).length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {debugImages(t).slice(0, 4).map((src, i) => (
                    <img key={i} src={src} alt="" style={{ maxHeight: 80, border: '1px solid #cdd5e0', borderRadius: 6 }} />
                  ))}
                  {debugImages(t).length > 4 && <span style={{ fontSize: 12, color: '#6b7a8d' }}>＋{debugImages(t).length - 4}枚</span>}
                </div>
              )}
              {last && <div style={{ marginTop: 8, fontSize: 12, color: '#6b7a8d' }}>↳ 最新返信: {last.author?.name || '匿名'} ／ {fmt(last.createdAt)}</div>}
            </div>
          )
        })}
    </div>
  )
}

// スレッド詳細：親投稿 + 返信一覧 + 返信フォーム
function DebugThreadView({ thread, author, fmt, onImgs, onPosted, onDelete }) {
  const [body, setBody] = useState('')
  const [imgs, setImgs] = useState([])
  const [posting, setPosting] = useState(false)
  const canDelete = !thread.author || !thread.author.id || thread.author.id === author.id
  const submit = async () => {
    if (!body.trim() && !imgs.length) { alert('本文または画像を入力してください'); return }
    if (debugTooBig(imgs)) { alert('画像の合計が大きすぎます。枚数を減らしてください'); return }
    setPosting(true)
    try {
      const d = await apiJson('/api/debugreq?id=' + encodeURIComponent(thread.id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, images: imgs, author }) })
      setBody(''); setImgs([])
      onPosted(d.thread)
    } catch (e) { alert('返信エラー: ' + (e?.message || e)) }
    finally { setPosting(false) }
  }
  const post = (item, opts = {}) => {
    const pics = debugImages(item)
    return (
      <div style={{ background: '#fff', border: '1px solid #dde3ed', borderRadius: 10, padding: 14, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, color: '#1a2332', fontSize: 14 }}>{item.author?.name || '匿名'}</span>
          <span style={{ fontSize: 12, color: '#6b7a8d' }}>{fmt(item.createdAt)}</span>
          {opts.head && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#fff', background: '#1a4d8f', borderRadius: 4, padding: '1px 6px', fontWeight: 700 }}>親投稿</span>}
        </div>
        {opts.title ? <div style={{ marginTop: 6, fontSize: 16, fontWeight: 700, color: '#1a2332' }}>{opts.title}</div> : null}
        {item.body ? <div style={{ marginTop: 8, fontSize: 14, color: '#1a2332', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{item.body}</div> : null}
        {pics.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pics.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>
                <img src={src} alt="" style={{ maxWidth: '100%', maxHeight: 480, border: '1px solid #cdd5e0', borderRadius: 6, display: 'block' }} />
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <div>
      {post(thread, { head: true, title: thread.title })}
      {(thread.replies || []).map(r => <Fragment key={r.id}>{post(r)}</Fragment>)}
      {/* 返信フォーム */}
      <div style={{ background: '#fff', border: '1px solid #dde3ed', borderRadius: 10, padding: 14, marginTop: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475467', marginBottom: 6 }}>💬 返信を投稿</div>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} placeholder="本文を入力（誰でも返信できます）" style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '8px 10px', border: '1.5px solid #d4dbe5', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1.5px solid #cdd5e0', background: '#fff', color: '#3a4a5c', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📷 スクショ添付（複数可）
            <input type="file" accept="image/*" multiple onChange={e => onImgs(e, imgs, setImgs)} style={{ display: 'none' }} />
          </label>
          {imgs.map((src, i) => (
            <span key={i} style={{ position: 'relative', display: 'inline-block' }}>
              <img src={src} alt="" style={{ height: 50, border: '1px solid #cdd5e0', borderRadius: 6, display: 'block' }} />
              <button type="button" onClick={() => setImgs(list => list.filter((_, j) => j !== i))} title="外す"
                style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, lineHeight: '16px', textAlign: 'center', border: '1px solid #f0c0c0', background: '#fff0f0', color: '#c0392b', borderRadius: '50%', fontSize: 11, cursor: 'pointer', padding: 0 }}>×</button>
            </span>
          ))}
          {canDelete && (
            <button type="button" onClick={onDelete} style={{ border: '1px solid #f0c0c0', background: '#fff0f0', color: '#c0392b', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>🗑 スレッドを削除</button>
          )}
          <button type="button" onClick={submit} disabled={posting} style={{ marginLeft: 'auto', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg,#1a4d8f,#1a6a9f)', color: '#fff', opacity: posting ? 0.6 : 1 }}>{posting ? '送信中…' : '返信する'}</button>
        </div>
      </div>
    </div>
  )
}
