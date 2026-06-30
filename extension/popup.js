async function refresh() {
  const { enabled, count, countDate } = await chrome.storage.local.get(['enabled', 'count', 'countDate'])
  const on = enabled !== false
  const toggle = document.getElementById('toggle')
  const state = document.getElementById('state')
  toggle.checked = on
  state.textContent = on ? 'ON' : 'OFF'
  state.className = on ? 'state-on' : 'state-off'

  const today = new Date().toISOString().slice(0, 10)
  document.getElementById('count').textContent = (countDate === today ? (count || 0) : 0)
  document.getElementById('status').textContent = '送信先: transportfukuoka.vercel.app/api/inbound'
}

document.getElementById('toggle').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ enabled: e.target.checked })
  refresh()
})

// 取りこぼし取り込み：ボタン押下時にその場でスクレイプ処理をページへ注入して実行。
// content.js の状態（古い版が残っている等）に依存しないため、F5なしで動く。
document.getElementById('resync').addEventListener('click', async () => {
  const btn = document.getElementById('resync')
  const result = document.getElementById('result')
  btn.disabled = true
  result.style.color = '#64748b'
  result.textContent = '取り込み中...'
  try {
    const tabs = await chrome.tabs.query({ url: 'https://hikkoshi-kanri.zba.jp/*' })
    if (!tabs.length) {
      result.style.color = '#dc2626'
      result.textContent = 'ズバットの顧客一覧ページを開いてから実行してください'
      return
    }
    // 一覧が iframe 内でも拾えるよう全フレームでスクレイプ
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id, allFrames: true },
      func: scrapeRows,
    })
    const leads = frames.flatMap(f => f.result || [])
    if (!leads.length) {
      result.style.color = '#dc2626'
      result.textContent = '一覧の行が見つかりません。顧客一覧を表示してから実行してください'
      return
    }
    // 取得した全行をサーバへ。重複はサーバ側で除外されるので、新規だけ取り込まれる。
    let added = 0, dup = 0, fail = 0
    for (const lead of leads) {
      const res = await chrome.runtime.sendMessage({ type: 'NEW_LEAD', lead })
      if (res && res.ok) { res.duplicate ? dup++ : added++ } else fail++
    }
    result.style.color = added > 0 ? '#16a34a' : '#64748b'
    result.textContent = `新規${added}件を取り込み（重複${dup}・失敗${fail}／一覧${leads.length}件）`
    refresh()
  } catch (e) {
    result.style.color = '#dc2626'
    result.textContent = 'エラー: ' + (e && e.message ? e.message : String(e))
  } finally {
    btn.disabled = false
  }
})

// 引越し侍：取りこぼし取り込み。
// content.js の有無に依存しないよう、その場でスクレイプ＆詳細取得をページへ注入して実行。
// 返ってきたリードを background 経由でサーバへ送る（重複はサーバ側で除外）。
document.getElementById('resyncSamurai').addEventListener('click', async () => {
  const btn = document.getElementById('resyncSamurai')
  const result = document.getElementById('resultSamurai')
  btn.disabled = true
  result.style.color = '#64748b'
  result.textContent = '取り込み中…（件数により時間がかかります）'
  try {
    const tabs = await chrome.tabs.query({ url: 'https://hikkosizamurai.com/admin/*' })
    if (!tabs.length) {
      result.style.color = '#dc2626'
      result.textContent = '引越し侍の一覧ページ（/admin/...）を開いてから実行してください'
      return
    }
    const frames = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: samuraiScrapeAndFetch,
    })
    const r = (frames && frames[0] && frames[0].result) || {}
    if (r.error === 'rows-not-found' || !r.leads) {
      result.style.color = '#dc2626'
      result.textContent = '一覧の行が見つかりません。引越し侍の依頼一覧を表示してから実行してください'
      return
    }
    const leads = r.leads
    if (!leads.length) {
      result.style.color = '#64748b'
      result.textContent = '対象がありませんでした'
      return
    }
    let added = 0, dup = 0, fail = 0
    for (const lead of leads) {
      const res = await chrome.runtime.sendMessage({ type: 'NEW_LEAD', lead })
      if (res && res.ok) { res.duplicate ? dup++ : added++ } else fail++
    }
    result.style.color = added > 0 ? '#16a34a' : '#64748b'
    result.textContent = `新規${added}件を取り込み（重複${dup}・失敗${fail}／一覧${leads.length}件）`
    refresh()
  } catch (e) {
    result.style.color = '#dc2626'
    result.textContent = 'エラー: ' + (e && e.message ? e.message : String(e))
  } finally {
    btn.disabled = false
  }
})

// ページ内で実行（自己完結。executeScript用）。表示中の一覧→依頼番号→詳細fetch→リード配列。
async function samuraiScrapeAndFetch() {
  const norm = s => (s == null ? '' : String(s)).replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
  const textOf = el => norm(el ? el.textContent : '')
  const links = [...document.querySelectorAll('a[href*="/request/detail/id/"]')]
  const dedup = new Set(); const items = []
  for (const a of links) {
    const m = (a.getAttribute('href') || '').match(/id\/(\d+)/)
    if (m && !dedup.has(m[1])) { dedup.add(m[1]); items.push({ id: m[1], tr: a.closest('tr') }) }
  }
  if (!items.length) return { error: 'rows-not-found' }
  const padMD = s => { const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')} ${m[3].padStart(2, '0')}:${m[4]}` : (s || '') }
  const baseOf = (id, tr) => { const c = tr ? [...tr.children].map(textOf) : []; return { id, name: c[1] || '', fromPref: c[2] || '', toPref: c[3] || '', type: c[4] || '', receivedAt: padMD(c[5] || ''), moveDate: c[6] || '' } }
  const buildLabelMap = doc => { const map = {}; doc.querySelectorAll('tr').forEach(tr => { const cells = [...tr.children]; for (let i = 0; i + 1 < cells.length; i++) { const k = textOf(cells[i]); if (k && !(k in map)) map[k] = textOf(cells[i + 1]) } }); return map }
  const SUBCATS = new Set(['家具', '家電', 'その他', '重量物'])
  const SKIP = new Set(['家財', '家具', '家電', 'その他', '重量物'])
  const parseKazaiFull = doc => {
    const lbl = [...doc.querySelectorAll('th,td')].find(c => textOf(c) === '家財')
    if (!lbl) return { kazai: [], boxCount: '' }
    const rows = []
    let tr = lbl.closest('tr'); if (tr) rows.push(tr)
    let nx = tr ? tr.nextElementSibling : null
    while (nx) { const first = textOf(nx.querySelector('th,td')); if (SUBCATS.has(first)) { rows.push(nx); nx = nx.nextElementSibling } else break }
    const tokens = rows.flatMap(r => [...r.querySelectorAll('th,td')]).flatMap(c => textOf(c).split(' ')).filter(Boolean)
    const kazai = []; let boxCount = ''
    for (let i = 0; i < tokens.length; i++) {
      if (/^\d+$/.test(tokens[i])) {
        const qty = parseInt(tokens[i], 10); const name = tokens[i - 1]
        if (!name || SKIP.has(name)) continue
        if (name === 'ダンボール' || name === 'ダンボール箱') { if (qty > 0) boxCount = String(qty); continue }
        if (qty > 0) kazai.push({ name, qty })
      }
    }
    return { kazai, boxCount }
  }
  const PREF_RE = /(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/
  const addrOf = (doc, label) => {
    const cell = [...doc.querySelectorAll('th,td')].find(c => textOf(c).startsWith(label))
    if (!cell) return ''
    let s = textOf(cell); if (s.startsWith(label)) s = s.slice(label.length).trim()
    const m = s.match(PREF_RE)
    if (m) return s.slice(m.index).trim()
    return s.replace(/〒?\d{3}-\d{4}/, '').trim()
  }
  const leads = []
  for (const { id, tr } of items) {
    try {
      const b = baseOf(id, tr)
      const res = await fetch(`/admin/request/detail/id/${id}`, { credentials: 'include', cache: 'no-store', headers: { accept: 'text/html', 'cache-control': 'no-cache' } })
      if (!res.ok) continue
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
      const map = buildLabelMap(doc); const get = k => map[k] || ''
      const phone = (get('電話番号').match(/0\d{1,4}-\d{1,4}-\d{3,4}/) || [''])[0]
      const email = (get('メールアドレス').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0]
      const name = get('名前').replace(/\s*様$/, '').replace(/\s*さん$/, '') || b.name
      const k = parseKazaiFull(doc)
      leads.push({
        site: '引越し侍', key: phone || `引越し侍:${id}`, phone, name,
        kana: get('フリガナ'), email, count: get('引越し人数') || b.type,
        from: addrOf(doc, '現住所') || b.fromPref, to: addrOf(doc, '引越し先') || b.toPref, receivedAt: b.receivedAt,
        moveDate: get('引越し希望日') || b.moveDate, preferredTime: get('引越し希望時間'),
        referenceFee: get('表示料金相場'), request: get('備考・その他要望'),
        orderId: String(id), kazai: k.kazai, boxCount: k.boxCount, detail: true, detectedAt: new Date().toISOString(),
      })
      await new Promise(r => setTimeout(r, 200))
    } catch {}
  }
  return { leads }
}

// ページ内で実行される関数（外部変数を参照しない自己完結。executeScript用）
function scrapeRows() {
  const PHONE_RE = /0\d{1,4}-?\d{1,4}-?\d{3,4}/
  const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/
  const txt = (tds, i) => (tds[i] && tds[i].innerText ? tds[i].innerText : '').replace(/\s+/g, ' ').trim()
  let rows = document.querySelectorAll('.usersBlock table tbody tr')
  if (!rows.length) rows = document.querySelectorAll('table tbody tr') // 念のためのフォールバック
  const out = []
  rows.forEach(row => {
    const tds = row.querySelectorAll('td')
    if (!tds.length) return
    let phone = ''
    const g = txt(tds, 4).match(PHONE_RE)
    if (g) phone = g[0]
    if (!phone) for (const td of tds) { const m = (td.innerText || '').match(PHONE_RE); if (m) { phone = m[0]; break } }
    if (!phone) return // 電話番号が無い行は対象外
    let email = ''
    for (const td of tds) { const m = (td.innerText || '').match(EMAIL_RE); if (m) { email = m[0]; break } }
    out.push({
      site: 'ズバット', key: phone, phone,
      name: txt(tds, 0), count: txt(tds, 1), from: txt(tds, 2), to: txt(tds, 3),
      receivedAt: txt(tds, 5), moveDate: txt(tds, 6), email,
      detectedAt: new Date().toISOString(),
    })
  })
  return out
}

refresh()
