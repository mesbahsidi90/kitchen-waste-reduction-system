import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { I18nProvider } from './i18n'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider><App /></I18nProvider>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  let wasControlled = Boolean(navigator.serviceWorker.controller)
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (wasControlled && !reloading) {
      reloading = true
      window.location.reload()
      return
    }
    wasControlled = true
  })

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((registration) => {
      const checkForUpdate = () => {
        if (navigator.onLine) void registration.update()
      }
      checkForUpdate()
      window.setInterval(checkForUpdate, 60 * 60 * 1000)
      window.addEventListener('online', checkForUpdate)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
    })
  })
}
