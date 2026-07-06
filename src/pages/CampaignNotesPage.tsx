// Campaign notes page: /campaign/:id/notes — the party's shared notebook.
// A tab bar where General (the campaign-wide notes) comes first, then one tab
// per location, then "+" to add a location as a new tab. Only the ACTIVE tab
// is mounted, so opening the page costs one bounded notes fetch — not one per
// location (free-tier D1 budget). Reached from the campaign page's
// "View Campaign Notes" button and the sheet's Notes tab.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CampaignNotesPanel } from '@/components/campaign/CampaignNotesPanel'
import { LocationPanel } from '@/components/campaign/LocationPanel'
import { useCampaignStore } from '@/store/campaigns'
import { campaignLocations, createCampaignLocation } from '@/lib/syncApi'
import type { CampaignLocation } from '@/lib/syncApi'
import { cn } from '@/lib/utils'

export default function CampaignNotesPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  // Where the back button goes: the character sheet's Notes tab arrives with a
  // returnTo in history state (it survives reloads); the campaign page's
  // button arrives without one → default back to the campaign page.
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? null

  const campaigns = useCampaignStore(s => s.campaigns)
  const campaignsLoaded = useCampaignStore(s => s.loaded)
  const campaign = campaigns.find(c => c.id === id)
  const isDm = campaign?.role === 'dm'

  const [locations, setLocations] = useState<CampaignLocation[] | null>(null)
  function loadLocations() {
    if (!id) return
    void campaignLocations(id).then(res => { if (res.ok) setLocations(res.data) })
  }
  useEffect(() => { loadLocations() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Active tab — 'general' or a location id; per campaign, session-scoped.
  const [tab, setTab] = useState<string>(() => sessionStorage.getItem(`campaign-notes-tab:${id}`) ?? 'general')
  useEffect(() => {
    setTab(sessionStorage.getItem(`campaign-notes-tab:${id}`) ?? 'general')
  }, [id])
  function selectTab(t: string) {
    setTab(t)
    sessionStorage.setItem(`campaign-notes-tab:${id}`, t)
  }

  // A stored location tab can go stale (deleted elsewhere) — snap to General
  // once the location list confirms it's gone. While the list is still loading
  // we can't tell, so hold off rendering a panel rather than flashing General.
  const activeLocation = locations?.find(l => l.id === tab) ?? null
  const effectiveTab = tab === 'general' ? 'general'
    : activeLocation ? tab
    : locations === null ? 'pending'
    : 'general'

  // Inline "+" add-location form (the tab bar's last entry).
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function addLocation() {
    if (!id) return
    const name = newName.trim()
    if (!name || adding) return
    setAdding(true)
    const res = await createCampaignLocation(id, { name })
    setAdding(false)
    if (res.ok) {
      // Keep-the-text contract: clear only after a confirmed save. The POST
      // returns the created row — append it and jump straight to its tab.
      setNewName('')
      setAddOpen(false)
      setAddError(null)
      setLocations(prev => (prev ? [...prev, res.data] : [res.data]))
      selectTab(res.data.id)
    } else {
      setAddError('Couldn’t add the location — check your connection or session; the name is kept.')
    }
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
          <button
            onClick={() => navigate(returnTo ?? `/campaign/${campaign.id}`)}
            className="text-muted-foreground hover:text-foreground transition-colors flex-none"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold truncate">Campaign Notes</h1>
            <p className="text-xs text-muted-foreground truncate">{campaign.name}</p>
          </div>
        </div>
        <div
          role="tablist"
          aria-label="Notes sections"
          className="max-w-2xl mx-auto px-4 pb-2 flex items-center gap-1 overflow-x-auto"
        >
          <button
            role="tab"
            id="notes-tab-general"
            aria-selected={effectiveTab === 'general'}
            aria-controls="notes-panel"
            onClick={() => selectTab('general')}
            className={cn(
              'px-3 py-1 text-xs rounded-md font-semibold uppercase tracking-wide transition-colors whitespace-nowrap flex-none',
              effectiveTab === 'general' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            General
          </button>
          {(locations ?? []).map(l => (
            <button
              key={l.id}
              role="tab"
              id={`notes-tab-${l.id}`}
              aria-selected={effectiveTab === l.id}
              aria-controls="notes-panel"
              onClick={() => selectTab(l.id)}
              className={cn(
                'px-3 py-1 text-xs rounded-md font-semibold uppercase tracking-wide transition-colors whitespace-nowrap flex-none max-w-[12rem] truncate',
                effectiveTab === l.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {l.name}
            </button>
          ))}
          <button
            onClick={() => { setAddOpen(o => !o); setAddError(null) }}
            className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors flex-none"
            title="Add location"
            aria-label="Add location"
            aria-expanded={addOpen}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {addOpen && (
          <div className="max-w-2xl mx-auto px-4 pb-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void addLocation() }}
                placeholder="New location name…"
                autoFocus
                className="flex-1 bg-[var(--color-surface-2)] border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring"
              />
              <Button size="sm" variant="outline" onClick={addLocation} disabled={adding || !newName.trim()}>
                {adding ? 'Adding…' : 'Add'}
              </Button>
            </div>
            {addError && <p className="text-xs" style={{ color: 'var(--color-accent-red)' }}>{addError}</p>}
          </div>
        )}
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        <div
          role="tabpanel"
          id="notes-panel"
          aria-labelledby={effectiveTab === 'general' ? 'notes-tab-general' : `notes-tab-${effectiveTab}`}
        >
          {effectiveTab === 'general' ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <CampaignNotesPanel campaignId={campaign.id} subjectKind="campaign" isDm={isDm} title="General Notes" />
            </section>
          ) : effectiveTab === 'pending' ? (
            <p className="text-sm text-muted-foreground">Loading locations…</p>
          ) : activeLocation && (
            <LocationPanel
              key={activeLocation.id}
              campaignId={campaign.id}
              location={activeLocation}
              isDm={isDm}
              onChanged={loadLocations}
              onDeleted={() => { selectTab('general'); loadLocations() }}
            />
          )}
        </div>
      </main>
    </div>
  )
}
