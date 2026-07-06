// Location page (Phase F): /campaign/:id/location/:locationId — one campaign
// location with its description (author-or-DM editable), its notes, and its
// NPCs (lightweight name+description entries, each with their own notes).
// All reads are fetch-on-open + manual refresh; privacy of hidden notes is
// server-enforced (the panel only receives what this viewer may see).
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampaignNotesPanel } from '@/components/campaign/CampaignNotesPanel'
import { useSyncStore } from '@/store/sync'
import {
  listCampaigns, campaignLocations, updateCampaignLocation,
  campaignNpcs, createCampaignNpc, deleteCampaignNpc,
} from '@/lib/syncApi'
import type { Campaign, CampaignLocation, CampaignNpc } from '@/lib/syncApi'

export default function LocationPage() {
  const { id, locationId } = useParams<{ id: string; locationId: string }>()
  const navigate = useNavigate()
  const me = useSyncStore(s => s.me)

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [location, setLocation] = useState<CampaignLocation | null | 'missing'>(null)
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

  function loadLocation() {
    if (!id || !locationId) return
    void campaignLocations(id).then(res => {
      if (!res.ok) return
      setLocation(res.data.find(l => l.id === locationId) ?? 'missing')
    })
  }
  function loadNpcs() {
    if (!id || !locationId) return
    void campaignNpcs(id, locationId).then(res => { if (res.ok) setNpcs(res.data) })
  }

  useEffect(() => {
    if (!id) return
    void listCampaigns().then(res => {
      if (res.ok) setCampaign(res.data.find(c => c.id === id) ?? null)
    })
    loadLocation()
    loadNpcs()
  }, [id, locationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isDm = campaign?.role === 'dm'
  const loc = location !== 'missing' ? location : null
  const canEditLocation = !!loc && (isDm || (me?.email && loc.authorEmail.toLowerCase() === me.email.toLowerCase()))

  async function saveLocation() {
    if (!id || !locationId) return
    const name = nameDraft.trim()
    if (!name) return
    const res = await updateCampaignLocation(id, locationId, { name, description: descDraft.trim() })
    if (res.ok) {
      setEditing(false)
      setError(null)
      loadLocation()
    } else {
      setError('Couldn’t save the location — check your connection or session; your edits are kept.')
    }
  }

  async function addNpc() {
    if (!id || !locationId || addingNpc) return
    const name = npcName.trim()
    if (!name) return
    setAddingNpc(true)
    const res = await createCampaignNpc(id, { name, description: npcDesc.trim(), locationId })
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
    if (!id) return
    const res = await deleteCampaignNpc(id, npcId)
    if (res.ok) loadNpcs()
    else setError('Couldn’t delete the NPC — check your connection or session.')
  }

  if (location === 'missing') {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Location not found, or you’re not a member of this campaign.</p>
          <Button variant="outline" onClick={() => navigate(`/campaign/${id}`)}>Back to campaign</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(`/campaign/${id}`)}
            className="text-muted-foreground hover:text-foreground transition-colors flex-none"
            aria-label="Back to campaign"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">{loc?.name ?? 'Loading…'}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {campaign ? campaign.name : 'Campaign location'}
            </p>
          </div>
          {canEditLocation && !editing && loc && (
            <button
              onClick={() => { setNameDraft(loc.name); setDescDraft(loc.description); setEditing(true) }}
              className="flex-none text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border inline-flex items-center gap-1"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-6">
        {error && <p className="text-xs" style={{ color: 'var(--color-accent-red)' }}>{error}</p>}

        {/* Description */}
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
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
              {loc?.description || <span className="text-muted-foreground italic">No description yet.</span>}
            </p>
          )}
        </section>

        {/* Location notes */}
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          {id && locationId && (
            <CampaignNotesPanel campaignId={id} subjectKind="location" subjectId={locationId} isDm={isDm} />
          )}
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
                        {id && (
                          <CampaignNotesPanel campaignId={id} subjectKind="npc" subjectId={n.id} isDm={isDm} />
                        )}
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
      </main>
    </div>
  )
}
