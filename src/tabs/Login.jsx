import { useState } from 'react'

export default function Login({ users, onLogin }) {
  const [id, setId]       = useState('')
  const [pw, setPw]       = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = () => {
    if (!id || !pw) { setError('IDとパスワードを入力してください'); return }
    setLoading(true)
    setTimeout(() => {
      const u = users[id]
      if (u && pw === id) { // パスワードはIDと同じ (a/a, b/b)
        onLogin(u)
      } else {
        setError('IDまたはパスワードが違います')
        setLoading(false)
      }
    }, 400)
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#0d1b35 0%,#1b2b4b 60%,#0f2040 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      {/* 背景グリッド */}
      <div style={{
        position: 'fixed', inset: 0, opacity: .04,
        backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,1) 1px,transparent 1px)',
        backgroundSize: '50px 50px', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
        {/* ロゴ */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚛</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '.02em' }}>トランスポート福岡</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginTop: 4 }}>業務効率化システム</div>
        </div>

        {/* カード */}
        <div style={{
          background: 'rgba(255,255,255,.07)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,.12)', borderRadius: 16,
          padding: '32px 28px',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 24 }}>ログイン</div>

          {/* ID */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginBottom: 6, letterSpacing: '.05em' }}>ユーザーID</div>
            <input
              value={id}
              onChange={e => { setId(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="IDを入力"
              style={{
                width: '100%', padding: '11px 14px',
                background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
                borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* PW */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.5)', marginBottom: 6, letterSpacing: '.05em' }}>パスワード</div>
            <input
              type="password"
              value={pw}
              onChange={e => { setPw(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="パスワードを入力"
              style={{
                width: '100%', padding: '11px 14px',
                background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.15)',
                borderRadius: 10, color: '#fff', fontSize: 14, outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* エラー */}
          {error && (
            <div style={{
              background: 'rgba(220,38,38,.15)', border: '1px solid rgba(220,38,38,.4)',
              borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fca5a5', marginBottom: 14,
            }}>{error}</div>
          )}

          {/* ボタン */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: loading ? '#374151' : '#1E5FA8',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit', transition: 'background .15s',
            }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,.25)' }}>
          デモ版 v1.0 — MIAMIホールディングス株式会社
        </div>
      </div>
    </div>
  )
}
