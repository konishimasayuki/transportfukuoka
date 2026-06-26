// リード詳細モーダル（リード一覧／架電ログで共用）
// 画像1（引越し侍の管理画面）に倣い、セクション分け＋家財カテゴリ別で表示する。
// onStatusChange を渡すとステータスを編集可、渡さなければバッジ表示のみ。
const STATUS_LIST  = ['未架電', '架電済', '留守', '成約', '見送り']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', '成約': 'bg', '見送り': 'bk' }

// 家財のカテゴリ分け（画像1の 家具／家電／その他／重量物 に合わせる）
const KAZAI_CATEGORY = {
  家具: ['ソファ', 'ソファ（1人掛け）', 'ソファ（2人掛け）', 'ソファ（3人掛け）', 'サイドボード・テレビ台',
    'チェスト（大）', 'チェスト（中・小）', 'リビングテーブル', 'ダイニングテーブルセット', 'シャンデリア・スタンド',
    'こたつ', '絨毯・カーペット', '絨毯・カーペット（10畳未満）', '絨毯・カーペット（10畳以上）',
    'ベッド', 'ベッド（シングル）', 'ベッド（セミダブル）', 'ベッド（ダブル）', '布団類',
    'タンス', 'タンス（中・小）', 'タンス（大）', '本棚', '本棚（中・小）', '本棚（大）', '衣装ケース',
    '机/椅子', '机', '椅子', 'ドレッサー', '食器棚', '食器棚（中・小）', '食器棚（大）'],
  家電: ['テレビ', 'テレビ（40インチ未満）', 'テレビ（40インチ以上）', 'ステレオ・コンポ類', 'ステレオ', 'ミニコンポ',
    'デスクトップパソコン', '冷蔵庫', '冷蔵庫（２ドア）', '冷蔵庫（3ドア）',
    '洗濯機', '洗濯機（縦型）', '洗濯機（ドラム式）', '乾燥機', '電子レンジ', 'エアコン', 'ストーブ・ヒーター', '扇風機'],
  その他: ['自転車', '物干し竿', '植木鉢・観葉植物', 'ゴルフセット', 'スキー用品', '仏壇'],
  重量物: ['ピアノ類', '小型ピアノ・エレクトーン', '大型ピアノ', 'バイク', '車'],
}
function categoryOf(name) {
  for (const [cat, list] of Object.entries(KAZAI_CATEGORY)) if (list.includes(name)) return cat
  return 'その他'
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const box     = { background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }

const sectionBar = { background: 'linear-gradient(90deg,#EA580C,#FB923C)', color: '#fff', fontSize: 12, fontWeight: 800, padding: '6px 14px', letterSpacing: '.04em' }

function Field({ label, value, wide }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', fontSize: 13, borderBottom: '1px solid #F1F5F9', gridColumn: wide ? '1 / -1' : 'auto' }}>
      <div style={{ width: 96, flexShrink: 0, color: '#64748B', fontWeight: 600, background: '#F8FAFC', padding: '8px 10px' }}>{label}</div>
      <div style={{ color: '#1E293B', fontWeight: 600, padding: '8px 10px', wordBreak: 'break-all', flex: 1 }}>{value}</div>
    </div>
  )
}

export default function LeadDetailModal({ item, onClose, onStatusChange }) {
  if (!item) return null

  const fromText = item.detail
    ? [item.fromZip, item.fromAddress, item.fromType && `（${item.fromType}）`].filter(Boolean).join(' ') || item.from
    : item.from
  const toText = item.detail
    ? [item.toZip, item.toAddress, item.toType && `（${item.toType}）`].filter(Boolean).join(' ') || item.to
    : item.to

  // 家財をカテゴリ別にまとめる
  const grouped = {}
  ;(Array.isArray(item.kazai) ? item.kazai : []).forEach(k => {
    const c = categoryOf(k.name)
    ;(grouped[c] = grouped[c] || []).push(k)
  })
  const hasKazai = Object.keys(grouped).length > 0 || item.boxCount || item.kazaiUnknown > 0

  const statusSelect = onStatusChange ? (
    <select
      value={item.status || '未架電'}
      onChange={e => onStatusChange(item, e.target.value)}
      className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}
      style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}
    >
      {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  ) : <span className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}>{item.status || '未架電'}</span>

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        {/* ヘッダー */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{item.name || '（名前なし）'} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>様</span></div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
              {item.site || ''}{item.orderId ? ` ／ 依頼番号 ${item.orderId}` : ''}
            </div>
          </div>
          <button className="btn btn-sm btn-outline" onClick={onClose}>閉じる</button>
        </div>

        {/* 基本情報 */}
        <div style={sectionBar}>基本情報</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, borderBottom: '1px solid #EEF2F7' }}>
          <Field label="フリガナ" value={item.kana} />
          <Field label="電話" value={<a href={`tel:${item.phone}`} style={{ color: '#1E5FA8', fontWeight: 700, textDecoration: 'none' }}>{item.phone || '—'}</a>} />
          <Field label="メール" value={item.email && <a href={`mailto:${item.email}`} style={{ color: '#1E5FA8', fontWeight: 700, textDecoration: 'none' }}>{item.email}</a>} />
          <Field label="人数" value={item.count} />
          <Field label="受付日時" value={item.receivedAt} />
          <Field label="依頼日" value={item.requestedAt} />
          <Field label="引越し希望日" value={item.moveDateDetail || item.moveDate} wide />
        </div>

        {/* 住所 */}
        <div style={sectionBar}>住所</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Field label="引越し元" value={fromText} wide />
          <Field label="引越し先" value={toText} wide />
        </div>

        {/* 詳細内容（ズバット詳細がある時のみ） */}
        {item.detail && (item.option || item.request || item.telStatus || item.mailStatus) && (
          <>
            <div style={sectionBar}>詳細内容</div>
            <div style={{ borderBottom: '1px solid #EEF2F7' }}>
              <Field label="依頼作業" value={item.option} wide />
              <Field label="ご要望" value={item.request} wide />
              <Field label="対応状況" value={[item.telStatus, item.mailStatus].filter(Boolean).join(' / ')} wide />
            </div>
          </>
        )}

        {/* 家財 */}
        {hasKazai && (
          <>
            <div style={sectionBar}>家財{item.boxCount ? `（ダンボール ${item.boxCount}）` : ''}</div>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #EEF2F7' }}>
              {['家具', '家電', 'その他', '重量物'].map(cat => (
                grouped[cat] && grouped[cat].length > 0 && (
                  <div key={cat} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 48, flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#64748B', paddingTop: 3 }}>{cat}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {grouped[cat].map((k, i) => (
                        <span key={i} style={{ fontSize: 12, background: '#FFF7ED', color: '#C2410C', borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>{k.name}×{k.qty}</span>
                      ))}
                    </div>
                  </div>
                )
              ))}
              {item.kazaiUnknown > 0 && (
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>他{item.kazaiUnknown}品（詳細ページを開くと品名表示）</div>
              )}
              {Object.keys(grouped).length === 0 && item.kazaiCount > 0 && (
                <div style={{ fontSize: 12, color: '#64748B' }}>家財 {item.kazaiCount}種</div>
              )}
            </div>
          </>
        )}

        {/* 対応・メモ */}
        <div style={sectionBar}>対応・メモ</div>
        <div style={{ borderBottom: '1px solid #EEF2F7' }}>
          <Field label="ステータス" value={statusSelect} wide />
          <Field label="メモ" value={item.memo} wide />
        </div>

        {(item.detectedAt || item.savedAt) && (
          <div style={{ fontSize: 11, color: '#94A3B8', padding: '10px 14px' }}>
            取得日時: {new Date(item.detectedAt || item.savedAt).toLocaleString('ja-JP')}
          </div>
        )}
      </div>
    </div>
  )
}
