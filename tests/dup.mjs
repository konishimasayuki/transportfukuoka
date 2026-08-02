// ============================================================================
// 重複リード取り込みテスト（実 api/inbound.js を起動して検証）
//
// 検証する2点：
//   Q1. 重複リード取得時、利用者が入力したメモ・ステータスが保護されるか
//   Q2. 重複リードが「新規リード」として一覧に追加されてしまわないか
//
// ペイロードは extension/background.js・content.js が実際に送る形をそのまま再現する。
//   侍       : key = 電話(ハイフン付き) || '引越し侍:'+id
//   価格.com : key = 電話 || '価格.com:'+id 、memo を送る
//   ズバット : ①基本(key=o.tel 無加工) → ②詳細(key=正規表現で抽出した電話)
// ============================================================================
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'

const store = new Map()
const get = k => (store.has(k) ? store.get(k) : null)
globalThis.fetch = async (url, opts) => {
  const cmd = JSON.parse(opts.body); const op = cmd[0]; let result
  await new Promise(r => setTimeout(r, 2)) // 往復遅延を模倣（同時POSTを本当に競合させる）
  if (op === 'GET') result = get(cmd[1])
  else if (op === 'SET') { store.set(cmd[1], cmd[2]); result = 'OK' }
  else if (op === 'EVAL') {
    const sc = cmd[1], dk = cmd[3], vk = cmd[4]
    if (sc.trim().startsWith('return {')) {
      // Redis の「Luaテーブルは最初のnilで打ち切り」を忠実に再現
      const hasDef = sc.includes("or ''")
      const lua = hasDef ? [get(dk) == null ? '' : get(dk), get(vk) == null ? '0' : get(vk)]
                         : [get(dk), get(vk)]
      const arr = []; for (const v of lua) { if (v == null) break; arr.push(v) }
      result = arr
    } else {
      const nr = cmd[5], ex = cmd[6], nv = cmd[7]
      const cur = get(vk) == null ? '0' : get(vk)
      if (String(cur) === String(ex)) { store.set(dk, nr); store.set(vk, nv); result = 1 } else result = 0
    }
  }
  return { json: async () => ({ result }) }
}

const { default: handler } = await import('../api/inbound.js')
const DK = 'transportfukuoka:leads'
const call = (method, body) => new Promise(resolve => {
  const res = { setHeader() {}, statusCode: 200, status(c) { this.statusCode = c; return this },
    end() { resolve({ status: this.statusCode }) }, json(o) { resolve({ status: this.statusCode, body: o }) } }
  handler({ method, body, query: {} }, res)
})
const leads = () => JSON.parse(get(DK) || '[]')
const reset = () => { store.clear() }

let pass = 0, fail = 0
const results = []
const ck = (id, name, ok, detail = '') => {
  ok ? pass++ : fail++
  results.push({ id, name, ok, detail })
  console.log(`  ${ok ? 'PASS ✅' : 'FAIL ❌'}  [${id}] ${name}${detail ? '  … ' + detail : ''}`)
}

// ── 実クローラーのペイロード生成（実コードの形を再現）─────────────────
const samurai = (id, phone, over = {}) => ({
  site: '引越し侍', key: phone || ('引越し侍:' + id), phone, name: '山田太郎', kana: 'ヤマダタロウ',
  email: 'y@example.com', count: '2人', from: '福岡市中央区', to: '福岡市西区',
  receivedAt: '07/27 21:00', moveDate: '08月10日 午前中', preferredTime: '午前',
  referenceFee: '80,000円', request: '', orderId: String(id),
  kazai: [], boxCount: '', detail: true,
  timing: { list: 120, detail: 300 }, detectedAt: new Date().toISOString(), ...over,
})
const kakaku = (id, phone, over = {}) => ({
  site: '価格.com', key: phone || ('価格.com:' + id), phone, name: '山田太郎', kana: '', email: '',
  count: '2人', from: '福岡市中央区', to: '福岡市西区', fromZip: '810-0001', fromType: 'マンション',
  receivedAt: '07/27 21:00', moveDate: '08月10日 午前中',
  memo: '間取り:2LDK / 階数:3 / EV:有 / 状況:未対応', // ★価格.comは memo を送る
  orderId: 'A000' + id, detail: true, detectedAt: new Date().toISOString(), ...over,
})
const zbaBasic = (tel, over = {}) => ({
  site: 'ズバット', key: tel, phone: tel, name: '山田太郎', count: '2人',
  from: '福岡市中央区', to: '福岡市西区', receivedAt: '07/27 21:00', moveDate: '08月10日',
  memo: '', orderId: '55501', detectedAt: new Date().toISOString(), ...over,
})
const zbaDetail = (tel, over = {}) => ({
  site: 'ズバット', detail: true, phone: tel, key: tel, name: '山田 太郎', kana: 'ヤマダ タロウ',
  email: 'y@example.com', count: '2人', orderId: '55501', requestedAt: '07/27 21:00',
  moveDateDetail: '2026年08月10日 午前中', fromZip: '810-0001',
  fromAddress: '福岡市中央区天神1-2-3', fromType: 'マンション',
  toZip: '', toAddress: '福岡市西区姪浜4-5', toType: '',
  telStatus: '未架電', mailStatus: '未メール',
  request: 'エアコン移設あり', option: '不用品処分',
  memo: 'ズバット側の自動メモ', // ★ズバット詳細も memo を送る
  boxCount: '15', kazai: [{ name: '冷蔵庫（２ドア）', qty: 1 }, { name: '洗濯機（縦型）', qty: 1 }],
  kazaiCount: 2, kazaiUnknown: 0, detailFetchedAt: new Date().toISOString(), ...over,
})
// 画面(LeadDetailModal/Leads)が送る PUT の形
const uiPut = (lead, patch) => call('PUT', { key: lead.key || lead.phone, phone: lead.phone, ...patch })

const T = (title) => console.log(`\n${title}`)

// ============================================================================
T('■ Q1. 利用者が入力したメモ・ステータスが、重複取得で保護されるか')
// ----------------------------------------------------------------------------
T('【1-1】同じサイト(侍)が同一リードを再送')
reset()
await call('POST', samurai(1001, '090-1111-2222'))
let cur = leads()[0]
await uiPut(cur, { memo: '17時以降に折り返し希望', status: '見積り', staff: '佐藤' })
await call('POST', samurai(1001, '090-1111-2222')) // 再巡回
cur = leads()[0]
ck('1-1a', 'メモが保護される', cur.memo === '17時以降に折り返し希望', `memo="${cur.memo}"`)
ck('1-1b', 'ステータスが保護される', cur.status === '見積り', `status="${cur.status}"`)
ck('1-1c', '担当者が保護される', cur.staff === '佐藤')

T('【1-2】別サイト(価格.com)が memo 付きで同一電話を送信')
reset()
await call('POST', samurai(1002, '090-1111-2222'))
await uiPut(leads()[0], { memo: '担当者メモ', status: '架電済' })
await call('POST', kakaku(777, '090-1111-2222')) // memo を送ってくる
cur = leads()[0]
ck('1-2a', '価格.comのmemoで上書きされない', cur.memo === '担当者メモ', `memo="${cur.memo}"`)
ck('1-2b', 'ステータスが保護される', cur.status === '架電済')

T('【1-3】別サイト(ズバット詳細)が memo 付きで同一電話を送信')
reset()
await call('POST', samurai(1003, '090-1111-2222'))
await uiPut(leads()[0], { memo: '担当者メモ', status: '要追客' })
await call('POST', zbaDetail('090-1111-2222'))
cur = leads()[0]
ck('1-3a', 'ズバットのmemoで上書きされない', cur.memo === '担当者メモ', `memo="${cur.memo}"`)
ck('1-3b', 'ステータスが保護される', cur.status === '要追客')

T('【1-4】ズバット 基本→詳細 の2段階の間に利用者が入力')
reset()
await call('POST', zbaBasic('090-3333-4444'))
await uiPut(leads()[0], { memo: '基本情報の時点でメモ', status: '見積り' })
await call('POST', zbaDetail('090-3333-4444')) // あとから詳細が届く
cur = leads()[0]
ck('1-4a', 'メモが保護される', cur.memo === '基本情報の時点でメモ', `memo="${cur.memo}"`)
ck('1-4b', 'ステータスが保護される', cur.status === '見積り')
ck('1-4c', '詳細（住所）は正しく取り込まれる', cur.fromAddress === '福岡市中央区天神1-2-3')
ck('1-4d', '詳細（家財）は正しく取り込まれる', (cur.kazai || []).length === 2)

T('【1-5】利用者がメモを空にクリアした後、巡回が memo を送ってくる')
reset()
await call('POST', samurai(1005, '090-1111-2222', { }))
await uiPut(leads()[0], { memo: '一旦入力' })
await uiPut(leads()[0], { memo: '' }) // 利用者が意図的に消した
await call('POST', kakaku(778, '090-1111-2222')) // memo付きで巡回
cur = leads()[0]
ck('1-5a', '空にした状態が維持される（巡回で復活しない）', cur.memo === '', `memo=${JSON.stringify(cur.memo)}`)

T('【1-6】利用者が修正した住所・要望・家財が保護される')
reset()
await call('POST', zbaBasic('090-5555-6666'))
await call('POST', zbaDetail('090-5555-6666')) // 詳細が入る
await uiPut(leads()[0], {
  fromAddress: '福岡市中央区大名2-9-9（訂正）', request: '午後に変更', boxCount: '30',
  kazai: [{ name: '冷蔵庫（２ドア）', qty: 1 }, { name: '洗濯機（縦型）', qty: 1 }, { name: 'ピアノ', qty: 1 }],
})
await call('POST', zbaDetail('090-5555-6666')) // もう一度詳細が届く
cur = leads()[0]
ck('1-6a', '住所の訂正が保護される', cur.fromAddress === '福岡市中央区大名2-9-9（訂正）', `="${cur.fromAddress}"`)
ck('1-6b', '要望の変更が保護される', cur.request === '午後に変更', `="${cur.request}"`)
ck('1-6c', '家財の追加が保護される', cur.kazai.length === 3, `家財${cur.kazai.length}種`)
ck('1-6d', '段ボール数の変更が保護される', cur.boxCount === '30', `="${cur.boxCount}"`)

T('【1-7】巡回が10回繰り返されても保護され続ける（持続性）')
reset()
await call('POST', samurai(1007, '090-1111-2222'))
await uiPut(leads()[0], { memo: '長期保護テスト', status: '見積り', staff: '田中', timetree: true })
for (let i = 0; i < 10; i++) { await call('POST', samurai(1007, '090-1111-2222')); await call('POST', kakaku(779, '090-1111-2222')) }
cur = leads()[0]
ck('1-7a', '10回巡回後もメモが保護される', cur.memo === '長期保護テスト', `memo="${cur.memo}"`)
ck('1-7b', '10回巡回後もステータスが保護される', cur.status === '見積り')
ck('1-7c', '10回巡回後も担当者・タイムツリーが保護される', cur.staff === '田中' && cur.timetree === true)

T('【1-8】成約フラグ・金額が巡回で消えない')
reset()
await call('POST', samurai(1008, '090-1111-2222'))
await uiPut(leads()[0], { status: '成約', amount: 120000, contracted: true })
await call('POST', kakaku(780, '090-1111-2222'))
cur = leads()[0]
ck('1-8a', '金額が保護される', cur.amount === 120000, `amount=${cur.amount}`)
ck('1-8b', '成約フラグが保護される', cur.contracted === true)
ck('1-8c', 'ステータス「成約」が保護される', cur.status === '成約')

// ============================================================================
T('\n■ Q2. 重複リードが「新規リード」として一覧に追加されないか')
// ----------------------------------------------------------------------------
T('【2-1】侍が完全同一ペイロードを2回送信')
reset()
const p = samurai(2001, '090-1111-2222')
const r1 = await call('POST', p)
const r2 = await call('POST', p)
ck('2-1a', '一覧は1件のまま', leads().length === 1, `${leads().length}件`)
ck('2-1b', '1回目は新規、2回目は重複と応答する', r1.body.duplicate === false && r2.body.duplicate === true,
  `1回目=${r1.body.duplicate} 2回目=${r2.body.duplicate}`)

T('【2-2】巡回のたびに detectedAt だけが変わる（実運用の再巡回）')
reset()
await call('POST', samurai(2002, '090-1111-2222', { detectedAt: '2026-07-27T12:00:00Z' }))
for (let i = 0; i < 5; i++) await call('POST', samurai(2002, '090-1111-2222', { detectedAt: new Date(Date.now() + i * 1000).toISOString() }))
ck('2-2a', '5回再巡回しても1件のまま', leads().length === 1, `${leads().length}件`)

T('【2-3】ズバット 基本→詳細 の2段階')
reset()
await call('POST', zbaBasic('090-3333-4444'))
await call('POST', zbaDetail('090-3333-4444'))
ck('2-3a', '基本と詳細で2件にならない', leads().length === 1, `${leads().length}件`)
ck('2-3b', '詳細情報が反映されている', !!leads()[0].fromAddress)

T('【2-4】サイト間：同一電話・同一フォーマット')
reset()
await call('POST', samurai(2004, '090-1111-2222'))
await call('POST', kakaku(781, '090-1111-2222'))
await call('POST', zbaDetail('090-1111-2222'))
ck('2-4a', '3サイトで1件に統合される', leads().length === 1, `${leads().length}件`)

T('【2-5】★サイト間：同一人物だが電話の表記が違う（ハイフン有無）')
reset()
await call('POST', samurai(2005, '090-1111-2222'))     // 侍はハイフン付き固定
await call('POST', kakaku(782, '09011112222'))          // 価格.comはハイフン無しもあり得る
const n25 = leads().length
ck('2-5a', '同一人物が1件にまとまる', n25 === 1,
  n25 === 1 ? '1件' : `★${n25}件に分かれた（表記ゆれで別人物と判定）`)

T('【2-6】電話が取得できないリード（key = サイト:id）の再送')
reset()
await call('POST', samurai(2006, '', { name: '氏名のみ' }))
await call('POST', samurai(2006, '', { name: '氏名のみ' }))
await call('POST', samurai(2006, '', { name: '氏名のみ' }))
ck('2-6a', '3回送っても1件のまま', leads().length === 1, `${leads().length}件`)
ck('2-6b', 'キーがサイト:idになっている', leads()[0].key === '引越し侍:2006', `key="${leads()[0].key}"`)

T('【2-7】★電話が後から取得できるようになった場合（key が変化）')
reset()
await call('POST', samurai(2007, '', { name: '山田太郎' }))          // 1回目：電話取れず key='引越し侍:2007'
await call('POST', samurai(2007, '090-1111-2222', { name: '山田太郎' })) // 2回目：電話取得 key=電話
const n27 = leads().length
ck('2-7a', '同じリードが2件にならない', n27 === 1,
  n27 === 1 ? '1件' : `★${n27}件に分かれた（キーが変わり別リード扱い）`)

T('【2-8】同一リードが同時に2回POSTされる（競合）')
reset()
await Promise.all([call('POST', samurai(2008, '090-1111-2222')), call('POST', samurai(2008, '090-1111-2222'))])
ck('2-8a', '同時POSTでも1件のまま', leads().length === 1, `${leads().length}件`)

T('【2-9】拡張のリトライ（サーバー障害後の再送）で二重登録されないか')
reset()
await call('POST', samurai(2009, '090-1111-2222')) // 1回目は成功していた（応答だけ落ちた想定）
await call('POST', samurai(2009, '090-1111-2222')) // 拡張が再送
await call('POST', samurai(2009, '090-1111-2222')) // さらに再送
ck('2-9a', '再送しても1件のまま', leads().length === 1, `${leads().length}件`)

T('【2-10】利用者がメモ入力した後の再巡回で行が増えないか')
reset()
await call('POST', samurai(2010, '090-1111-2222'))
await uiPut(leads()[0], { memo: 'メモあり', status: '見積り' })
await call('POST', samurai(2010, '090-1111-2222'))
await call('POST', kakaku(783, '090-1111-2222'))
await call('POST', zbaDetail('090-1111-2222'))
ck('2-10a', '一覧は1件のまま', leads().length === 1, `${leads().length}件`)
ck('2-10b', 'メモも保持されている', leads()[0].memo === 'メモあり')

T('【2-11】別人（電話が違う）は正しく別リードになる（過剰統合していないか）')
reset()
await call('POST', samurai(2011, '090-1111-2222', { name: '山田太郎' }))
await call('POST', samurai(2012, '090-9999-8888', { name: '鈴木花子' }))
ck('2-11a', '別人は2件になる', leads().length === 2, `${leads().length}件`)
ck('2-11b', 'メモが混入しない', leads().every(l => !l.memo))

T('【2-12】同一電話を家族で共有している場合（既知の仕様：電話＝本人性）')
reset()
await call('POST', samurai(2013, '092-000-1111', { name: '田中一郎' }))
await call('POST', samurai(2014, '092-000-1111', { name: '田中花子' }))
const n212 = leads().length
ck('2-12a', '同一電話は1件に統合される（仕様どおり）', n212 === 1,
  n212 === 1 ? '1件（同一世帯は1リード扱い）' : `${n212}件`)

T('【3-1】CSV取り込み（人手操作）は例外として更新できる')
reset()
await call('POST', samurai(3001, '090-1111-2222'))
await uiPut(leads()[0], { memo: '担当メモ', status: '架電済' })
await call('POST', { site: '引越し侍', key: '090-1111-2222', phone: '090-1111-2222', name: '山田太郎',
  memo: 'CSVのメモ', status: '成約', _manual: true })
cur = leads()[0]
ck('3-1a', 'CSVではメモを更新できる', cur.memo === 'CSVのメモ', `memo="${cur.memo}"`)
ck('3-1b', 'CSVではステータスを更新できる', cur.status === '成約')
ck('3-1c', 'CSVでも行は増えない', leads().length === 1, `${leads().length}件`)

T('【4-1】通し運用：20人×3サイト×5巡回＋利用者入力（件数と保護の総合確認）')
reset()
const people = Array.from({ length: 20 }, (_, i) => ({
  id: 4000 + i, phone: `090-2000-${String(1000 + i).slice(-4)}`, name: `顧客${i}`,
}))
// 初回取り込み（侍）
for (const pp of people) await call('POST', samurai(pp.id, pp.phone, { name: pp.name }))
ck('4-1a', '20人が20件で登録される', leads().length === 20, `${leads().length}件`)
// 全員に利用者がメモ・ステータスを入力
for (const l of leads()) await uiPut(l, { memo: `メモ:${l.name}`, status: '見積り', staff: '佐藤' })
// 3サイト×5巡回
for (let round = 0; round < 5; round++) {
  for (const pp of people) {
    await call('POST', samurai(pp.id, pp.phone, { name: pp.name }))
    await call('POST', kakaku(pp.id, pp.phone, { name: pp.name }))
    await call('POST', zbaDetail(pp.phone, { name: pp.name }))
  }
}
const after = leads()
ck('4-1b', '巡回を重ねても20件のまま（重複追加なし）', after.length === 20, `${after.length}件`)
const memoOk = after.every(l => l.memo === `メモ:${l.name}`)
const statusOk = after.every(l => l.status === '見積り')
const staffOk = after.every(l => l.staff === '佐藤')
ck('4-1c', '全員のメモが保護されている', memoOk, memoOk ? '20/20件' : `崩れ=${after.filter(l => l.memo !== `メモ:${l.name}`).length}件`)
ck('4-1d', '全員のステータスが保護されている', statusOk)
ck('4-1e', '全員の担当者が保護されている', staffOk)
const crossContam = after.some(l => l.memo && !l.memo.endsWith(l.name))
ck('4-1f', '他人のメモが混入していない', !crossContam)

T('【5】今回の修正が過剰統合を起こしていないか（敵対的チェック）')
reset()
// 5-1 別サイトで orderId がたまたま同じでも、サイトが違えば統合しない
await call('POST', samurai(5001, '', { name: 'A氏', orderId: '999' }))
await call('POST', kakaku(5002, '', { name: 'B氏', orderId: '999' }))
ck('5-1', 'サイトが違えば受付番号が同じでも統合しない', leads().length === 2, `${leads().length}件`)

// 5-2 同一サイトで受付番号が空の別人が誤統合されないか
reset()
await call('POST', samurai(5003, '', { name: 'C氏', orderId: '' }))
await call('POST', samurai(5004, '', { name: 'D氏', orderId: '' }))
ck('5-2', '受付番号が空の別人は統合しない', leads().length === 2, `${leads().length}件`)

// 5-3 電話が短すぎる/長すぎる値は電話とみなさない（誤統合防止）
reset()
await call('POST', { site: '引越し侍', key: '12345', name: 'E氏', orderId: 'e1' })
await call('POST', { site: '引越し侍', key: '123-45', name: 'F氏', orderId: 'f1' })
ck('5-3', '電話に見えない短い値では統合しない', leads().length === 2, `${leads().length}件`)

// 5-4 全角数字・空白入りの電話も同一とみなす
reset()
await call('POST', samurai(5005, '090-1111-2222', { name: 'G氏' }))
await call('POST', kakaku(5006, '０９０１１１１２２２２', { name: 'G氏' })) // 全角
ck('5-4', '全角表記の電話も同一人物とみなす', leads().length === 1, `${leads().length}件`)
reset()
await call('POST', samurai(5007, '090-1111-2222', { name: 'H氏' }))
await call('POST', kakaku(5008, '090 1111 2222', { name: 'H氏' }))  // 空白区切り
ck('5-5', '空白区切りの電話も同一人物とみなす', leads().length === 1, `${leads().length}件`)

// 5-6 電話昇格後に他サイトから届いても統合される（2-7の続き）
reset()
await call('POST', samurai(5009, '', { name: 'I氏' }))                 // 電話なし
await call('POST', samurai(5009, '090-7777-8888', { name: 'I氏' }))    // 電話判明→キー昇格
await call('POST', kakaku(5010, '09077778888', { name: 'I氏' }))       // 別サイト・表記違い
ck('5-6', '電話判明後は他サイトとも統合される', leads().length === 1, `${leads().length}件`)

// 5-7 昇格の前後で利用者のメモが失われない
reset()
await call('POST', samurai(5011, '', { name: 'J氏' }))
await uiPut(leads()[0], { memo: '昇格前メモ', status: '見積り' })
await call('POST', samurai(5011, '090-6666-5555', { name: 'J氏' }))    // キー昇格が起きる
cur = leads()[0]
ck('5-7a', 'キー昇格してもメモが残る', cur.memo === '昇格前メモ', `memo="${cur.memo}"`)
ck('5-7b', 'キー昇格してもステータスが残る', cur.status === '見積り')
ck('5-7c', 'キーが電話に昇格している', cur.key === '090-6666-5555', `key="${cur.key}"`)
ck('5-7d', '行は増えていない', leads().length === 1, `${leads().length}件`)

// 5-8 キー昇格後も画面(PUT)から編集できる（idフォールバックが効くか）
const oldKey = '引越し侍:5011'
await call('PUT', { key: oldKey, phone: '090-6666-5555', memo: '古いキーで保存' })
ck('5-8', '画面が古いキーを持っていても保存できる', leads()[0].memo === '古いキーで保存', `memo="${leads()[0].memo}"`)

// ============================================================================
console.log('\n' + '='.repeat(72))
console.log(`合計 ${pass + fail} 件中  ${pass} PASS / ${fail} FAIL`)
if (fail) {
  console.log('\n失敗した項目：')
  results.filter(r => !r.ok).forEach(r => console.log(`  ❌ [${r.id}] ${r.name}  ${r.detail}`))
}
console.log('='.repeat(72))
process.exit(fail ? 1 : 0)
