// 住所文字列から「エリア名（区/市/町村郡）」だけを短縮抽出。リード管理・成約管理の
// 区間表示で共用（例：「福岡市中央区天神1-2-3」→「中央区」、「筑紫野市石崎…」→「筑紫野市」）。
export function shortArea(s) {
  s = String(s || '').replace(/　/g, ' ').trim()
  if (!s) return ''
  let m = s.match(/([^\s\d都道府県市区]{1,8}区)/) // 政令市の区（中央区・小倉南区 等）優先
  if (m) return m[1]
  m = s.match(/([^\s\d都道府県市]{1,8}市)/)         // 市（大野城市 等）
  if (m) return m[1]
  m = s.match(/([^\s\d]{1,8}[町村郡])/)             // 町/村/郡
  if (m) return m[1]
  return (s.split(/[\s\d]/)[0] || s)                // 都道府県のみ等はそのまま
}

// 「A → B」形式の区間文字列を [from, to] に分解（各種矢印・区切りに対応）
export function splitRoute(route) {
  const p = String(route || '').split(/\s*(?:→|->|〜|~|–|—|―|至)\s*/)
  return [(p[0] || '').trim(), (p[1] || '').trim()]
}
