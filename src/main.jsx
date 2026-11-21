import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ExternalLinkGuard from './components/ExternalLinkGuard.jsx'
import { initProjectStore, isDesktop } from './lib/desktop'
import { installBrowserKeyStorage } from './lib/browserKeys'
import { beginAppSession } from './lib/config'
import { takePromptForSignIn } from './lib/signInHandoff'
import { unlockUiSound } from './lib/uiSound'
import { installGlobalErrorLogging, logError, reactRootErrorOptions } from './lib/errorLog'

installGlobalErrorLogging()
const signInHandoff = takePromptForSignIn()
const coldStart = beginAppSession({ returningFromSignIn: Boolean(signInHandoff) })

const isAndroid = window.Capacitor?.getPlatform?.() === 'android'
const isAdminUsageRoute = !isDesktop && !isAndroid && /^\/admin\/usage\/?$/.test(window.location.pathname)

// The Android app has no server, so it answers /api/* in the page
// (lib/android.js); loaded only there, before anything can call /api.
const startAndroidApi = () => (isAndroid
  ? import('./lib/android.js').then((m) => m.installAndroidApi())
  : Promise.resolve())

// The browser version keeps saved keys in this browser, not on the server
// (lib/browserKeys.js). The desktop and Android apps keep their own.
if (!isDesktop && !isAndroid) installBrowserKeyStorage()

if (isAdminUsageRoute) {
  import('./components/AdminUsageDashboard.jsx').then(({ default: AdminUsageDashboard }) => {
    createRoot(document.getElementById('root'), reactRootErrorOptions).render(
      <StrictMode>
        <AdminUsageDashboard />
        <ExternalLinkGuard />
      </StrictMode>,
    )
  }).catch((err) => logError('Could not load the admin usage dashboard', err))
} else {
  // Saved projects are loaded (from disk in the desktop app, IndexedDB in the
  // browser) before the first render, so the synchronous storage helpers see them.
  Promise.all([initProjectStore(), startAndroidApi()]).then(() => {
    unlockUiSound()
    createRoot(document.getElementById('root'), reactRootErrorOptions).render(
      <StrictMode>
        <App coldStart={coldStart} signInHandoff={signInHandoff} />
        <ExternalLinkGuard />
      </StrictMode>,
    )
  }).catch((err) => logError('Could not load saved projects; the app did not start', err))
}
