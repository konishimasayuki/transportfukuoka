// 見積書タブの一覧（見積書＋成約管理のレコード）を作る。
// 画面（デモ）と api/estimate.js（本番：50件ずつ返す）で同じ並びになるよう、ここだけで組み立てる。
// ※ api からも読むため、このファイルの import には拡張子を付けること（今は import なし）。
const num = (v) => Number(v) || 0

// 見積書 + 成約管理 をマージ。成約由来は見積書化されていないものだけ（contractId で重複排除）
// 返す値：rows（並べ替え済み）と、一覧全体の件数・合計金額
export function buildEstimateRows(estimates, contracts) {
  const items = estimates || [], cons = contracts || []
  const issuedContractIds = new Set(items.map(i => i.contractId).filter(Boolean))
  // 成約から起こした見積書は、元の成約と同じ並び順（売上登録日＋成約の並び）のままにする。
  // 見積日で並べ替えると「見積書として作成」を押した瞬間に行が別の場所へ飛ぶため。
  const conById = {}
  cons.forEach((c, ix) => { conById[c.id] = { c, ix } })
  const fromEst = items.map(i => {
    const h = i.contractId ? conById[i.contractId] : null
    return { ...i, _kind: 'estimate',
      _sortDate: (h && (h.c.salesDate || h.c.date)) || i.estimateDate || i.moveDate || '',
      _tie: h ? 1000 + h.ix : 0 }
  })
  // 同じ日付の中でも位置が変わらないよう、成約由来は成約一覧の並びを副キーにする
  const fromCon = cons
    .map((c, ix) => ({ c, ix }))
    .filter(({ c }) => !issuedContractIds.has(c.id))
    .map(({ c, ix }) => ({
      _kind: 'contract',
      _contract: c,
      id: 'c_' + c.id,
      estimateNo: '（成約由来）',
      name: c.name || '',
      moveDate: c.date || '',
      salesDate: c.salesDate || '',
      total: num(c.amount),
      points: 0,
      status: c.status || '成約',
      _sortDate: c.salesDate || c.date || '', // 売り上げ登録日を優先して並べ替え
      _tie: 1000 + ix,
    }))
  const rows = [...fromEst, ...fromCon]
    .sort((a, b) => String(b._sortDate).localeCompare(String(a._sortDate)) || (a._tie - b._tie))
  return {
    rows,
    estCount: items.length,
    conCount: fromCon.length,
    sumEst: items.reduce((s, i) => s + num(i.total), 0),
    sumCon: fromCon.reduce((s, i) => s + num(i.total), 0),
  }
}

// 採番：EST-YYYY####（同年の既存番号の最大+1）
export function nextEstimateNo(estimates, year) {
  const prefix = `EST-${year}`
  const used = (estimates || [])
    .map(i => i.estimateNo)
    .filter(no => typeof no === 'string' && no.startsWith(prefix))
    .map(no => parseInt(no.slice(prefix.length), 10))
    .filter(n => Number.isFinite(n))
  const seq = (used.length ? Math.max(...used) : 0) + 1
  return `${prefix}${String(seq).padStart(4, '0')}`
}
