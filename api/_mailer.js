// =====================================================================
// 自社ドメインからお客様へメールを送る共通モジュール
// （api/ 配下だが _ 始まりのためURLにはならない）
//
// 送信方法は環境変数で決まる。どちらか一方を入れれば動く。
//   A) SMTP（取得したドメインのメールサーバーをそのまま使う）
//        SMTP_HOST   例 smtp.lolipop.jp / smtp.gmail.com
//        SMTP_PORT   例 587（STARTTLS）／465（SSL）
//        SMTP_USER   メールアドレス（またはログインID）
//        SMTP_PASS   パスワード（Google Workspaceは「アプリパスワード」）
//        SMTP_SECURE 465のときだけ true（未指定なら PORT=465 で自動 true）
//        SMTP_REQUIRE_TLS 既定 true。587でSTARTTLSを必須にする（暗号化できなければ送らない）
//   B) Resend（メール配信サービス）
//        RESEND_API_KEY
//
// どちらでも必要：
//        MAIL_FROM      例 "株式会社トランスポーター <info@transporter-hikkoshi.com>"
//        MAIL_REPLY_TO  返信先を別にしたいとき（任意）
//        MAIL_BCC       送った控えを自社に残したいとき（任意）
//
// 両方入っているときは SMTP を使う（自社ドメインのサーバーを優先）。
// =====================================================================

const SMTP = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT) === 465,
  // お客様の氏名・住所を流すので、暗号化できない相手には送らない（587はSTARTTLS必須）。
  // 暗号化に対応していない社内サーバー等でだけ SMTP_REQUIRE_TLS=false にする。
  requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false',
}
const RESEND_KEY = process.env.RESEND_API_KEY
const FROM     = process.env.MAIL_FROM || ''
const REPLY_TO = process.env.MAIL_REPLY_TO || ''
const BCC      = process.env.MAIL_BCC || ''

const smtpReady   = !!(SMTP.host && SMTP.user && SMTP.pass)
const resendReady = !!RESEND_KEY

// 画面に「使える／使えない」を出すための状態。鍵やパスワードは返さない。
export function mailerStatus() {
  const provider = smtpReady ? 'smtp' : resendReady ? 'resend' : ''
  const missing = []
  if (!provider) missing.push('SMTP_HOST/USER/PASS もしくは RESEND_API_KEY')
  if (!FROM) missing.push('MAIL_FROM')
  return {
    ready: !!provider && !!FROM,
    provider,
    from: FROM,
    replyTo: REPLY_TO,
    bcc: BCC,
    host: smtpReady ? SMTP.host : '',
    missing,
  }
}

// 「名前 <a@b.jp>」形式からアドレス部分だけ取り出す
function addrOf(v) {
  const m = /<([^>]+)>/.exec(String(v || ''))
  return (m ? m[1] : String(v || '')).trim()
}
export function validAddress(v) {
  const a = addrOf(v)
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(a)
}

async function sendViaSmtp({ to, subject, text }) {
  const { default: nodemailer } = await import('nodemailer')
  const tp = nodemailer.createTransport({
    host: SMTP.host, port: SMTP.port, secure: SMTP.secure,
    requireTLS: !SMTP.secure && SMTP.requireTLS,
    auth: { user: SMTP.user, pass: SMTP.pass },
  })
  const info = await tp.sendMail({
    from: FROM, to, subject, text,
    ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
    ...(BCC ? { bcc: BCC } : {}),
  })
  return { id: info.messageId || '' }
}

async function sendViaResend({ to, subject, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [to], subject, text,
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      ...(BCC ? { bcc: [BCC] } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || `Resend ${res.status}`)
  return { id: data?.id || '' }
}

// 1通送る。失敗は例外で返す（呼び出し側でメッセージを画面に出す）。
export async function sendMail({ to, subject, text }) {
  const st = mailerStatus()
  if (!st.ready) throw new Error('メールの送信設定がまだです（' + st.missing.join(' / ') + '）')
  if (!validAddress(to)) throw new Error('宛先のメールアドレスが正しくありません')
  if (!String(subject || '').trim()) throw new Error('件名が空です')
  if (!String(text || '').trim()) throw new Error('本文が空です')
  const sent = st.provider === 'smtp' ? await sendViaSmtp({ to, subject, text })
                                      : await sendViaResend({ to, subject, text })
  return { ...sent, provider: st.provider }
}
