import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// PWA（ホーム画面に追加）用にService Workerを登録（プッシュ通知の登録とは独立に常時）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
