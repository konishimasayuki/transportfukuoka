import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// ===== モーダルを画面の最前面に出すための入れ物 =====
//
// これまで各モーダルは画面の中身（.content）の中に置かれていた。
// .content には -webkit-overflow-scrolling: touch が付いているため、
// iOS Safari では中の position:fixed が .content の枠に閉じ込められる。
// その結果、モーダルが上のヘッダーに被らず、指で払うと背後の一覧が動いていた。
//
// ここで body の直下に出し直すことで、
//   ・必ずヘッダーより前面に出る
//   ・触っても背後（.content）には届かない
// body には modal-open を付け、開いている間は背後のスクロールを止める（CSS側）。
// 入れ子で開くこと（詳細→メール等）があるので、枚数を数えて最後の1枚で外す。

let openCount = 0

export default function ModalPortal({ children }) {
  useEffect(() => {
    const content = document.querySelector('.content')
    const keep = content ? content.scrollTop : 0
    openCount += 1
    document.body.classList.add('modal-open')
    return () => {
      openCount = Math.max(0, openCount - 1)
      if (openCount === 0) {
        document.body.classList.remove('modal-open')
        // overflow を戻したときに一覧が先頭へ飛ばないよう、位置を書き戻す
        if (content) content.scrollTop = keep
      }
    }
  }, [])
  return createPortal(children, document.body)
}
