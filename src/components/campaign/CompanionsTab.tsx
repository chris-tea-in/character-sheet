import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CompanionStatBlock } from './CompanionStatBlock'
import { CompanionEditor } from './CompanionEditor'
import { CompanionRollHistory } from './CompanionRollHistory'
import { useSyncStore } from '@/store/sync'
import { useCharacterStore } from '@/store/characters'
import {
  campaignCompanions, createCampaignCompanion, updateCampaignCompanion, deleteCampaignCompanion,
} from '@/lib/syncApi'
import type { CampaignCompanion } from '@/lib/syncApi'
import type { CompanionData } from '../../../shared/companionValidation'
import type { Character } from '@/types/character'

// The sheet's Companions tab (campaign characters only): the companions assigned
// to THIS character, plus the viewer's own creations currently sitting with the DM
// (pool) so authors keep sight of them. Cloud-only, read-on-demand: fetch on first
// open + manual Refresh — no polling. Rolls are live here (the sheet and the DM
// read-view both mount the dice tray + roll modal).

interface CompanionsTabProps {
  character: Character
  campaignId: string
  isDm: boolean
}

export function CompanionsTab({ character, campaignId, isDm }: CompanionsTabProps) {
  const me = useSyncStore(s => s.me)
  const myLocalCharacters = useCharacterStore(s => s.characters)

  // Last GOOD list — a failed refresh never clobbers it; failures only flag.
  const [companions, setCompanions] = useState<CampaignCompanion[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [editor, setEditor] = useState<null | { mode: 'create' } | { mode: 'edit'; companion: CampaignCompanion }>(null)
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
  }
  useEffect(() => { load() }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  const myEmail = me?.email?.toLowerCase()
  const mine = (companions ?? []).filter(c => c.assignedCharacterId === character.id)
  // The viewer's own creations parked with the DM — visible so a player knows the
  // DM has them; not editable into a new assignment from here (pool moves are DM-only).
  const pooledAuthored = (companions ?? []).filter(c =>
    c.assignedCharacterId === null && c.createdBy.toLowerCase() === myEmail)

  // Move-between-own-characters only makes sense when this sheet is one of the
  // viewer's OWN local characters (on the DM read-view of a player's sheet it
  // isn't — reassignment lives on the campaign page there).
  const ownCampaignChars = useMemo(
    () => myLocalCharacters.filter(c => c.campaignId === campaignId),
    [myLocalCharacters, campaignId],
  )
  const sheetIsMine = ownCampaignChars.some(c => c.id === character.id)
  const moveTargets = ownCampaignChars.filter(c => c.id !== character.id)

  async function handleCreate(data: CompanionData) {
    setSaving(true)
    const res = await createCampaignCompanion(campaignId, character.id, data)
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
    // HP steppers: optimistic local update, then persist; reload on failure so the
    // card snaps back to the server's truth instead of lying.
    setCompanions(list => (list ?? []).map(c => c.id === companion.id ? { ...c, data } : c))
    const res = await updateCampaignCompanion(campaignId, companion.id, { data })
    if (!res.ok) load()
  }

  async function handleMove(companion: CampaignCompanion, targetId: string) {
    const res = await updateCampaignCompanion(campaignId, companion.id, { assignedCharacterId: targetId })
    if (res.ok) load()
  }

  async function handleDelete() {
    if (!deleting) return
    const res = await deleteCampaignCompanion(campaignId, deleting.id)
    setDeleting(null)
    if (res.ok) load()
  }

  function card(companion: CampaignCompanion, opts: { movable: boolean }) {
    const isAuthor = companion.createdBy.toLowerCase() === myEmail
    const author = companion.createdByUsername ?? companion.createdBy
    return (
      <CompanionStatBlock
        key={companion.id}
        companion={companion}
        rollable
        canEdit
        canDelete={isDm || isAuthor}
        onEdit={() => { setSaveError(null); setEditor({ mode: 'edit', companion }) }}
        onDelete={() => setDeleting(companion)}
        onSaveData={data => void handleSaveData(companion, data)}
        attribution={isAuthor ? undefined : `added by ${author}`}
        assignControl={
          opts.movable && moveTargets.length > 0 ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Move to
              <select
                className="rounded-md border border-input bg-transparent px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                value={character.id}
                onChange={e => { if (e.target.value !== character.id) void handleMove(companion, e.target.value) }}
                aria-label={`Move ${companion.data.name} to another of your characters`}
              >
                <option value={character.id}>{character.name || 'This character'}</option>
                {moveTargets.map(c => (
                  <option key={c.id} value={c.id}>{c.name || 'Unnamed'}</option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Companions</p>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh companions" aria-label="Refresh companions"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <Button size="sm" variant="outline" onClick={() => { setSaveError(null); setEditor({ mode: 'create' }) }}>
            <Plus className="h-4 w-4" />
            Add Companion
          </Button>
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

      {companions !== null && mine.length === 0 && pooledAuthored.length === 0 && (
        <p className="text-sm text-muted-foreground py-2">
          No companions yet. Add a familiar, mount, or sidekick — or wait for your DM to assign one.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {mine.map(c => card(c, { movable: sheetIsMine }))}
      </div>

      {pooledAuthored.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            With the DM (unassigned)
          </p>
          <div className="flex flex-col gap-3">
            {pooledAuthored.map(c => card(c, { movable: false }))}
          </div>
        </div>
      )}

      <CompanionRollHistory companionIds={[...mine, ...pooledAuthored].map(c => c.id)} />

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
