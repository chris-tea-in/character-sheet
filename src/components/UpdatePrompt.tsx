import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

// How often an open session re-checks for a newer deploy. The service worker only
// checks on a cold load on its own, so without this a long-lived tab (a sheet left
// open at the table) would never notice a deploy. registration.update() is a cheap
// revalidation of sw.js.
const UPDATE_CHECK_MS = 15 * 60 * 1000

/**
 * Modal update prompt. With registerType:'prompt' the new service worker parks until
 * the user acts, so nothing reloads mid-session. When a new deploy is detected we open
 * a modal (more assertive than a passive banner) so the user updates before continuing
 * on a stale build. It's still dismissible — "Not now" closes it for the session — but
 * a modal makes the choice deliberate. "Update now" activates the waiting worker and
 * reloads; WhatsNewModal then shows what changed.
 *
 * The useRegisterSW hook also performs the SW registration (injectRegister is false),
 * so this component must stay mounted — the hook keeps running while the modal is closed.
 */
export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  // needRefresh stays true once a worker is waiting, so we track dismissal locally to
  // let the user close the modal (and continue) without it immediately reopening.
  const [dismissed, setDismissed] = useState(false)

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

  return (
    <Dialog open={needRefresh && !dismissed} onOpenChange={o => { if (!o) setDismissed(true) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            A new version of the app is ready. Update now so you’re not working from an
            outdated version — your characters are saved and the app will reload.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDismissed(true)}>Not now</Button>
          <Button onClick={() => void updateServiceWorker(true)}>Update now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
