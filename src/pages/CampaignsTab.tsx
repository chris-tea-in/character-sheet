import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LogIn, Shield, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useCampaignStore } from '@/store/campaigns'
import { useSyncStore } from '@/store/sync'
import type { Campaign } from '@/lib/syncApi'

export function CampaignsTab() {
  const navigate = useNavigate()
  const campaigns = useCampaignStore(s => s.campaigns)
  const loaded = useCampaignStore(s => s.loaded)
  const load = useCampaignStore(s => s.load)
  const me = useSyncStore(s => s.me)
  const syncStatus = useSyncStore(s => s.status)

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  // Refresh on first view in case membership changed on another device.
  useEffect(() => { if (me) void load() }, [me, load])

  // Campaigns are cloud-only. Without a synced identity there's nothing to show.
  if (!me) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {syncStatus === 'syncing'
          ? 'Connecting…'
          : 'Campaigns need cloud sync. Sign in (the app is gated by Cloudflare Access) to create or join one.'}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New Campaign
        </Button>
        <Button variant="outline" size="sm" onClick={() => setJoinOpen(true)}>
          <LogIn className="h-4 w-4" />
          Join with Code
        </Button>
      </div>

      {!loaded ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading campaigns…</p>
      ) : campaigns.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          You're not in any campaigns yet. Create one as a DM, or join a friend's with their code.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map(c => (
            <CampaignCard key={c.id} campaign={c} onClick={() => navigate(`/campaign/${c.id}`)} />
          ))}
        </div>
      )}

      <CreateCampaignDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinCampaignDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </div>
  )
}

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const isDm = campaign.role === 'dm'
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border border-border bg-card px-4 py-3',
        'hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-surface-2)]',
        'transition-colors duration-150 cursor-pointer',
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex items-center gap-2">
          {isDm ? <Shield className="h-4 w-4 flex-none text-[var(--color-accent-gold)]" /> : <Users className="h-4 w-4 flex-none text-muted-foreground" />}
          <p className="text-base font-bold leading-tight truncate">{campaign.name}</p>
        </div>
        <span
          className="flex-none text-xs font-semibold px-2 py-0.5 rounded-full border"
          style={{
            background: 'var(--color-surface-2)',
            color: isDm ? 'var(--color-accent-gold)' : 'var(--color-text-muted)',
            borderColor: 'var(--color-border-raw)',
          }}
        >
          {isDm ? 'DM' : 'Player'}
        </span>
      </div>
    </button>
  )
}

function CreateCampaignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const create = useCampaignStore(s => s.create)
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function reset() { setName(''); setError(''); setSubmitting(false) }

  async function handleSubmit() {
    if (!name.trim()) { setError('Name is required'); return }
    setSubmitting(true)
    const created = await create(name.trim())
    setSubmitting(false)
    if (!created) { setError('Could not create campaign — check your connection and try again.'); return }
    reset()
    onClose()
    navigate(`/campaign/${created.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          You'll be the DM. Share the invite code (shown next) so players can join.
        </p>
        <input
          autoFocus
          type="text"
          placeholder="Campaign name"
          value={name}
          onChange={e => { setName(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost" disabled={submitting}>Cancel</Button></DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Creating…' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function JoinCampaignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const join = useCampaignStore(s => s.join)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function reset() { setCode(''); setError(''); setSubmitting(false) }

  async function handleSubmit() {
    if (!code.trim()) { setError('Enter an invite code'); return }
    setSubmitting(true)
    const joined = await join(code.trim())
    setSubmitting(false)
    if (!joined) { setError('That code didn’t match a campaign.'); return }
    reset()
    onClose()
    navigate(`/campaign/${joined.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Join a Campaign</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Enter the invite code your DM shared with you.</p>
        <input
          autoFocus
          type="text"
          placeholder="Invite code"
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setError('') }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm tracking-widest uppercase placeholder:text-muted-foreground placeholder:tracking-normal placeholder:normal-case focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost" disabled={submitting}>Cancel</Button></DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Joining…' : 'Join'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
