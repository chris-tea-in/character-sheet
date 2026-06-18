import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useCampaignStore } from '@/store/campaigns'
import { useSyncStore } from '@/store/sync'

// /join/:code — auto-join the campaign then redirect into it. Cloudflare Access
// gates the page, so by the time it renders the user is signed in; we still wait
// for the sync identity (`me`) to resolve before attempting the join.
export default function JoinCampaignPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const join = useCampaignStore(s => s.join)
  const me = useSyncStore(s => s.me)
  const syncStatus = useSyncStore(s => s.status)
  const [error, setError] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (!code) { navigate('/', { replace: true }); return }
    if (!me || attempted.current) return
    attempted.current = true
    join(code).then(res => {
      if (res) navigate(`/campaign/${res.id}`, { replace: true })
      else setError('That invite link didn’t match a campaign.')
    })
  }, [code, me, join, navigate])

  const offline = !me && (syncStatus === 'offline' || syncStatus === 'auth-expired')

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        {error ? (
          <>
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={() => navigate('/')}>Go to my characters</Button>
          </>
        ) : offline ? (
          <>
            <p className="text-muted-foreground">Can't reach the server to join right now.</p>
            <Button variant="outline" onClick={() => navigate('/')}>Go back</Button>
          </>
        ) : (
          <p className="text-muted-foreground">Joining campaign…</p>
        )}
      </div>
    </div>
  )
}
