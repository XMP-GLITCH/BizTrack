import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './analytics/ErrorBoundary.jsx'
import { readSnapshot } from './store/useStore'

/**
 * Last-resort export, available even when React has crashed.
 *
 * Reads storage directly rather than going through the store, because the
 * boundary may be catching a fault in exactly that layer. A user staring at a
 * crash screen must still be able to walk away with their books.
 */
function emergencyExport() {
  try {
    const payload = {
      exportedAt: new Date().toISOString(),
      reason: 'crash-recovery',
      live: JSON.parse(localStorage.getItem('biztrack-storage-v3') || 'null'),
      preUpgrade: readSnapshot(),
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `BizTrack_Recovery_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    alert('Could not build the file. Your data is still in this browser — do not clear its storage.')
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary onExport={emergencyExport}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
