// お客様へのメールの既定文。サーバ（api/mail.js）と画面（リード詳細・設定）の
// 両方がここを読む。設定タブで書き換えた内容は Redis に入り、こちらより優先される。
//
// 差し込み：{name} お客様名／{site} 流入元／{moveDate} 引越し希望日
//           {from} 現住所／{to} 引越し先
//           {amount} ご案内する料金（リードの内容からは決まらないので、
//                    送信画面で1件ずつ入力する。fillMailTemplate では触らない）
export const DEFAULT_MAIL_TEMPLATE = {
  subject: '【お引越しのお見積り】お電話いたしましたが繋がりませんでした',
  body: `{name} 様

お世話になっております。
株式会社トランスポーターと申します。

先ほどお引越しのお見積りの件でお電話いたしましたが、
ご不在のようでしたのでメールにて失礼いたします。

ご希望のお引越し日：{moveDate}
現在のお住まい　　：{from}
お引越し先　　　　：{to}

お見積りは無料です。お荷物の量とお日にちが分かれば、
その場で概算をお伝えできます。

ご都合のよいお時間に、下記までご連絡いただけますと幸いです。
このメールへのご返信でも承ります。

何卒よろしくお願いいたします。`,
}

// 定型文に {amount}（料金）が入っているか。入っていれば送信画面で金額の入力を求める。
export function hasAmountTag(...texts) {
  return texts.some(t => /\{amount\}/.test(String(t || '')))
}

// 金額を「45,000円」の形にする。数字が無ければ空文字。
export function formatAmount(v) {
  const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, ''))
  if (!isFinite(n) || n <= 0) return ''
  return Math.round(n).toLocaleString('ja-JP') + '円'
}

// {amount} を入力された料金で置き換える。送信の直前だけ使う。
export function fillAmount(text, v) {
  const a = formatAmount(v)
  return String(text || '').replace(/\{amount\}/g, a)
}

// 定型文の {…} をリードの内容で埋める（{amount} はここでは残す）
export function fillMailTemplate(tpl, lead = {}) {
  const v = {
    name: lead.name || 'お客',
    site: lead.site || '',
    moveDate: lead.moveDateDetail || lead.moveDate || '未定',
    from: lead.fromAddress || lead.from || '',
    to: lead.toAddress || lead.to || '',
  }
  return String(tpl || '').replace(/\{(name|site|moveDate|from|to)\}/g, (_, k) => v[k])
}
