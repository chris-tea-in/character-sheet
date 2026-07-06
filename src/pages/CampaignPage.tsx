import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Copy, Check, NotebookPen, RefreshCw, Trash2, UserMinus, Plus, X, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { useCharacterStore } from '@/store/characters'
import { useCampaignStore } from '@/store/campaigns'
import {
  campaignRoster, campaignMembers, removeMember as apiRemoveMember,
  removeCampaignCharacter,
  campaignItems, createCampaignItem, deleteCampaignItem,
} from '@/lib/syncApi'
import type { CampaignMember, RosterMember, CampaignItem } from '@/lib/syncApi'
import { CustomItemDialog } from '@/components/sheet/CustomItemDialog'
import { CampaignCompanionsSection } from '@/components/campaign/CampaignCompanionsSection'
import { cn } from '@/lib/utils'
import { slugToTitle } from '@/lib/characterSetup'
import { loadSetupData } from '@/lib/data'
import type { Character } from '@/types/character'
import type { WeaponItem, ArmorItem, WondrousItem } from '@/types/data'

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

  const allCharacters = useCharacterStore(s => s.characters)
  const updateCharacter = useCharacterStore(s => s.update)
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
  // The character pending a "remove from campaign" confirmation. `scope` decides
  // the path: 'mine' is a local owner write, 'other' is the DM-only cloud call.
  const [removing, setRemoving] = useState<{ id: string; name: string; scope: 'mine' | 'other' } | null>(null)
  // The character whose class disguise the player is editing.
  const [disguising, setDisguising] = useState<Character | null>(null)

  // Party section tab: the roster and the campaign's companions are siblings
  // (companions — including the DM's unassigned pool — live in their own tab).
  const [partyTab, setPartyTab] = useState<'players' | 'companions'>('players')

  // Class options for the disguise decoy picker (slugs from the compiled data).
  const [classOptions, setClassOptions] = useState<{ slug: string; title: string }[]>([])
  useEffect(() => {
    loadSetupData()
      .then(d => setClassOptions(Object.keys(d.classes).sort().map(slug => ({ slug, title: slugToTitle(slug) }))))
      .catch(() => {})
  }, [])

  // The party roster (other players + their characters), visible to every member.
  // Class labels arrive already disguise-resolved server-side. Bumping reloadKey
  // re-runs the fetch (e.g. after the DM removes a character).
  const [roster, setRoster] = useState<RosterMember[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    if (!id) return
    let cancelled = false
    campaignRoster(id).then(res => {
      if (!cancelled && res.ok) setRoster(res.data)
    })
    return () => { cancelled = true }
  }, [id, reloadKey])

  async function confirmRemove() {
    if (!removing || !campaign) return
    if (removing.scope === 'mine') {
      // Owner write — clears campaignId locally and syncs it up (the My Characters
      // filter drops it immediately).
      await updateCharacter(removing.id, { campaignId: null })
    } else {
      // DM removing a player's character — server clears membership; re-fetch to
      // reflect it in the Players list.
      await removeCampaignCharacter(campaign.id, removing.id)
      setReloadKey(k => k + 1)
    }
    setRemoving(null)
  }

  async function saveDisguise(changes: { disguiseClass: boolean; disguiseAs: string }) {
    if (!disguising) return
    // Owner write — syncs up so other players' next roster fetch sees the decoy.
    await updateCharacter(disguising.id, changes)
    setDisguising(null)
  }

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

        {isDm && <CampaignItemsSection campaignId={campaign.id} />}

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
                <CharRow
                  key={c.id}
                  name={c.name}
                  sub={classLabel(c)}
                  onClick={() => navigate(`/character/${c.id}`)}
                  onDisguise={() => setDisguising(c)}
                  disguised={c.disguiseClass}
                  onRemove={() => setRemoving({ id: c.id, name: c.name || 'Unnamed', scope: 'mine' })}
                />
              ))}
            </div>
          )}
        </section>

        {/* The shared notebook (general notes + location tabs) lives on its own
            page — every member. */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate(`/campaign/${campaign.id}/notes`)}
        >
          <NotebookPen className="h-4 w-4" />
          View Campaign Notes
        </Button>

        {/* The party section — Players and Companions are sibling tabs. Panels
            render conditionally (no data-state attribute), deliberately outside
            the tabpanel show/hide CSS: the @media print force-show rule must not
            print cloud companion content, and an unmounted Companions panel
            spends no D1 reads until it's opened (read-on-demand). The roster
            fetch lives at page level, so switching tabs loses nothing. */}
        <section className="space-y-4">
          <div role="tablist" aria-label="Party" className="flex items-center gap-1">
            {(['players', 'companions'] as const).map(k => (
              <button
                key={k}
                role="tab"
                id={`party-tab-${k}`}
                aria-selected={partyTab === k}
                aria-controls={`party-panel-${k}`}
                onClick={() => setPartyTab(k)}
                className={cn(
                  'px-3 py-1 text-xs rounded-md font-semibold uppercase tracking-wide transition-colors whitespace-nowrap',
                  partyTab === k ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {k === 'players' ? 'Players' : 'Companions'}
              </button>
            ))}
          </div>

          {partyTab === 'players' && (
            <div role="tabpanel" id="party-panel-players" aria-labelledby="party-tab-players" className="space-y-4">
              {/* The other players in the party. The DM can open and remove their
                  characters; a player only sees the list (names + classes, with any
                  disguise applied server-side). */}
              {roster === null ? (
                <p className="text-sm text-muted-foreground">Loading players…</p>
              ) : roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other players have joined yet.</p>
              ) : (
                roster.map(member => (
                  <div key={member.email} className="space-y-2">
                    <p className="text-xs text-muted-foreground">{member.username ?? member.email}</p>
                    {member.characters.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">No character yet.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {member.characters.map(ch => (
                          <CharRow
                            key={ch.id}
                            name={ch.name}
                            sub={ch.classLabel}
                            onClick={isDm ? () => navigate(`/campaign/${campaign.id}/character/${ch.id}`) : undefined}
                            onRemove={isDm ? () => setRemoving({ id: ch.id, name: ch.name, scope: 'other' }) : undefined}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {partyTab === 'companions' && (
            <div role="tabpanel" id="party-panel-companions" aria-labelledby="party-tab-companions">
              <CampaignCompanionsSection campaignId={campaign.id} isDm={isDm} />
            </div>
          )}
        </section>
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

      <RemoveCharacterDialog
        pending={removing}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />

      <DisguiseDialog
        character={disguising}
        classOptions={classOptions}
        onClose={() => setDisguising(null)}
        onSave={saveDisguise}
      />
    </div>
  )
}

function CharRow({
  name, sub, onClick, onRemove, onDisguise, disguised,
}: {
  name: string
  sub: string
  onClick?: () => void          // omit → the row is a static, non-navigable card
  onRemove?: () => void
  onDisguise?: () => void       // present → show the class-disguise toggle (My Characters)
  disguised?: boolean
}) {
  const body = (
    <>
      <p className="font-bold leading-tight truncate">{name}</p>
      <p className="text-sm text-muted-foreground truncate">{sub}</p>
    </>
  )
  return (
    <div className="flex items-stretch gap-2">
      {onClick ? (
        <button
          onClick={onClick}
          className="flex-1 min-w-0 text-left rounded-lg border border-border bg-card px-4 py-3 hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-surface-2)] transition-colors"
        >
          {body}
        </button>
      ) : (
        <div className="flex-1 min-w-0 rounded-lg border border-border bg-card px-4 py-3">
          {body}
        </div>
      )}
      {onDisguise && (
        <button
          onClick={onDisguise}
          className={`flex-none rounded-lg border border-border bg-card px-3 transition-colors hover:border-[var(--color-accent-gold)] ${disguised ? 'text-[var(--color-accent-gold)]' : 'text-muted-foreground hover:text-foreground'}`}
          title={disguised ? 'Class is disguised from other players' : 'Disguise class from other players'}
          aria-label={`Disguise ${name}'s class`}
        >
          {disguised ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="flex-none rounded-lg border border-border bg-card px-3 text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
          title="Remove from campaign"
          aria-label={`Remove ${name} from campaign`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// ── Class disguise (player-owned): choose a decoy class other players see ───────

function DisguiseDialog({
  character, classOptions, onClose, onSave,
}: {
  character: Character | null
  classOptions: { slug: string; title: string }[]
  onClose: () => void
  onSave: (changes: { disguiseClass: boolean; disguiseAs: string }) => void
}) {
  const [enabled, setEnabled] = useState(false)
  const [decoy, setDecoy] = useState('')

  // Seed the form from the character each time the dialog opens.
  useEffect(() => {
    if (character) {
      setEnabled(character.disguiseClass)
      setDecoy(character.disguiseAs)
    }
  }, [character])

  return (
    <Dialog open={!!character} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Disguise class — {character?.name || 'Character'}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Choose what the other players see in the party roster. The DM always sees your real class.
        </p>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent-gold)]"
          />
          Hide my real class from other players
        </label>

        {enabled && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Show them instead</label>
            <select
              value={decoy}
              onChange={e => setDecoy(e.target.value)}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Nothing — just my level</option>
              {classOptions.map(o => (
                <option key={o.slug} value={o.slug}>{o.title}</option>
              ))}
            </select>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button onClick={() => onSave({ disguiseClass: enabled, disguiseAs: enabled ? decoy : '' })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
                  {m.username ?? m.email}
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

// ── DM-created shared items (#12): create with the same dialog the sheet uses ───

function CampaignItemsSection({ campaignId }: { campaignId: string }) {
  const [items, setItems] = useState<CampaignItem[] | null>(null)
  const [dialogKind, setDialogKind] = useState<'weapon' | 'armor' | 'item' | null>(null)

  function load() {
    void campaignItems(campaignId).then(res => { if (res.ok) setItems(res.data) })
  }
  useEffect(() => { load() }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate(def: WeaponItem | ArmorItem | WondrousItem) {
    await createCampaignItem(campaignId, def.category as CampaignItem['category'], def)
    setDialogKind(null)
    load()
  }

  async function handleDelete(itemId: string) {
    await deleteCampaignItem(campaignId, itemId)
    load()
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shared Items</p>
        <div className="flex gap-1">
          {(['weapon', 'armor', 'item'] as const).map(k => (
            <Button key={k} size="sm" variant="outline" onClick={() => setDialogKind(k)} className="capitalize">
              <Plus className="h-4 w-4" />{k}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Homebrew items you add here become selectable by every player in this campaign.
      </p>
      {items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shared items yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map(it => (
            <li key={it.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm truncate">
                {it.data.name}
                <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {it.category.replace('_', ' ')}
                </span>
              </span>
              <button
                onClick={() => handleDelete(it.id)}
                className="flex-none text-muted-foreground hover:text-destructive transition-colors"
                title="Remove item"
                aria-label={`Remove ${it.data.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <CustomItemDialog
        open={dialogKind !== null}
        kind={dialogKind ?? 'weapon'}
        onClose={() => setDialogKind(null)}
        onCreate={handleCreate}
      />
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

function RemoveCharacterDialog({
  pending, onClose, onConfirm,
}: {
  pending: { name: string; scope: 'mine' | 'other' } | null
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={!!pending} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove “{pending?.name}” from the campaign?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {pending?.scope === 'mine'
            ? 'This takes your character out of this campaign. You keep it in your own Characters list and can add it back any time.'
            : 'This takes the player’s character out of this campaign. They keep it in their own Characters list — it just stops being grouped here.'}
        </p>
        <DialogFooter>
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button variant="destructive" onClick={onConfirm}>Remove</Button>
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
