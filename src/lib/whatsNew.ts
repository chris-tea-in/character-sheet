// Hand-maintained "What's New" changelog, in plain user-facing language (not commit
// messages). Add a new entry at the TOP for each release whose changes a player would
// actually notice. `version` is just an ordered id (date works well); the newest entry
// is WHATS_NEW[0]. The WhatsNewModal shows entries the user hasn't acknowledged yet.

export interface WhatsNewEntry {
  version: string        // ordered id, newest first (e.g. a release date)
  title?: string         // optional short heading
  changes: string[]      // user-friendly bullets — what the player will see
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    version: '2026-06-18',
    title: 'Quality-of-life updates',
    changes: [
      'Money is now typable — tap a coin total to type it, or tap + to open a quick dial that adds or subtracts by 1, 10, 100, 1,000 or 10,000 at a time.',
      'Your Tools moved down into the Equipment area, just below Items.',
      'Opening or refreshing the app now loads your latest saved characters from the cloud first, so you always start on the newest version of your sheet.',
      'In a campaign, your DM can now make adjustments to your character — and their changes appear on your sheet automatically while it’s open.',
    ],
  },
]

const SEEN_KEY = 'whatsNewSeen'

// Entries the user hasn't acknowledged yet (newest-first). Pure — no side effects;
// the seen pointer is advanced only when the modal is dismissed (markWhatsNewSeen).
export function getUnseenWhatsNew(): WhatsNewEntry[] {
  const latest = WHATS_NEW[0]?.version
  if (!latest) return []

  let seen: string | null = null
  try { seen = localStorage.getItem(SEEN_KEY) } catch { /* storage blocked → treat as unseen */ }

  if (seen === latest) return []
  // No pointer yet (first run, or a user who predates this feature): show just the
  // latest entry once, rather than the whole history or nothing.
  if (seen == null) return WHATS_NEW.slice(0, 1)

  // Show everything newer than the acknowledged version.
  const idx = WHATS_NEW.findIndex(e => e.version === seen)
  return idx === -1 ? WHATS_NEW : WHATS_NEW.slice(0, idx)
}

export function markWhatsNewSeen(): void {
  const latest = WHATS_NEW[0]?.version
  if (!latest) return
  try { localStorage.setItem(SEEN_KEY, latest) } catch { /* storage blocked → just don't persist */ }
}
