import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// How often an open session re-checks for a newer deploy. The service worker only
// checks on a cold load on its own, so without this a long-lived tab (a sheet left
// open at the table) would never notice a deploy. registration.update() is a cheap
// revalidation of sw.js.
const UPDATE_CHECK_MS = 15 * 60 * 1000

/**
 * "A new version is available — Refresh" banner. With registerType:'prompt' the new
 * service worker parks until the user acts, so nothing reloads mid-session; clicking
 * Refresh activates it and reloads. After the reload, WhatsNewModal shows what changed.
 *
 * The useRegisterSW hook also performs the SW registration (injectRegister is false),
 * so this component must always be mounted — it returns null when no update is waiting,
 * but the hook still runs.
 */
export function UpdateBanner() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration
    },
  })

  // Surface new deploys promptly on an open session: on a timer, and whenever the tab
  // regains focus (returning to a sheet you left open should pick up a recent deploy).
  useEffect(() => {
    const check = () => { void registrationRef.current?.update() }
    const interval = setInterval(check, UPDATE_CHECK_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!needRefresh) return null

  return (
    <div style={{ background: '#c4a35a', color: '#1a1a2e', padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>✨ A new version is available.</span>
      <button
        onClick={() => void updateServiceWorker(true)}
        style={{ background: '#1a1a2e', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold', marginLeft: '1rem', padding: '0.25rem 0.75rem', borderRadius: '4px' }}
      >
        Refresh
      </button>
    </div>
  )
}
