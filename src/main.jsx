import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initDesktopStore, isDesktop } from './lib/desktop'
import { installBrowserKeyStorage } from './lib/browserKeys'
import { beginAppSession } from './lib/config'
import { installGlobalErrorLogging, logError, reactRootErrorOptions } from './lib/errorLog'

installGlobalErrorLogging()
const coldStart = beginAppSession()

const isAndroid = window.Capacitor?.getPlatform?.() === 'android'

// The Android app has no server, so it answers /api/* in the page
// (lib/android.js); loaded only there, before anything can call /api.
const startAndroidApi = () => (isAndroid
  ? import('./lib/android.js').then((m) => m.installAndroidApi())
  : Promise.resolve())

// The browser version keeps saved keys in this browser, not on the server
// (lib/browserKeys.js). The desktop and Android apps keep their own.
if (!isDesktop && !isAndroid) installBrowserKeyStorage()

// The desktop app loads saved projects from disk before the first render, so
// the synchronous storage helpers see them.
Promise.all([initDesktopStore(), startAndroidApi()]).then(() => {
  createRoot(document.getElementById('root'), reactRootErrorOptions).render(
    <StrictMode>
      <App coldStart={coldStart} />
    </StrictMode>,
  )
}).catch((err) => logError('Could not load saved projects; the app did not start', err))
