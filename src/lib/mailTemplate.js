// お客様へのメールの既定文。サーバ（api/mail.js）と画面（リード詳細・設定）の
// 両方がここを読む。設定タブで書き換えた内容は Redis に入り、こちらより優先される。
//
// 差し込み：{name} お客様名／{site} 流入元／{moveDate} 引越し希望日
//           {from} 現住所／{to} 引越し先
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

// 定型文の {…} をリードの内容で埋める
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
