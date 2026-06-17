import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Check, RefreshCw, Trash2, UserMinus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { useCharacterStore } from '@/store/characters'
import { useCampaignStore } from '@/store/campaigns'
import { useSyncStore } from '@/store/sync'
import {
  campaignCharacters, campaignMembers, removeMember as apiRemoveMember,
} from '@/lib/syncApi'
import type { CampaignCharacter, CampaignMember } from '@/lib/syncApi'
import { slugToTitle } from '@/lib/characterSetup'
import type { Character } from '@/types/character'

function classLabel(c: Pick<Character, 'classes' | 'class' | 'level'>): string {
  if (c.classes?.length) return c.classes.map(x => `${slugToTitle(x.classSlug)} ${x.level}`).join(' / ')
  return c.class ? `${slugToTitle(c.class)} ${c.level}` : `Level ${c.level}`
}

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const campaigns = useCampaignStore(s => s.campaigns)
  const campaignsLoaded = useCampaignStore(s => s.loaded)
  const removeCampaign = useCampaignStore(s => s.remove)
  const rotateCampaignCode = useCampaignStore(s => s.rotateCode)
  const me = useSyncStore(s => s.me)

  const allCharacters = useCharacterStore(s => s.characters)
  const campaign = campaigns.find(c => c.id === id)
  const isDm = campaign?.role === 'dm'

  // The user's own characters already in this campaign — a pure local filter, so
  // it works offline and updates instantly when they add/move one.
  const myChars = useMemo(
    () => allCharacters.filter(c => c.campaignId === id),
    [allCharacters, id],
  )

  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // DM-only: every other player's characters, fetched from the cloud.
  const [otherChars, setOtherChars] = useState<CampaignCharacter[] | null>(null)
  useEffect(() => {
    if (!isDm || !id) return
    let cancelled = false
    campaignCharacters(id).then(res => {
      if (!cancelled && res.ok) setOtherChars(res.data)
    })
    return () => { cancelled = true }
  }, [isDm, id])

  const otherGroups = useMemo(() => {
    if (!otherChars || !me) return []
    const byOwner = new Map<string, CampaignCharacter[]>()
    for (const r of otherChars) {
      if (r.ownerEmail === me.email) continue // the DM's own come from the local store
      if (!byOwner.has(r.ownerEmail)) byOwner.set(r.ownerEmail, [])
      byOwner.get(r.ownerEmail)!.push(r)
    }
    return [...byOwner.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [otherChars, me])

  if (!campaign) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">
            {campaignsLoaded ? 'Campaign not found, or you’re no longer a member.' : 'Loading campaign…'}
          </p>
          <Button variant="outline" onClick={() => navigate('/')}>Go back</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-muted-foreground hover:text-foreground transition-colors flex-none">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{campaign.name}</h1>
            <p className="text-xs text-muted-foreground">{isDm ? 'You are the DM' : 'Player'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-8">
        {isDm && <DmControls campaignId={campaign.id} inviteCode={campaign.inviteCode}
          onRotate={() => rotateCampaignCode(campaign.id)}
          onDelete={() => setDeleteOpen(true)} />}

        {/* The current user's own characters in this campaign */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My Characters</h2>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Character
            </Button>
          </div>
          {myChars.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              None yet. Add an existing character, duplicate one, or create a new one for this campaign.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {myChars.map(c => (
                <CharRow key={c.id} name={c.name} sub={classLabel(c)} onClick={() => navigate(`/character/${c.id}`)} />
              ))}
            </div>
          )}
        </section>

        {/* DM-only: every other player's sheets */}
        {isDm && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Players</h2>
            {otherChars === null ? (
              <p className="text-sm text-muted-foreground">Loading players’ characters…</p>
            ) : otherGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other players have added a character yet.</p>
            ) : (
              otherGroups.map(([owner, rows]) => (
                <div key={owner} className="space-y-2">
                  <p className="text-xs text-muted-foreground">{owner}</p>
                  <div className="flex flex-col gap-2">
                    {rows.map(r => (
                      <CharRow
                        key={r.id}
                        name={r.data.name || 'Unnamed'}
                        sub={classLabel(r.data)}
                        onClick={() => navigate(`/campaign/${campaign.id}/character/${r.id}`)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        )}
      </main>

      <AddCharacterDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        campaignId={campaign.id}
      />

      <DeleteCampaignDialog
        open={deleteOpen}
        campaignName={campaign.name}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          const ok = await removeCampaign(campaign.id)
          setDeleteOpen(false)
          if (ok) navigate('/')
        }}
      />
    </div>
  )
}

function CharRow({ name, sub, onClick }: { name: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-border bg-card px-4 py-3 hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-surface-2)] transition-colors"
    >
      <p className="font-bold leading-tight truncate">{name}</p>
      <p className="text-sm text-muted-foreground truncate">{sub}</p>
    </button>
  )
}

// ── DM controls: invite code, rotate, members, delete ──────────────────────────

function DmControls({
  campaignId, inviteCode, onRotate, onDelete,
}: {
  campaignId: string
  inviteCode?: string
  onRotate: () => Promise<string | null>
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [members, setMembers] = useState<CampaignMember[] | null>(null)

  const link = inviteCode ? `${window.location.origin}/join/${inviteCode}` : ''

  function loadMembers() {
    void campaignMembers(campaignId).then(res => { if (res.ok) setMembers(res.data) })
  }
  useEffect(() => { loadMembers() }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the field is selectable as a fallback */ }
  }

  async function handleRotate() {
    setRotating(true)
    await onRotate()
    setRotating(false)
  }

  async function handleRemove(email: string) {
    await apiRemoveMember(campaignId, email)
    loadMembers()
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Invite</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate rounded bg-[var(--color-surface-2)] px-2 py-1.5 text-sm font-mono">
            {inviteCode ?? '—'}
          </code>
          <Button size="sm" variant="outline" onClick={copyLink} disabled={!inviteCode}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleRotate} disabled={rotating}>
            <RefreshCw className="h-4 w-4" />
            {rotating ? 'Rotating…' : 'Rotate'}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Share the code or the link. Rotating it invalidates the old one.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Members</p>
        {members === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {members.map(m => (
              <li key={m.email} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm truncate">
                  {m.email}
                  {m.role === 'dm' && <span className="ml-2 text-xs text-[var(--color-accent-gold)]">DM</span>}
                </span>
                {m.role !== 'dm' && (
                  <button
                    onClick={() => handleRemove(m.email)}
                    className="flex-none text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove member"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={onDelete} className="text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4" />
        Delete campaign
      </Button>
    </section>
  )
}

// ── Add character (move existing / duplicate / create new) ─────────────────────

function AddCharacterDialog({
  open, onClose, campaignId,
}: {
  open: boolean
  onClose: () => void
  campaignId: string
}) {
  const navigate = useNavigate()
  const allCharacters = useCharacterStore(s => s.characters)
  const update = useCharacterStore(s => s.update)
  const create = useCharacterStore(s => s.create)
  const [busy, setBusy] = useState(false)

  // Characters not already in this campaign are candidates to move/duplicate in.
  const candidates = allCharacters.filter(c => c.campaignId !== campaignId)

  async function move(c: Character) {
    setBusy(true)
    await update(c.id, { campaignId })
    setBusy(false)
    onClose()
  }

  async function duplicate(c: Character) {
    setBusy(true)
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = c
    const created = await create({ ...rest, name: `${c.name} (copy)`, campaignId })
    setBusy(false)
    onClose()
    navigate(`/character/${created.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md flex flex-col max-h-[85dvh] p-0 gap-0">
        <DialogHeader className="flex-none px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle>Add a Character</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          <Button
            className="w-full justify-start"
            variant="outline"
            onClick={() => { onClose(); navigate(`/create?campaign=${campaignId}`) }}
          >
            <Plus className="h-4 w-4" />
            Create a new character
          </Button>

          {candidates.length > 0 && (
            <p className="text-xs text-muted-foreground pt-3 pb-1">Or add one you already have:</p>
          )}
          {candidates.map(c => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.name || 'Unnamed'}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {classLabel(c)}{c.campaignId ? ' · in another campaign' : ''}
                </p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => move(c)}>Move</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => duplicate(c)}>Duplicate</Button>
            </div>
          ))}
        </div>

        <DialogFooter className="flex-none px-6 py-3 border-t border-border">
          <DialogClose asChild><Button variant="ghost">Close</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteCampaignDialog({
  open, campaignName, onClose, onConfirm,
}: {
  open: boolean
  campaignName: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{campaignName}”?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This removes the campaign and its members. Everyone keeps their characters — they
          simply stop being grouped under this campaign. This can’t be undone.
        </p>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button variant="destructive" onClick={onConfirm}>Delete campaign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
