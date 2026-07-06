// Reusable campaign-notes panel (Phase F): the notes for one subject (the
// campaign itself, a character, a location, or an NPC). Any member can add a
// note; "Hidden" notes are visible only to their author and the DM — enforced
// server-side in SQL, so this component only ever receives what the viewer may
// see. Fetches on mount + manual Refresh; no polling (free-tier budget).
//
// Failure contract: a failed save shows an inline error and KEEPS the typed
// text — a long note is never silently eaten (the fire-and-forget trap).
import { useEffect, useState } from 'react'
import { EyeOff, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSyncStore } from '@/store/sync'
import {
  campaignNotes, createCampaignNote, deleteCampaignNote,
} from '@/lib/syncApi'
import type { CampaignNote, NoteSubjectKind } from '@/lib/syncApi'

function authorLabel(n: CampaignNote): string {
  return n.authorUsername ?? n.authorEmail
}

export function CampaignNotesPanel({ campaignId, subjectKind, subjectId, isDm = false, title = 'Notes' }: {
  campaignId: string
  subjectKind: NoteSubjectKind
  subjectId?: string
  isDm?: boolean
  title?: string
}) {
  const me = useSyncStore(s => s.me)
  const [notes, setNotes] = useState<CampaignNote[] | null>(null)
  const [draft, setDraft] = useState('')
  const [hidden, setHidden] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load() {
    void campaignNotes(campaignId, subjectKind, subjectId).then(res => {
      if (res.ok) setNotes(res.data)
      else if (notes === null) setNotes([])
    })
  }
  useEffect(() => { load() }, [campaignId, subjectKind, subjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    const body = draft.trim()
    if (!body || saving) return
    setSaving(true)
    setError(null)
    const res = await createCampaignNote(campaignId, {
      subjectKind,
      subjectId,
      visibility: hidden ? 'hidden' : 'public',
      body,
    })
    setSaving(false)
    if (res.ok) {
      // Keep-the-text contract: only a CONFIRMED save clears the draft.
      setDraft('')
      setHidden(false)
      load()
    } else {
      setError(res.reason === 'auth-expired'
        ? 'Couldn’t save — your session may have expired. Reconnect and try again; your note text is kept.'
        : 'Couldn’t save — check your connection and try again; your note text is kept.')
    }
  }

  async function remove(noteId: string) {
    const res = await deleteCampaignNote(campaignId, noteId)
    if (res.ok) load()
    else setError('Couldn’t delete — check your connection or session.')
  }

  const myEmail = me?.email?.toLowerCase()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <button
          onClick={load}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh notes"
          aria-label="Refresh notes"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {notes === null ? (
        <p className="text-sm text-muted-foreground">Loading notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {notes.map(n => {
            const mine = myEmail !== undefined && n.authorEmail.toLowerCase() === myEmail
            return (
              <div key={n.id} className="px-3 py-2 space-y-1">
                <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {n.visibility === 'hidden' && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border"
                      style={{ color: 'var(--color-accent-gold)', borderColor: 'var(--color-accent-gold)' }}
                      title={mine ? 'Hidden — only you and the DM can see this' : 'Hidden note — visible to you as the DM'}
                    >
                      <EyeOff className="h-2.5 w-2.5" />
                      hidden{!mine && ` — by ${authorLabel(n)}`}
                    </span>
                  )}
                  <span>{mine ? 'you' : authorLabel(n)}</span>
                  <span>· {new Date(n.createdAt).toLocaleDateString()}</span>
                  {(mine || isDm) && (
                    <button
                      onClick={() => remove(n.id)}
                      className="ml-auto text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete note"
                      aria-label="Delete note"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="space-y-1.5">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Add a note…"
          rows={2}
          className="w-full bg-[var(--color-surface-2)] border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring"
        />
        {error && <p className="text-xs" style={{ color: 'var(--color-accent-red)' }}>{error}</p>}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-muted-foreground">
            <input
              type="checkbox"
              checked={hidden}
              onChange={e => setHidden(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-accent-gold)]"
            />
            Hidden (only you &amp; the DM)
          </label>
          <Button size="sm" variant="outline" onClick={add} disabled={saving || !draft.trim()} className="ml-auto">
            <Plus className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Add note'}
          </Button>
        </div>
      </div>
    </div>
  )
}
