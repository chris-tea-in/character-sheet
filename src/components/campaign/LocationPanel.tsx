// One campaign location's content (Phase F): description (author-or-DM
// editable), the location's notes, and its NPCs (lightweight name+description
// entries, each with their own notes). Rendered inside a location tab on the
// campaign notes page. All reads are fetch-on-open + manual refresh; privacy
// of hidden notes is server-enforced (the panel only receives what this
// viewer may see).
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampaignNotesPanel } from '@/components/campaign/CampaignNotesPanel'
import { useSyncStore } from '@/store/sync'
import {
  updateCampaignLocation, deleteCampaignLocation,
  campaignNpcs, createCampaignNpc, deleteCampaignNpc,
} from '@/lib/syncApi'
import type { CampaignLocation, CampaignNpc } from '@/lib/syncApi'

interface LocationPanelProps {
  campaignId: string
  location: CampaignLocation
  isDm: boolean
  onChanged: () => void   // rename saved — parent refreshes the tab labels
  onDeleted: () => void   // location removed — parent drops the tab
}

export function LocationPanel({ campaignId, location, isDm, onChanged, onDeleted }: LocationPanelProps) {
  const me = useSyncStore(s => s.me)
  const [npcs, setNpcs] = useState<CampaignNpc[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Description editing (author-or-DM)
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [descDraft, setDescDraft] = useState('')

  // NPC quick-add
  const [npcName, setNpcName] = useState('')
  const [npcDesc, setNpcDesc] = useState('')
  const [addingNpc, setAddingNpc] = useState(false)
  const [openNpcId, setOpenNpcId] = useState<string | null>(null)

  function loadNpcs() {
    void campaignNpcs(campaignId, location.id).then(res => { if (res.ok) setNpcs(res.data) })
  }
  useEffect(() => { loadNpcs() }, [campaignId, location.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const canEditLocation = isDm || (me?.email && location.authorEmail.toLowerCase() === me.email.toLowerCase())

  async function saveLocation() {
    const name = nameDraft.trim()
    if (!name) return
    const res = await updateCampaignLocation(campaignId, location.id, { name, description: descDraft.trim() })
    if (res.ok) {
      setEditing(false)
      setError(null)
      onChanged()
    } else {
      setError('Couldn’t save the location — check your connection or session; your edits are kept.')
    }
  }

  async function removeLocation() {
    const res = await deleteCampaignLocation(campaignId, location.id)
    if (res.ok) onDeleted()
    else setError('Couldn’t delete the location — check your connection or session.')
  }

  async function addNpc() {
    if (addingNpc) return
    const name = npcName.trim()
    if (!name) return
    setAddingNpc(true)
    const res = await createCampaignNpc(campaignId, { name, description: npcDesc.trim(), locationId: location.id })
    setAddingNpc(false)
    if (res.ok) {
      // Keep-the-text contract: clear only after a confirmed save.
      setNpcName('')
      setNpcDesc('')
      setError(null)
      loadNpcs()
    } else {
      setError('Couldn’t add the NPC — check your connection or session; your text is kept.')
    }
  }

  async function removeNpc(npcId: string) {
    const res = await deleteCampaignNpc(campaignId, npcId)
    if (res.ok) loadNpcs()
    else setError('Couldn’t delete the NPC — check your connection or session.')
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-xs" style={{ color: 'var(--color-accent-red)' }}>{error}</p>}

      {/* Description */}
      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
          {canEditLocation && !editing && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setNameDraft(location.name); setDescDraft(location.description); setEditing(true) }}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border inline-flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" /> Edit
              </button>
              <button
                onClick={removeLocation}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded border border-border inline-flex items-center gap-1"
                title={`Delete ${location.name}`}
                aria-label={`Delete ${location.name}`}
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <input
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              className="w-full bg-[var(--color-surface-2)] border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring"
              placeholder="Location name"
            />
            <textarea
              value={descDraft}
              onChange={e => setDescDraft(e.target.value)}
              rows={4}
              className="w-full bg-[var(--color-surface-2)] border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring"
              placeholder="What is this place?"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveLocation} disabled={!nameDraft.trim()}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap">
            {location.description || <span className="text-muted-foreground italic">No description yet.</span>}
          </p>
        )}
      </section>

      {/* Location notes */}
      <section className="space-y-2 rounded-lg border border-border bg-card p-4">
        <CampaignNotesPanel campaignId={campaignId} subjectKind="location" subjectId={location.id} isDm={isDm} />
      </section>

      {/* NPCs here */}
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">NPCs here</p>
        {npcs === null ? (
          <p className="text-sm text-muted-foreground">Loading NPCs…</p>
        ) : npcs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No NPCs recorded at this location yet.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {npcs.map(n => {
              const mine = me?.email && n.authorEmail.toLowerCase() === me.email.toLowerCase()
              const open = openNpcId === n.id
              return (
                <div key={n.id} className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setOpenNpcId(open ? null : n.id)}
                      className="flex-1 min-w-0 text-left inline-flex items-center gap-1.5 text-sm font-medium hover:opacity-75 transition-opacity"
                    >
                      {open ? <ChevronDown className="h-3.5 w-3.5 flex-none" /> : <ChevronRight className="h-3.5 w-3.5 flex-none" />}
                      <span className="truncate">{n.name}</span>
                    </button>
                    {(mine || isDm) && (
                      <button
                        onClick={() => removeNpc(n.id)}
                        className="flex-none text-muted-foreground hover:text-destructive transition-colors"
                        title={`Delete ${n.name}`}
                        aria-label={`Delete ${n.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {open && (
                    <div className="pl-5 space-y-3">
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {n.description || <span className="italic">No description.</span>}
                      </p>
                      <CampaignNotesPanel campaignId={campaignId} subjectKind="npc" subjectId={n.id} isDm={isDm} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Quick-add — lightweight entries by design (name + description, no sheet) */}
        <div className="space-y-1.5 pt-1">
          <input
            value={npcName}
            onChange={e => setNpcName(e.target.value)}
            placeholder="NPC name…"
            className="w-full bg-[var(--color-surface-2)] border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring"
          />
          <textarea
            value={npcDesc}
            onChange={e => setNpcDesc(e.target.value)}
            placeholder="Who are they? (optional)"
            rows={2}
            className="w-full bg-[var(--color-surface-2)] border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring"
          />
          <Button size="sm" variant="outline" onClick={addNpc} disabled={addingNpc || !npcName.trim()}>
            <Plus className="h-3.5 w-3.5" />
            {addingNpc ? 'Adding…' : 'Add NPC'}
          </Button>
        </div>
      </section>
    </div>
  )
}
