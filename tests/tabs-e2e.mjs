// 追客・広告費・見積書・上部ボタンを、本物のブラウザで通しで確かめる。
//
// 使い方： npm run build してから node tests/tabs-e2e.mjs
//   （dev サーバーは不要。このファイルが dist を配信する簡易サーバーを立てる）
//
// 本番のRedisには触らない。実 api/inbound.js に偽Redisをつなぎ、本番並みの件数
// （7/1〜10/18 に約5,950件・要追客約850件）を入れて動かす。
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
const REPO = new URL('..', import.meta.url).pathname
if (!fs.existsSync(path.join(REPO, 'dist/index.html'))) { console.log('dist がありません。先に `npm run build` を実行してください。'); process.exit(1) }
process.env.UPSTASH_REDIS_REST_URL='http://mock'; process.env.UPSTASH_REDIS_REST_TOKEN='mock'; process.env.TWILIO_AUTOCALL='off'
let ng=0,ok=0; const t=(c,m,d='')=>{c?(ok++,console.log('✅ '+m+(d?' — '+d:''))):(ng++,console.log('❌ '+m+(d?' — '+d:'')))}
const store=new Map(); const get=k=>store.has(k)?store.get(k):null
globalThis.fetch=async(url,opts)=>{const c=JSON.parse(opts.body);const op=c[0];let result
  if(op==='GET')result=get(c[1]); else if(op==='SET'){store.set(c[1],c[2]);result='OK'}
  else if(op==='EVAL'){const sc=c[1],dk=c[3],vk=c[4]
    if(sc.trim().startsWith('return {'))result=[get(dk)==null?'':get(dk),get(vk)==null?'0':get(vk)]
    else{const cur=get(vk)==null?'0':get(vk); if(String(cur)===String(c[6])){store.set(dk,c[5]);store.set(vk,c[7]);result=1}else result=0}}
  else if(op==='HGETALL')result=[]; else result=null
  return {json:async()=>({result})}}
// 7/1〜10/18 に約5,950件（1日55件）。要追客は約15%（本番867/5955）
const KZ=Array.from({length:9},(_,i)=>({name:'品名'+i,qty:1}))
const start=new Date(2026,6,1,9,0).getTime(), end=new Date(2026,9,18,18,0).getTime()
const N=5950, leads=[]
for(let i=0;i<N;i++){const ts=start+(end-start)*i/(N-1); const d=new Date(ts)
  const site=['価格.com','引越し侍','ズバット'][i%3]
  const rec=site==='引越し侍'?`${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    :`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  leads.push({id:'id'+i,key:'k'+i,phone:'090-1'+String(i).padStart(7,'0'),name:'顧客'+i,site,from:'福岡県福岡市東区',to:'福岡県春日市',count:(i%4?'2人':'1人'),
    receivedAt:rec,status:i%7===0?'要追客':'未架電',memo:'メモ'.repeat(10),savedAt:new Date(ts).toISOString(),kazai:KZ})}
store.set('transportfukuoka:leads',JSON.stringify(leads)); store.set('transportfukuoka:leads:ver','1')
const FOLLOW=leads.filter(l=>l.status==='要追客').length
// 期待値（画面と同じ関数で全件から計算）
// src/lib/adcost.js は拡張子なしの import を使うため、Node で読めるよう一時ファイルに写して読む
const adTmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'adcost-')), 'adcost.mjs')
fs.writeFileSync(adTmp, fs.readFileSync(path.join(REPO, 'src/lib/adcost.js'), 'utf8').replace("from './sortLeads'", `from '${path.join(REPO, 'src/lib/sortLeads.js')}'`))
const { adCountsByMonthDay } = await import(adTmp)
const CONTRACTS=Array.from({length:130},(_,i)=>({id:'c'+i,name:'成約'+i,status:i<5?'要追客':'成約済み',date:`2026-${String(7+(i%4)).padStart(2,'0')}-${String(1+(i%28)).padStart(2,'0')}`,salesDate:`2026-${String(7+(i%4)).padStart(2,'0')}-${String(1+(i%28)).padStart(2,'0')}`,amount:50000+i}))
// 見積書：8件。うち2件は成約から作ったもの（元の成約の位置に並ぶ）
const ESTIMATES=Array.from({length:8},(_,i)=>({id:'e'+i,estimateNo:'EST-2026000'+(i+1),name:'見積'+i,estimateDate:'2026-10-0'+(i+1),total:10000,...(i<2?{contractId:'c'+(10+i)}:{})}))
store.set('transportfukuoka:contracts',JSON.stringify(CONTRACTS)); store.set('transportfukuoka:estimates',JSON.stringify(ESTIMATES))
let expensesPosts=[], failMonth=''
const {default:inbound}=await import(path.join(REPO, 'api/inbound.js'))
const {default:estimateApi}=await import(path.join(REPO, 'api/estimate.js'))
const { buildEstimateRows } = await import(path.join(REPO, 'src/lib/estimateRows.js'))
const ROOT=path.join(REPO, 'dist')
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}
let hits=[]
const srv=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://x'); let raw='';for await(const ch of req)raw+=ch
  const J=(o)=>{const b=JSON.stringify(o);res.writeHead(200,{'Content-Type':'application/json'});res.end(b);return b}
  if(u.pathname==='/api/inbound'){
    if(failMonth && (u.searchParams.get('months')||'').includes(failMonth)){res.writeHead(500);return res.end('{"error":"x"}')}
    let code=200; const t0=Date.now(); await inbound({method:req.method,body:raw?JSON.parse(raw):undefined,query:Object.fromEntries(u.searchParams)},{
      setHeader(){},status(c){code=c;return this},end(){res.writeHead(code);res.end();return this},
      json(o){const b=JSON.stringify(o);hits.push(`${req.method} ${u.search||'(全件)'} ${(b.length/1024).toFixed(0)}KB`);res.writeHead(code,{'Content-Type':'application/json'});res.end(b);return this}}); return}
  if(u.pathname==='/api/contracts') return J({items:CONTRACTS})
  if(u.pathname==='/api/estimate'){ let code=200; await estimateApi({method:req.method,body:raw?JSON.parse(raw):undefined,query:Object.fromEntries(u.searchParams)},{
      setHeader(){},status(c){code=c;return this},end(){res.writeHead(code);res.end();return this},
      json(o){const b=JSON.stringify(o);hits.push(`${req.method} /api/estimate${u.search} ${(b.length/1024).toFixed(0)}KB`);res.writeHead(code,{'Content-Type':'application/json'});res.end(b);return this}}); return }
  if(u.pathname==='/api/expenses'){ if(req.method==='POST'){expensesPosts.push(JSON.parse(raw));return J({ok:true})} return J({data:{}}) }
  if(u.pathname==='/api/lock') return J({locks:{},at:new Date().toISOString()})
  if(u.pathname==='/api/staff') return J({staff:['佐藤']})
  if(u.pathname.startsWith('/api/')) return J({items:[],count:0,statuses:{}})
  let f=path.join(ROOT,u.pathname==='/'?'index.html':u.pathname.replace(/^\//,'')); if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(ROOT,'index.html')
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f))})
await new Promise(r=>srv.listen(0,r)); const PORT=srv.address().port
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'})
const p=await (await b.newContext({viewport:{width:1500,height:900},timezoneId:'Asia/Tokyo'})).newPage()
p.on('pageerror',e=>console.log('PAGEERROR',String(e)))
await p.clock.setFixedTime(new Date(2026,9,18,19,0)) // 「今日」を 2026/10/18 に固定（当月=10月・先月=9月）
await p.goto(`http://localhost:${PORT}/`)
await p.fill('input[placeholder="IDを入力"]','b');await p.fill('input[placeholder="パスワードを入力"]','b')
await p.click('button:has-text("ログイン")');await p.waitForTimeout(1000)
const nav=async(label)=>{hits=[];await p.locator(`.nav-item:has-text("${label}")`).first().evaluate(el=>el.click());await p.waitForTimeout(400)}
const kpiVals=async()=>p.evaluate(()=>[...document.querySelectorAll('.kpi-card')].map(c=>c.querySelector('.kpi-label').innerText+'='+c.querySelector('.kpi-val').innerText.replace(/\s+/g,'')))

console.log('--- 上部 ---')
t(await p.locator('.topbar button:has-text("更新")').count()===0,'★上部の「⟳ 更新」ボタンが出ていない')
t(await p.locator('.topbar-title').count()===1 && await p.locator('.topbar-date').count()===1,'タイトルと日付は残っている')

console.log('\n--- 追客 ---')
await nav('追客'); await p.locator('tbody tr').first().waitFor({timeout:30000}); await p.waitForTimeout(800)
console.log('   通信:',hits.join(' | '))
t(!hits.some(h=>h.includes('(全件)')),'★リード全件を読んでいない')
const leadRowCount=async()=>p.evaluate(()=>[...document.querySelectorAll('tbody tr')].filter(tr=>tr.innerText.includes('顧客')).length)
let lr=await leadRowCount()
t(lr===50,'リード由来の行は50件',String(lr))
let k=await kpiVals(); console.log('   KPI:',k.join(' / '))
t(k[0]===`追客対象（合計）=${FOLLOW+5}件` && k[1]===`うちリード（未成約）=${FOLLOW}件`,'★件数は読んでいない分も含めた全体（要追客リード'+FOLLOW+'＋成約5）')
const more=p.locator(`button:has-text("さらに50件読み込む")`)
t(await more.count()===1,'「さらに50件読み込む」ボタン',await more.innerText().catch(()=>''))
hits=[]; await more.evaluate(el=>el.click()); await p.waitForTimeout(1500)
lr=await leadRowCount(); console.log('   通信:',hits.join(' | '))
t(lr===100,'★押すと100件になる',String(lr))
const keys=await p.evaluate(()=>[...document.querySelectorAll('tbody tr')].map(tr=>tr.innerText).filter(s=>s.includes('顧客')).map(s=>s.match(/顧客\d+/)[0]))
t(new Set(keys).size===keys.length,'重複なし')
k=await kpiVals(); t(k[0]===`追客対象（合計）=${FOLLOW+5}件`,'読み込んでも合計は変わらない',k[0])
t((await more.innerText()).includes(`残り${FOLLOW-100}件`),'残り件数の表示',await more.innerText())

console.log('\n--- 広告費 ---')
await nav('広告費'); await p.waitForFunction(()=>!document.body.innerText.includes('読み込み中'),null,{timeout:30000}); await p.waitForTimeout(500)
console.log('   通信:',hits.join(' | '))
t(!hits.some(h=>h.includes('(全件)')),'★リード全件を読んでいない')
t(hits.some(h=>h.includes('months=2026-10%2C2026-09')||h.includes('months=2026-10,2026-09')),'当月と先月だけ頼んでいる')
// 期待値：全件から同じ関数で数えた、その月の合計件数
const expect=(ym)=>{const m=adCountsByMonthDay(leads)[ym]||{};let s=0,c=0;for(const d of Object.values(m)){s+=d.single*715+d.family*1100+d.kakaku*500+d.zubatto*660;c+=d.single+d.family+d.kakaku+d.zubatto};return {yen:s,c}}
const grand=async()=>Number((await p.locator('.kpi-card').first().locator('.kpi-val').innerText()).replace(/[^\d]/g,''))
let e10=expect('2026-10'); t(await grand()===e10.yen,'★10月の掲載費が全件で数えた値と一致',`${await grand()} / 期待 ${e10.yen}`)
await p.selectOption('select',{value:'2026-09'}); await p.waitForTimeout(600)
let e9=expect('2026-09'); t(await grand()===e9.yen,'★9月（先月）も一致（追加の通信なし）',`${await grand()} / 期待 ${e9.yen}`)
hits=[]; await p.selectOption('select',{value:'2026-07'}); await p.waitForFunction(()=>!document.body.innerText.includes('読み込み中'),null,{timeout:30000}); await p.waitForTimeout(600)
console.log('   通信:',hits.join(' | '))
let e7=expect('2026-07'); t(await grand()===e7.yen,'★7月を選ぶとその月を追加で読み、全件で数えた値と一致',`${await grand()} / 期待 ${e7.yen}`)
t(hits.length===1 && hits[0].includes('months=2026-07'),'7月の分だけ頼んでいる')
failMonth='2026-08'; p.on('dialog',d=>d.accept().catch(()=>{}))
await p.selectOption('select',{value:'2026-08'}); await p.waitForFunction(()=>!document.body.innerText.includes('読み込み中'),null,{timeout:30000}); await p.waitForTimeout(500)
const before=expensesPosts.length
await p.locator('button:has-text("広告費を保存")').evaluate(el=>el.click()); await p.waitForTimeout(800)
t(expensesPosts.length===before,'★8月を読めなかった時は保存されない（0円で上書きしない）')
t((await p.locator('body').innerText()).includes('保存できません'),'理由を表示する')
failMonth=''
await p.locator('button:has-text("再読込")').evaluate(el=>el.click()); await p.waitForFunction(()=>!document.body.innerText.includes('読み込み中'),null,{timeout:30000}); await p.waitForTimeout(600)
t(await grand()===expect('2026-08').yen,'再読込で8月が読めて正しい値になる',`${await grand()}`)
await p.selectOption('select',{value:'2026-09'}); await p.waitForTimeout(300)
await p.selectOption('select',{value:'2026-08'}); await p.waitForFunction(()=>!document.body.innerText.includes('読み込み中'),null,{timeout:30000}); await p.waitForTimeout(600)
let e8=expect('2026-08'); t(await grand()===e8.yen,'★8月（7月との境目 7/31・8/1 を含む）も一致',`${await grand()} / 期待 ${e8.yen}`)
await p.selectOption('select',{value:'2026-07'}); await p.waitForTimeout(500)
t(await grand()===e7.yen,'7月に戻しても値が変わらない（重複して数えない）',`${await grand()}`)
// 保存すると、その月の正しい値が送られる
await p.locator('button:has-text("広告費を保存")').evaluate(el=>el.click()); await p.waitForTimeout(1500)
const post=expensesPosts.at(-1); let sum=0; for(const d of Object.values(post?.values?.daily||{})) sum+=Object.values(d).reduce((a,b)=>a+b,0)
t(post && post.month==='2026-07' && sum===e7.yen,'★保存した値も全件で数えた値と一致',`${post?.month} ${sum}`)

console.log('\n--- 見積書 ---')
const EXPECT=buildEstimateRows(ESTIMATES,CONTRACTS) // 全件で並べた正解（130成約−見積化2＋見積8＝136行）
const rowKeys=async()=>p.evaluate(()=>[...document.querySelectorAll('tbody tr')].map(tr=>tr.children[1].innerText.trim()+'|'+tr.children[2].innerText.trim()))
const expKeys=(n)=>EXPECT.rows.slice(0,n).map(r=>r.estimateNo+'|'+r.name+' 様')
await nav('見積書'); await p.locator('tbody tr').first().waitFor({timeout:30000}); await p.waitForTimeout(800)
console.log('   通信:',hits.join(' | '))
t(!hits.some(h=>h.includes('(全件)')),'★リード全件を読んでいない')
t(hits.some(h=>h.includes('/api/estimate?list=1&offset=0&limit=50')),'★見積書・成約もサーバーから50件だけ受け取る')
t(!hits.some(h=>h.startsWith('GET /api/estimate ')),'見積書の全件は読んでいない')
const er=await p.locator('tbody tr').count(); t(er===50,'一覧は50行',String(er))
t(JSON.stringify(await rowKeys())===JSON.stringify(expKeys(50)),'★並び順が全件で並べた時と同じ（成約から作った見積書は元の成約の位置）')
k=await kpiVals(); t(k[0]==='件数（見積 ／ 成約）=8件/128件'&&k[1]==='合計金額（一覧全体）=¥'+(EXPECT.sumEst+EXPECT.sumCon).toLocaleString('ja-JP'),'★件数・合計金額は一覧全体の値',k.slice(0,2).join(' / '))
const em=p.locator('button:has-text("次の50件を読み込む")'); t((await em.innerText()).includes('残り86件'),'残りの表示',await em.innerText())
hits=[]; await em.evaluate(el=>el.click()); await p.waitForTimeout(800)
t(hits.length===1 && hits[0].includes('offset=50&limit=50'),'押すと次の50件だけ受け取る',hits.join(' | '))
await em.evaluate(el=>el.click()); await p.waitForTimeout(800)
t(await p.locator('tbody tr').count()===136 && await em.count()===0,'★押していくと全136行・ボタンが消える',String(await p.locator('tbody tr').count()))
t(JSON.stringify(await rowKeys())===JSON.stringify(expKeys(136)),'★全部読んだ時の並びも全件で並べた時と同じ（重複・欠落なし）')
// 後から読んだ行（最後の行＝成約由来）から「見積書として作成」を開ける
hits=[]
await p.locator('tbody tr').last().locator('button:has-text("見積書として作成")').evaluate(el=>el.click()); await p.waitForTimeout(800)
t(await p.locator('iframe[title="御見積書"]').count()===1,'★後から読んだ成約の行からも「見積書として作成」が開く')
t(hits.some(h=>h.includes('limit=1&year=2026')),'★開く直前に次の見積番号をサーバーへ聞いている',hits.join(' | '))

await b.close(); await new Promise(r=>srv.close(r))
console.log(`\n${ok} PASS / ${ng} FAIL`); process.exit(ng?1:0)
