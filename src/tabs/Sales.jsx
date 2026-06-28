// 売上管理タブ
// スプレッドシート（写し）の要素を自動で再現する：
//   - 月選択
//   - 総売上 / 件数 / 客単価 / 反響売上（広告4サイト合計） / 広告費 / 粗利
//   - 担当者別 契約件数・売上（古賀/浦田/春木/河村/営業以外/キャンセル など）
//   - サイト別 契約件数・売上（サムライ/ズバット/価格.com/SUUMO/直電/チラシ/企業紹介/キャンセル）
//   - 掲載費入力（月別・サイト別合計）
// データ元：成約管理（/api/contracts）＋ 掲載費（/api/expenses）
import { useEffect, useMemo, useState } from 'react'

// 月選択（直近12ヶ月）
function monthOptions() {
  const opts = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    const y = d.getFullYear(), m = d.getMonth() + 1
    opts.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${y}年${m}月` })
    d.setMonth(d.getMonth() - 1)
  }
  return opts
}
const yen = (n) => '¥' + Math.round(Number(n) || 0).toLocaleString('ja-JP')
const num = (v) => Number(v) || 0

// CRMの流入元（srcLabel）→ スプレッドシートのサイト名 マッピング
// 既存データに「引越し侍」→ スプレッドの「サムライ」、「自社HP」→「直電」「比較ナビ福岡」「紹介」→「企業紹介」など。
const SOURCE_TO_SHEET = {
  '引越し侍':   'サムライ',
  'ズバット':   'ズバット',
  'SUUMO':      'SUUMO',
  '価格.com':   '価格.com',
  '自社HP':     '直電',
  '紹介':       '企業紹介',
  '比較ナビ福岡': '企業紹介',
  'その他':     'その他',
}
const SHEET_SITES = ['サムライ', 'ズバット', '価格.com', 'SUUMO', '直電', 'チラシ', '企業紹介', 'その他']
const AD_SITES = ['サムライ', 'ズバット', '価格.com', 'SUUMO'] // 反響＝広告4サイト

// 掲載費の項目（スプレッドシートと同じ）
const EXPENSE_FIELDS = [
  { key: 'samurai_single', label: 'サムライ 単身' },
  { key: 'samurai_family', label: 'サムライ 家族' },
  { key: 'zubatto',        label: 'ズバット' },
  { key: 'kakaku',         label: '価格.com' },
  { key: 'suumo',          label: 'SUUMO' },
  { key: 'chirashi',       label: 'チラシ' },
  { key: 'other',          label: '企業紹介・その他' },
]

// 成約データを月でフィルタ（contract.date が YYYY-MM で始まる）
function isInMonth(c, monthKey) {
  const d = String(c.date || '')
  if (d.startsWith(monthKey)) return true
  // 「6/3」のような月日のみの場合は現年で解釈
  const m = d.match(/^(\d{1,2})\/(\d{1,2})/)
  if (m) {
    const y = new Date().getFullYear()
    const k = `${y}-${String(parseInt(m[1], 10)).padStart(2, '0')}`
    return k === monthKey
  }
  return false
}

export default function Sales({ user }) {
  const isDemo = user?.mode === 'demo'
  const months = useMemo(monthOptions, [])
  const [selMonth, setSelMonth] = useState(months[0].key)
  const [contracts, setContracts] = useState([])
  const [expenses, setExpenses] = useState({}) // 全月分
  const [loading, setLoading] = useState(!isDemo)
  const [saving, setSaving] = useState(false)
  const [draftExp, setDraftExp] = useState({})
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (isDemo) return
    fetchAll()
  }, [isDemo])

  // 月切替時、編集中の掲載費を月の保存値で初期化
  useEffect(() => {
    const ex = expenses[selMonth] || {}
    const d = {}
    EXPENSE_FIELDS.forEach(f => { d[f.key] = ex[f.key] != null ? ex[f.key] : '' })
    d.note = ex.note || ''
    setDraftExp(d)
  }, [selMonth, expenses])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [cRes, eRes] = await Promise.all([
        fetch('/api/contracts').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/expenses').then(r => r.json()).catch(() => ({ data: {} })),
      ])
      setContracts(cRes.items || [])
      setExpenses(eRes.data || {})
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  // 月内の契約を抽出
  const monthly = useMemo(() => contracts.filter(c => isInMonth(c, selMonth)), [contracts, selMonth])

  // 集計
  const totals = useMemo(() => {
    let total = 0, count = 0, cancelAmt = 0, cancelCnt = 0
    const byStaff = {} // { name: { count, amount } }
    const bySite  = {} // { siteName: { count, amount } }
    SHEET_SITES.forEach(s => { bySite[s] = { count: 0, amount: 0 } })
    bySite['キャンセル'] = { count: 0, amount: 0 }

    for (const c of monthly) {
      const amt = num(c.amount)
      const isCancel = c.status === '失注' || c.status === 'キャンセル'
      total += amt; count += 1
      if (isCancel) { cancelAmt += amt; cancelCnt += 1 }

      // 担当者別
      const staffKey = isCancel ? 'キャンセル' : (c.staff && String(c.staff).trim() ? c.staff : '営業以外')
      byStaff[staffKey] = byStaff[staffKey] || { count: 0, amount: 0 }
      byStaff[staffKey].count += 1
      byStaff[staffKey].amount += amt

      // サイト別
      if (isCancel) {
        bySite['キャンセル'].count += 1
        bySite['キャンセル'].amount += amt
      } else {
        const sheetSite = SOURCE_TO_SHEET[c.srcLabel] || 'その他'
        bySite[sheetSite] = bySite[sheetSite] || { count: 0, amount: 0 }
        bySite[sheetSite].count += 1
        bySite[sheetSite].amount += amt
      }
    }
    const avg = count > 0 ? Math.round(total / count) : 0
    // 反響からの売上＝広告4サイトの合計
    const reverbAmount = AD_SITES.reduce((s, k) => s + (bySite[k]?.amount || 0), 0)
    const reverbCount  = AD_SITES.reduce((s, k) => s + (bySite[k]?.count  || 0), 0)
    return { total, count, avg, cancelAmt, cancelCnt, byStaff, bySite, reverbAmount, reverbCount }
  }, [monthly])

  // 当月の掲載費（保存済みベース）
  const monthExp = expenses[selMonth] || {}
  const adTotal = EXPENSE_FIELDS.reduce((s, f) => s + num(monthExp[f.key]), 0)
  const profit = totals.total - adTotal

  const saveExpenses = async () => {
    if (isDemo) { setToast('デモモード：保存は無効です'); setTimeout(() => setToast(''), 2000); return }
    setSaving(true)
    try {
      const values = {}
      EXPENSE_FIELDS.forEach(f => { values[f.key] = num(draftExp[f.key]) })
      values.note = draftExp.note || ''
      await fetch('/api/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selMonth, values }),
      })
      await fetchAll()
      setToast('保存しました'); setTimeout(() => setToast(''), 1800)
    } catch (e) { console.error(e); setToast('保存に失敗しました'); setTimeout(() => setToast(''), 2000) }
    setSaving(false)
  }

  const monthLabel = months.find(m => m.key === selMonth)?.label || ''

  return (
    <div>
      <div className="page-hdr"><h1>売上管理</h1><p>成約管理の入力から自動集計します（月単位 / 担当者・サイト別 / 掲載費・粗利）</p></div>

      <div className="filter-row">
        <select value={selMonth} onChange={e => setSelMonth(e.target.value)}>
          {months.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {!isDemo && <button className="btn btn-outline btn-sm" onClick={fetchAll} disabled={loading}>⟳ 再集計</button>}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>読み込み中...</div>
      ) : (
        <>
          {/* KPI */}
          <div className="kpi-row kpi-4">
            <div className="kpi-card c-blue">
              <div className="kpi-label">{monthLabel} 総売上</div>
              <div className="kpi-val">{yen(totals.total)}</div>
              <div className="kpi-change">件数 {totals.count}件 ／ 客単価 {yen(totals.avg)}</div>
            </div>
            <div className="kpi-card c-teal">
              <div className="kpi-label">反響からの売上（広告経由）</div>
              <div className="kpi-val">{yen(totals.reverbAmount)}</div>
              <div className="kpi-change">{totals.reverbCount}件（サムライ/ズバット/価格/SUUMO）</div>
            </div>
            <div className="kpi-card c-orange">
              <div className="kpi-label">広告費（掲載費合計）</div>
              <div className="kpi-val">{yen(adTotal)}</div>
              <div className="kpi-change">{adTotal > 0 && totals.reverbAmount > 0 ? `反響ROI ${(totals.reverbAmount / adTotal).toFixed(2)}倍` : '—'}</div>
            </div>
            <div className="kpi-card c-green">
              <div className="kpi-label">粗利（売上 − 広告費）</div>
              <div className="kpi-val">{yen(profit)}</div>
              <div className="kpi-change">キャンセル {totals.cancelCnt}件 / {yen(totals.cancelAmt)}</div>
            </div>
          </div>

          <div className="two-col">
            {/* 担当者別 */}
            <div className="card">
              <div className="card-head"><h3>担当者別 契約件数・売上</h3><span className="c-sub">{monthLabel}</span></div>
              <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
                <table>
                  <thead><tr><th>担当者</th><th style={{ textAlign: 'right' }}>契約件数</th><th style={{ textAlign: 'right' }}>売上</th></tr></thead>
                  <tbody>
                    {Object.keys(totals.byStaff).length === 0 ? (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>{monthLabel} の成約データがありません</td></tr>
                    ) : Object.entries(totals.byStaff)
                      .sort((a, b) => b[1].amount - a[1].amount)
                      .map(([staff, v]) => (
                        <tr key={staff}>
                          <td>{staff}</td>
                          <td style={{ textAlign: 'right' }}>{v.count}件</td>
                          <td style={{ textAlign: 'right' }}><b>{yen(v.amount)}</b></td>
                        </tr>
                      ))}
                    {Object.keys(totals.byStaff).length > 0 && (
                      <tr style={{ fontWeight: 800, background: '#F8FAFC' }}>
                        <td>合計</td>
                        <td style={{ textAlign: 'right' }}>{totals.count}件</td>
                        <td style={{ textAlign: 'right' }}>{yen(totals.total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* サイト別 */}
            <div className="card">
              <div className="card-head"><h3>サイト別 契約件数・売上</h3><span className="c-sub">{monthLabel}</span></div>
              <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
                <table>
                  <thead><tr><th>サイト</th><th style={{ textAlign: 'right' }}>契約件数</th><th style={{ textAlign: 'right' }}>売上</th></tr></thead>
                  <tbody>
                    {[...SHEET_SITES, 'キャンセル'].map(s => {
                      const v = totals.bySite[s] || { count: 0, amount: 0 }
                      if (v.count === 0 && v.amount === 0) return null
                      return (
                        <tr key={s}>
                          <td>{s}</td>
                          <td style={{ textAlign: 'right' }}>{v.count}件</td>
                          <td style={{ textAlign: 'right' }}><b>{yen(v.amount)}</b></td>
                        </tr>
                      )
                    })}
                    {totals.count === 0 && (
                      <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>{monthLabel} の成約データがありません</td></tr>
                    )}
                    {totals.count > 0 && (
                      <tr style={{ fontWeight: 800, background: '#F8FAFC' }}>
                        <td>合計</td>
                        <td style={{ textAlign: 'right' }}>{totals.count}件</td>
                        <td style={{ textAlign: 'right' }}>{yen(totals.total)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div style={{ fontSize: 10, color: '#94A3B8', padding: '6px 0 10px' }}>※ 集計は成約管理の「流入元」と「ステータス」から自動。「自社HP」→「直電」、「比較ナビ福岡/紹介」→「企業紹介」に集約。</div>
              </div>
            </div>
          </div>

          {/* 掲載費 入力 */}
          <div className="card">
            <div className="card-head"><h3>掲載費（広告費）</h3><span className="c-sub">{monthLabel} 入力</span></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {EXPENSE_FIELDS.map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4 }}>{f.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>¥</span>
                      <input type="number" inputMode="numeric" min={0}
                        value={draftExp[f.key] ?? ''}
                        onChange={e => setDraftExp(p => ({ ...p, [f.key]: e.target.value }))}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', textAlign: 'right' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 4 }}>メモ</div>
                <input value={draftExp.note || ''} onChange={e => setDraftExp(p => ({ ...p, note: e.target.value }))}
                  placeholder="例：段ボール小97円/大138円、客単価メモ など" style={{ width: '100%', padding: '7px 10px', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: '#64748B', marginRight: 6 }}>当月 掲載費 合計</span>
                  <b style={{ fontSize: 16 }}>{yen(EXPENSE_FIELDS.reduce((s, f) => s + num(draftExp[f.key]), 0))}</b>
                </div>
                <div style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={saveExpenses} disabled={saving || isDemo}>
                  {saving ? '保存中…' : '掲載費を保存'}
                </button>
              </div>
              {isDemo && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>※ デモモードでは保存できません（表示のみ）。</div>}
            </div>
          </div>

          {/* 売上明細 */}
          <div className="card">
            <div className="card-head"><h3>売上明細</h3><span className="c-sub">{monthLabel} {monthly.length}件</span></div>
            <div className="card-body scroll-x" style={{ padding: '0 16px' }}>
              <table>
                <thead><tr><th>日付</th><th>顧客名</th><th>区間</th><th>流入元</th><th>担当</th><th style={{ textAlign: 'right' }}>金額</th><th>状態</th></tr></thead>
                <tbody>
                  {monthly.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 24 }}>{monthLabel} の成約データがありません</td></tr>
                  ) : monthly
                    .slice()
                    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                    .map(c => (
                      <tr key={c.id}>
                        <td>{c.date}</td>
                        <td>{c.name}</td>
                        <td>{c.route}</td>
                        <td>{c.srcLabel}</td>
                        <td>{c.staff || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{yen(c.amount)}</td>
                        <td>{c.status}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 70, left: '50%', transform: 'translateX(-50%)', background: '#0F2A4A', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 2000 }}>{toast}</div>
      )}
    </div>
  )
}
