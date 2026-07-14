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
    version: '2026-07-06',
    title: 'Companions',
    changes: [
      'When you’re in a campaign, your character now has a Companions tab for familiars, mounts, pets, and sidekicks — each with its own stat block you can roll straight from the sheet (attacks, checks, saves), with its own roll history.',
      'Your DM can create companions for the party and assign them to characters — and you can build your own, too.',
    ],
  },
  {
    version: '2026-07-05',
    title: 'Shared campaign notes + a Personal notebook',
    changes: [
      'Every campaign now has its own Notes page — a General section, a tab for each location, and NPCs your DM can share.',
      'Your DM can publish notes to the party when they’re ready, and keep secret ones hidden until then.',
      'The new Personal tab is your own private notebook for keeping track of the party’s characters — yours and everyone else’s.',
    ],
  },
  {
    version: '2026-07-04',
    title: 'A tabbed sheet, plus a new Combat tab',
    changes: [
      'Your sheet is now split into tabs — Character, Spells, Inventory, and Combat — so there’s far less scrolling to find things.',
      'The Combat tab helps you plan your turn: line up your Action, Bonus Action, and Reaction from everything you can actually do, tap any attack, spell, or feature to read what it does, then hit Commit to spend the slots and uses all at once.',
      'Tap the eye icon next to your name to hide your name, class, or race — with optional decoy values — when someone might be peeking at your screen.',
    ],
  },
  {
    version: '2026-07-03',
    title: 'Smarter, better-looking dice',
    changes: [
      'Rolls now tumble as 3D dice.',
      'Advantage, disadvantage, and extra damage are opt-in at roll time — tap a chip to apply the ones that fit the moment, instead of the app guessing for you.',
      'A bonus picker lets you add a one-off + or − to any roll on the fly.',
      'Drink a healing potion with a Drink action that rolls the healing and uses it up.',
    ],
  },
  {
    version: '2026-06-27',
    title: 'Make the math your own',
    changes: [
      'Every bonus the app applies is now traceable and editable — turn any auto-applied modifier off, change its value, or add your own.',
      'A new Custom Effects section lets you build always-on bonuses of your own — to-hit, damage, AC, advantage, proficiencies and more — perfect for homebrew or anything the app doesn’t cover yet.',
      'Your class, race, and feat features are gathered into one Features & Traits spot on the Character tab.',
    ],
  },
  {
    version: '2026-06-21',
    title: 'Homebrew content & inventory upgrades',
    changes: [
      'Create your own homebrew races and items and use them just like the built-in content.',
      'Store gear inside a Bag of Holding and other containers.',
      'Prepared spellcasting was reworked to match how each class actually prepares, with gentler level limits.',
      'Type item quantities directly, edit custom items, and more inventory polish.',
    ],
  },
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
