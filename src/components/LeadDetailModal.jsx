// リード詳細モーダル（リード一覧／架電ログで共用）
// onStatusChange を渡すとステータスを編集可、渡さなければバッジ表示のみ。
const STATUS_LIST  = ['未架電', '架電済', '留守', '成約', '見送り']
const STATUS_BADGE = { '未架電': 'bo', '架電済': 'bb', '留守': 'by', '成約': 'bg', '見送り': 'bk' }

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const box     = { background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
      <div style={{ width: 92, flexShrink: 0, color: '#64748B', fontWeight: 600 }}>{label}</div>
      <div style={{ color: '#1E293B', fontWeight: 600, wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

export default function LeadDetailModal({ item, onClose, onStatusChange }) {
  if (!item) return null
  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={box}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EEF2F7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{item.name || '（名前なし）'}</div>
          <button className="btn btn-sm btn-outline" onClick={onClose}>閉じる</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 10 }}>
          <DetailRow label="電話" value={<a href={`tel:${item.phone}`} style={{ color: '#1E5FA8', fontWeight: 700, textDecoration: 'none' }}>{item.phone || '—'}</a>} />
          <DetailRow label="サイト" value={item.site || '—'} />
          <DetailRow label="受付日時" value={item.receivedAt || '—'} />
          <DetailRow label="引越し希望日" value={item.moveDate || '—'} />
          <DetailRow label="引越し元" value={item.from || '—'} />
          <DetailRow label="引越し先" value={item.to || '—'} />
          <DetailRow label="人数" value={item.count || '—'} />
          {item.email && <DetailRow label="メール" value={<a href={`mailto:${item.email}`} style={{ color: '#1E5FA8', fontWeight: 700, textDecoration: 'none' }}>{item.email}</a>} />}
          {item.memo && <DetailRow label="メモ" value={item.memo} />}

          {item.detail && (
            <>
              <div style={{ borderTop: '1px solid #EEF2F7', margin: '4px 0', paddingTop: 10, fontSize: 12, fontWeight: 700, color: '#1E5FA8' }}>ズバット詳細</div>
              {item.kana && <DetailRow label="フリガナ" value={item.kana} />}
              {(item.fromZip || item.fromAddress || item.fromType) &&
                <DetailRow label="引越し元(詳細)" value={[item.fromZip, item.fromAddress, item.fromType && `（${item.fromType}）`].filter(Boolean).join(' ')} />}
              {(item.toZip || item.toAddress || item.toType) &&
                <DetailRow label="引越し先(詳細)" value={[item.toZip, item.toAddress, item.toType && `（${item.toType}）`].filter(Boolean).join(' ')} />}
              {item.moveDateDetail && <DetailRow label="希望日(詳細)" value={item.moveDateDetail} />}
              {item.orderId && <DetailRow label="依頼者番号" value={item.orderId} />}
              {item.requestedAt && <DetailRow label="依頼日" value={item.requestedAt} />}
              {item.request && <DetailRow label="ご要望" value={item.request} />}
              {item.option && <DetailRow label="オプション" value={item.option} />}
              {(item.telStatus || item.mailStatus) &&
                <DetailRow label="ズバット状況" value={[item.telStatus, item.mailStatus].filter(Boolean).join(' / ')} />}
              {Array.isArray(item.kazai) && item.kazai.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, color: '#64748B', fontWeight: 600, margin: '4px 0' }}>
                    家財{item.boxCount ? `（ダンボール ${item.boxCount}）` : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {item.kazai.map((k, i) => (
                      <span key={i} style={{ fontSize: 12, background: '#F1F5FB', borderRadius: 6, padding: '3px 8px' }}>{k.name}×{k.qty}</span>
                    ))}
                  </div>
                </div>
              )}
              {(!item.kazai || item.kazai.length === 0) && item.boxCount && <DetailRow label="ダンボール" value={item.boxCount} />}
            </>
          )}

          <DetailRow label="ステータス" value={
            onStatusChange ? (
              <select
                value={item.status || '未架電'}
                onChange={e => onStatusChange(item, e.target.value)}
                className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}
                style={{ border: 'none', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 700 }}
              >
                {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : <span className={`badge ${STATUS_BADGE[item.status] || 'bk'}`}>{item.status || '未架電'}</span>
          } />
          {(item.detectedAt || item.savedAt) && (
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
              取得日時: {new Date(item.detectedAt || item.savedAt).toLocaleString('ja-JP')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
