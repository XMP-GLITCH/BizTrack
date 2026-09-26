import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './analytics/ErrorBoundary.jsx'
import { readSnapshot } from './store/useStore'
import { emergencyExport } from './utils/transfer'

/**
 * Last-resort export, available even when React has crashed. The work is in
 * `utils/transfer` so the crash screen inside App.jsx runs the same code: it
 * used to offer the same button wired to a different, much narrower function.
 */
function exportOrExplain() {
  if (emergencyExport(readSnapshot)) return
  // The one native alert left in the app, and it stays on purpose. Every
  // other one became a toast or a dialog, both of which are React. This
  // fires when React has already crashed, so the app's own machinery is
  // exactly what cannot be trusted to render the message.
  alert('Could not build the file. Your data is still in this browser. Do not clear its storage.')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary onExport={exportOrExplain}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
