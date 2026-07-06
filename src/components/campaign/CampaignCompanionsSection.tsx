import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CompanionStatBlock } from './CompanionStatBlock'
import { CompanionEditor } from './CompanionEditor'
import { useSyncStore } from '@/store/sync'
import { useCharacterStore } from '@/store/characters'
import {
  campaignCompanions, createCampaignCompanion, updateCampaignCompanion, deleteCampaignCompanion,
  campaignRoster,
} from '@/lib/syncApi'
import type { CampaignCompanion, RosterMember } from '@/lib/syncApi'
import type { CompanionData } from '../../../shared/companionValidation'

// The campaign page's Companions tab (sibling of Players). Role-aware content:
// the DM manages the whole herd here — the unassigned pool lives in this tab, and
// companions are assignable both at creation and later via the per-card picker; a
// player sees the rows the server grants them (their own characters' + everything
// they authored). Stat blocks are display-only on this page (the dice tray and
// roll modal mount on the character sheet, where rolling lives).

const POOL = '__pool__' // select sentinel — a <select> option value can't be null

interface CampaignCompanionsSectionProps {
  campaignId: string
  isDm: boolean
}

export function CampaignCompanionsSection({ campaignId, isDm }: CampaignCompanionsSectionProps) {
  const me = useSyncStore(s => s.me)
  const myLocalCharacters = useCharacterStore(s => s.characters)

  const [companions, setCompanions] = useState<CampaignCompanion[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [roster, setRoster] = useState<RosterMember[] | null>(null)
  const [editor, setEditor] = useState<null | { mode: 'create' } | { mode: 'edit'; companion: CampaignCompanion }>(null)
  const [createAssignee, setCreateAssignee] = useState<string>(isDm ? POOL : '')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<CampaignCompanion | null>(null)

  function load() {
    void campaignCompanions(campaignId).then(res => {
      if (res.ok) {
        setCompanions(res.data)
        setLoadError(false)
      } else {
        setLoadError(true)
      }
    })
    void campaignRoster(campaignId).then(res => {
      if (res.ok) setRoster(res.data)
    })
  }
  useEffect(() => { load() }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  const myEmail = me?.email?.toLowerCase()
  const ownChars = useMemo(
    () => myLocalCharacters.filter(c => c.campaignId === campaignId),
    [myLocalCharacters, campaignId],
  )

  // Every campaign character the viewer can name: their own (local, instant) plus
  // the roster (other players'; names arrive disguise-resolved server-side).
  const charOptions = useMemo(() => {
    const opts = ownChars.map(c => ({ id: c.id, name: c.name || 'Unnamed', owner: 'you' }))
    for (const m of roster ?? []) {
      const owner = m.username ?? m.email
      for (const ch of m.characters) {
        if (!opts.some(o => o.id === ch.id)) opts.push({ id: ch.id, name: ch.name, owner })
      }
    }
    return opts
  }, [ownChars, roster])
  const charName = (id: string) => charOptions.find(o => o.id === id)?.name ?? 'a former member’s character'
  const charOwner = (id: string) => charOptions.find(o => o.id === id)?.owner

  const list = companions ?? []
  const pool = list.filter(c => c.assignedCharacterId === null)
  const assignedIds = [...new Set(
    list.filter(c => c.assignedCharacterId !== null).map(c => c.assignedCharacterId as string),
  )]

  async function handleCreate(data: CompanionData) {
    const target = isDm
      ? (createAssignee === POOL ? null : createAssignee)
      : (createAssignee || ownChars[0]?.id)
    if (!isDm && !target) {
      setSaveError('Add one of your characters to this campaign first.')
      return
    }
    setSaving(true)
    const res = await createCampaignCompanion(campaignId, target ?? null, data)
    setSaving(false)
    if (res.ok) {
      setEditor(null)
      setSaveError(null)
      load()
    } else {
      setSaveError('Couldn’t save — check your connection or session and try again.')
    }
  }

  async function handleEdit(companion: CampaignCompanion, data: CompanionData) {
    setSaving(true)
    const res = await updateCampaignCompanion(campaignId, companion.id, { data })
    setSaving(false)
    if (res.ok) {
      setEditor(null)
      setSaveError(null)
      load()
    } else {
      setSaveError('Couldn’t save — check your connection or session and try again.')
    }
  }

  async function handleSaveData(companion: CampaignCompanion, data: CompanionData) {
    setCompanions(l => (l ?? []).map(c => c.id === companion.id ? { ...c, data } : c))
    const res = await updateCampaignCompanion(campaignId, companion.id, { data })
    if (!res.ok) load()
  }

  async function handleReassign(companion: CampaignCompanion, value: string) {
    const res = await updateCampaignCompanion(campaignId, companion.id, {
      assignedCharacterId: value === POOL ? null : value,
    })
    if (res.ok) load()
  }

  async function handleDelete() {
    if (!deleting) return
    const res = await deleteCampaignCompanion(campaignId, deleting.id)
    setDeleting(null)
    if (res.ok) load()
  }

  const selectCls = 'rounded-md border border-input bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring'

  function assignControl(companion: CampaignCompanion) {
    if (isDm) {
      return (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Assigned to
          <select
            className={selectCls}
            value={companion.assignedCharacterId ?? POOL}
            onChange={e => void handleReassign(companion, e.target.value)}
            aria-label={`Assign ${companion.data.name}`}
          >
            <option value={POOL}>Unassigned (pool)</option>
            {charOptions.map(o => (
              <option key={o.id} value={o.id}>{o.name} — {o.owner}</option>
            ))}
          </select>
        </label>
      )
    }
    // Players may move a companion between their OWN characters only (and never
    // out of / into the pool) — offer the control just where the server allows it.
    const assignedToMine = ownChars.some(c => c.id === companion.assignedCharacterId)
    if (!assignedToMine || ownChars.length < 2) return undefined
    return (
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Assigned to
        <select
          className={selectCls}
          value={companion.assignedCharacterId ?? ''}
          onChange={e => void handleReassign(companion, e.target.value)}
          aria-label={`Assign ${companion.data.name}`}
        >
          {ownChars.map(c => (
            <option key={c.id} value={c.id}>{c.name || 'Unnamed'}</option>
          ))}
        </select>
      </label>
    )
  }

  function card(companion: CampaignCompanion) {
    const isAuthor = companion.createdBy.toLowerCase() === myEmail
    const author = companion.createdByUsername ?? companion.createdBy
    return (
      <CompanionStatBlock
        key={companion.id}
        companion={companion}
        rollable={false}
        canEdit
        canDelete={isDm || isAuthor}
        onEdit={() => { setSaveError(null); setEditor({ mode: 'edit', companion }) }}
        onDelete={() => setDeleting(companion)}
        onSaveData={data => void handleSaveData(companion, data)}
        assignControl={assignControl(companion)}
        attribution={isAuthor ? undefined : `added by ${author}`}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isDm
            ? 'Create companions here, keep them in the pool, and assign them to characters.'
            : 'Companions assigned to your characters (roll from the character sheet).'}
        </p>
        <div className="flex items-center gap-2 flex-none">
          <button
            onClick={load}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh companions" aria-label="Refresh companions"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {(isDm || ownChars.length > 0) && (
            <Button size="sm" variant="outline"
              onClick={() => {
                setSaveError(null)
                setCreateAssignee(isDm ? POOL : (ownChars[0]?.id ?? ''))
                setEditor({ mode: 'create' })
              }}>
              <Plus className="h-4 w-4" />
              Add Companion
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <p className="text-xs text-muted-foreground">
          Couldn’t load companions — check your connection or session, then refresh.
        </p>
      )}
      {companions === null && !loadError && (
        <p className="text-sm text-muted-foreground py-2">Loading companions…</p>
      )}
      {companions !== null && list.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          {isDm ? 'No companions yet — add a familiar, mount, or sidekick.' : 'No companions yet.'}
        </p>
      )}

      {pool.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isDm ? 'Unassigned (DM pool)' : 'With the DM (unassigned)'}
          </p>
          <div className="flex flex-col gap-3">{pool.map(card)}</div>
        </div>
      )}

      {assignedIds.map(charId => (
        <div key={charId} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {charName(charId)}{charOwner(charId) ? ` — ${charOwner(charId)}` : ''}
          </p>
          <div className="flex flex-col gap-3">
            {list.filter(c => c.assignedCharacterId === charId).map(card)}
          </div>
        </div>
      ))}

      <CompanionEditor
        open={editor !== null}
        title={editor?.mode === 'edit' ? `Edit ${editor.companion.data.name || 'companion'}` : 'New Companion'}
        initial={editor?.mode === 'edit' ? editor.companion.data : undefined}
        error={saveError}
        saving={saving}
        onClose={() => setEditor(null)}
        onSave={data => {
          if (editor?.mode === 'edit') void handleEdit(editor.companion, data)
          else void handleCreate(data)
        }}
        assignPicker={editor?.mode === 'create' ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Assign to
            <select
              className={selectCls}
              value={createAssignee}
              onChange={e => setCreateAssignee(e.target.value)}
              aria-label="Assign the new companion"
            >
              {isDm && <option value={POOL}>Unassigned (pool)</option>}
              {(isDm ? charOptions : ownChars.map(c => ({ id: c.id, name: c.name || 'Unnamed', owner: 'you' })))
                .map(o => (
                  <option key={o.id} value={o.id}>{o.name}{isDm ? ` — ${o.owner}` : ''}</option>
                ))}
            </select>
          </label>
        ) : undefined}
      />

      <Dialog open={deleting !== null} onOpenChange={o => { if (!o) setDeleting(null) }}>
        <DialogContent className="max-w-xs" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.data.name || 'companion'}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the companion for everyone in the campaign.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
