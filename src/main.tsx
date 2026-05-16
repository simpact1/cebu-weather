import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WeatherPage } from './App'
import './index.css'

const rootEl = document.getElementById('root')

if (!rootEl) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<div style="padding:16px;font-family:system-ui,sans-serif;background:#fef3c7;color:#422006">' +
      '<strong>#root 없음</strong></div>',
  )
} else if (window.location.protocol === 'file:') {
  rootEl.innerHTML =
    '<div style="padding:16px;font-family:system-ui,sans-serif;line-height:1.6">' +
    '<strong>file:// 로는 열 수 없습니다.</strong><br/>' +
    '터미널에서 <code>npm run dev</code> 후 ' +
    '<strong>http://127.0.0.1:8787/</strong> 로 접속하세요.</div>'
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <WeatherPage />
    </StrictMode>,
  )
}
