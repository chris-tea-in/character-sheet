// Personal tab (campaign characters only): the player's own notebook about
// the campaign's PCs — notes on yourself, plus notes on the other players'
// characters. Notes here are HIDDEN by default (author + DM only) until
// published with the eye toggle; visibility is enforced server-side in SQL.
// The picker shows character NAMES only — no class — and the names arrive
// from the roster with any sheet-privacy disguise already applied, while
// notes attach to the real character id (they survive a disguise lift).
import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { CampaignNotesPanel } from '@/components/campaign/CampaignNotesPanel'
import { useSyncStore } from '@/store/sync'
import { campaignRoster } from '@/lib/syncApi'
import type { RosterMember } from '@/lib/syncApi'
import { cn } from '@/lib/utils'
import type { Character } from '@/types/character'

interface PersonalNotesTabProps {
  character: Character
  campaignId: string
  isDm: boolean
}

export function PersonalNotesTab({ character, campaignId, isDm }: PersonalNotesTabProps) {
  const me = useSyncStore(s => s.me)
  // Last GOOD roster — a failed refresh never clobbers it (the chips and the
  // selected subject must not vanish on a network blip); failures only raise
  // the error flag. null = never loaded.
  const [roster, setRoster] = useState<RosterMember[] | null>(null)
  const [rosterError, setRosterError] = useState(false)

  function loadRoster() {
    void campaignRoster(campaignId).then(res => {
      if (res.ok) {
        setRoster(res.data)
        setRosterError(false)
      } else {
        setRosterError(true)
      }
    })
  }
  useEffect(() => { loadRoster() }, [campaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Selected subject (a character id) — per character, session-scoped.
  const [subject, setSubject] = useState<string>(
    () => sessionStorage.getItem(`personal-notes-subject:${character.id}`) ?? character.id,
  )
  function selectSubject(id: string) {
    setSubject(id)
    sessionStorage.setItem(`personal-notes-subject:${character.id}`, id)
  }

  // A stored subject snaps back to Yourself ONLY once a successful roster load
  // confirms the character is gone — committed as state, not a render-time
  // fallback, so an unconfirmed list (still loading / failed refresh) can
  // never flap the keyed panel below and eat a typed draft, and a later
  // rejoin can't yank the panel away mid-draft either.
  useEffect(() => {
    if (roster !== null && subject !== character.id
      && !roster.some(m => m.characters.some(ch => ch.id === subject))) {
      selectSubject(character.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, subject, character.id])

  // The roster is the OTHER players' characters (self is excluded server-side);
  // filter defensively anyway so Yourself never appears twice.
  const myEmail = me?.email?.toLowerCase()
  const members = (roster ?? []).filter(m => m.email.toLowerCase() !== myEmail)
  const others = members.flatMap(m => m.characters.map(ch => ({ ...ch, player: m.username ?? m.email })))

  const picked = others.find(ch => ch.id === subject)
  const subjectName = subject === character.id ? (character.name || 'this character') : picked?.name
  // Panel is held back while a non-self subject is unresolved (roster still
  // loading, or the snap-to-self effect above hasn't committed yet) — never
  // mount it keyed to the WRONG subject.
  const subjectResolved = subject === character.id || !!picked

  return (
    <div className="space-y-4">
      {/* Subject picker — names only (any disguise is already applied). */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes about</p>
          <button
            onClick={loadRoster}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh the character list"
            aria-label="Refresh the character list"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => selectSubject(character.id)}
            aria-pressed={subject === character.id}
            className={cn(
              'px-3 py-1 text-xs rounded-md font-semibold transition-colors border border-border',
              subject === character.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Yourself
          </button>
          {others.map(ch => (
            <button
              key={ch.id}
              onClick={() => selectSubject(ch.id)}
              aria-pressed={subject === ch.id}
              title={`${ch.name} — ${ch.player}`}
              className={cn(
                'px-3 py-1 text-xs rounded-md font-semibold transition-colors border border-border max-w-[12rem] truncate',
                subject === ch.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {ch.name}
            </button>
          ))}
          {roster === null && !rosterError && <span className="text-xs text-muted-foreground">Loading party…</span>}
        </div>
        {rosterError && (
          <p className="text-xs text-muted-foreground">
            Couldn’t load the party list — check your connection or session, then refresh. Notes on yourself still work.
          </p>
        )}
      </div>

      {subjectResolved ? (
        // key remounts the panel so it refetches cleanly on subject change.
        <section className="rounded-lg border border-border bg-card p-4">
          <CampaignNotesPanel
            key={subject}
            campaignId={campaignId}
            subjectKind="character"
            subjectId={subject}
            isDm={isDm}
            title={`About ${subjectName}`}
            defaultHidden
          />
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            {rosterError ? 'Waiting for the party list to load this character’s notes…' : 'Loading party…'}
          </p>
        </section>
      )}
    </div>
  )
}
