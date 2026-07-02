// 担当者リスト共有ヘルパ
// 設定タブで編集し、成約管理／成約登録モーダルのプルダウンで使う。
// API(/api/staff) が空・未設定・エラーのときは DEFAULT_STAFF を返す。
export const DEFAULT_STAFF = ['古賀', '浦田', '春木', '河村', '鷹野', '田中', 'バイト', '現場']

export async function fetchStaffList() {
  try {
    const r = await fetch('/api/staff')
    const d = await r.json()
    const arr = Array.isArray(d.items) ? d.items.filter(Boolean) : []
    return arr.length ? arr : DEFAULT_STAFF
  } catch {
    return DEFAULT_STAFF
  }
}
