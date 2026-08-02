// 住所・要望・家財の「空欄なら埋める／入っていれば守る」動作を実handlerで検証。
process.env.UPSTASH_REDIS_REST_URL = 'http://mock'
process.env.UPSTASH_REDIS_REST_TOKEN = 'mock'
process.env.TWILIO_AUTOCALL = 'off'
const store = new Map()
const get = k => (store.has(k) ? store.get(k) : null)
globalThis.fetch = async (url, opts) => {
  const cmd = JSON.parse(opts.body); const op = cmd[0]; let result
  if (op === 'GET') result = get(cmd[1])
  else if (op === 'SET') { store.set(cmd[1], cmd[2]); result = 'OK' }
  else if (op === 'EVAL') {
    const sc = cmd[1], dk = cmd[3], vk = cmd[4]
    if (sc.trim().startsWith('return {')) result = [get(dk) == null ? '' : get(dk), get(vk) == null ? '0' : get(vk)]
    else { const nr = cmd[5], ex = cmd[6], nv = cmd[7]; const cur = get(vk) == null ? '0' : get(vk)
      if (String(cur) === String(ex)) { store.set(dk, nr); store.set(vk, nv); result = 1 } else result = 0 }
  }
  return { json: async () => ({ result }) }
}
const { default: h } = await import('../api/inbound.js')
const DK = 'transportfukuoka:leads'
const call = (m, b) => new Promise(r => { const res = { setHeader(){}, statusCode:200, status(c){this.statusCode=c;return this}, end(){r({status:this.statusCode})}, json(o){r({status:this.statusCode,body:o})} }; h({ method:m, body:b, query:{} }, res) })
const lead = () => JSON.parse(get(DK) || '[]')[0]
let pass=0, fail=0
const ck=(n,ok,d='')=>{ok?pass++:fail++;console.log(`  ${ok?'PASS ✅':'FAIL ❌'}  ${n}${d?'  … '+d:''}`)}

console.log('\n【A】ズバットの2段階取り込み（基本→詳細）が従来どおり動くか')
store.clear()
await call('POST', { site:'ズバット', key:'09011112222', phone:'09011112222', name:'山田', from:'中央区', to:'西区' })
ck('①基本情報が登録される', lead().name === '山田' && !lead().fromAddress)
await call('POST', { site:'ズバット', key:'09011112222', phone:'09011112222', detail:true,
  fromAddress:'福岡市中央区天神1-2-3', toAddress:'福岡市西区姪浜4-5', request:'午前希望',
  kazai:[{name:'冷蔵庫（２ドア）',qty:1},{name:'洗濯機（縦型）',qty:1}], boxCount:'15' })
const L = lead()
ck('②空欄だった住所が詳細で埋まる', L.fromAddress === '福岡市中央区天神1-2-3' && L.toAddress === '福岡市西区姪浜4-5')
ck('②空欄だった要望が詳細で埋まる', L.request === '午前希望')
ck('②空欄だった家財が詳細で埋まる', Array.isArray(L.kazai) && L.kazai.length === 2, `家財${(L.kazai||[]).length}種`)
ck('②段ボール数も埋まる', L.boxCount === '15')

console.log('\n【B】担当者が修正した住所・要望・家財が、再巡回で書き換わらないか')
await call('PUT', { key:'09011112222', phone:'09011112222',
  fromAddress:'福岡市中央区大名2-9-9（訂正）', request:'午後に変更', boxCount:'30',
  kazai:[{name:'冷蔵庫（２ドア）',qty:1},{name:'洗濯機（縦型）',qty:1},{name:'ピアノ',qty:1}] })
await call('POST', { site:'ズバット', key:'09011112222', phone:'09011112222', detail:true,
  fromAddress:'福岡市中央区天神1-2-3', toAddress:'福岡市西区姪浜4-5', request:'午前希望',
  kazai:[{name:'冷蔵庫（２ドア）',qty:1},{name:'洗濯機（縦型）',qty:1}], boxCount:'15' })
const M = lead()
ck('住所の訂正が保持される', M.fromAddress === '福岡市中央区大名2-9-9（訂正）', `fromAddress="${M.fromAddress}"`)
ck('要望の変更が保持される', M.request === '午後に変更', `request="${M.request}"`)
ck('家財の追加が保持される', M.kazai.length === 3, `家財${M.kazai.length}種`)
ck('段ボール数の変更が保持される', M.boxCount === '30', `boxCount="${M.boxCount}"`)

console.log('\n【C】メモ・ステータス等の既存の保護に影響がないか')
await call('PUT', { key:'09011112222', phone:'09011112222', memo:'折り返し希望', status:'見積り', staff:'佐藤' })
await call('POST', { site:'価格.com', key:'09011112222', phone:'09011112222', memo:'サイト自動メモ', status:'未架電' })
const N = lead()
ck('メモが保持される', N.memo === '折り返し希望')
ck('ステータスが保持される', N.status === '見積り')
ck('担当者が保持される', N.staff === '佐藤')

console.log('\n【D】CSV取り込み(_manual)では従来どおり上書きできるか')
await call('POST', { site:'ズバット', key:'09011112222', phone:'09011112222', _manual:true,
  fromAddress:'CSVで上書きした住所', request:'CSVの要望', status:'成約' })
const P = lead()
ck('CSVでは住所を更新できる', P.fromAddress === 'CSVで上書きした住所')
ck('CSVでは要望を更新できる', P.request === 'CSVの要望')
ck('CSVではステータスを更新できる', P.status === '成約')

console.log(`\n────────────  合計 ${pass} PASS / ${fail} FAIL  ────────────`)
process.exit(fail?1:0)
