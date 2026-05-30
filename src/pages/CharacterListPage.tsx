import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characters'
import { defaultCharacter } from '@/types/character'
import type { Character } from '@/types/character'

type SortOrder = 'recent' | 'alpha'

export default function CharacterListPage() {
  const characters = useCharacterStore((s) => s.characters)
  const createCharacter = useCharacterStore((s) => s.create)
  const [sort, setSort] = useState<SortOrder>('recent')
  const [quickStartOpen, setQuickStartOpen] = useState(false)
  const navigate = useNavigate()

  const sorted = useMemo(() => {
    if (sort === 'alpha') return [...characters].sort((a, b) => a.name.localeCompare(b.name))
    return characters
  }, [characters, sort])

  async function handleQuickStart(name: string) {
    const created = await createCharacter(defaultCharacter(name))
    navigate(`/character/${created.id}`)
  }

  return (
    <div className="min-h-dvh p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Characters</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuickStartOpen(true)}>
              <PenLine className="h-4 w-4" />
              Quick Start
            </Button>
            <Button size="sm" onClick={() => navigate('/create')}>
              <Wand2 className="h-4 w-4" />
              Guided Setup
            </Button>
          </div>
        </div>

        {characters.length === 0 ? (
          <EmptyState
            onGuided={() => navigate('/create')}
            onQuickStart={() => setQuickStartOpen(true)}
          />
        ) : (
          <>
            <div className="flex gap-1 mb-4">
              <SortButton active={sort === 'recent'} onClick={() => setSort('recent')}>
                Recent
              </SortButton>
              <SortButton active={sort === 'alpha'} onClick={() => setSort('alpha')}>
                A–Z
              </SortButton>
            </div>
            <div className="flex flex-col gap-3">
              {sorted.map((c) => (
                <CharacterCard
                  key={c.id}
                  character={c}
                  onClick={() => navigate(`/character/${c.id}`)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <QuickStartDialog
        open={quickStartOpen}
        onClose={() => setQuickStartOpen(false)}
        onCreate={handleQuickStart}
      />
    </div>
  )
}

function QuickStartDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSubmitting(true)
    try {
      await onCreate(name.trim())
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setName('')
      setError('')
      setSubmitting(false)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quick Start</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Name your character and jump straight to the sheet — fill everything in there.
        </p>
        <div>
          <input
            autoFocus
            type="text"
            placeholder="Character name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating…' : 'Start'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CharacterCard({
  character,
  onClick,
}: {
  character: Character
  onClick: () => void
}) {
  const className = capitalize(character.class)
  const race = capitalize(character.race)

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border border-border bg-card px-4 py-3',
        'hover:border-[var(--color-accent-gold)] hover:bg-[var(--color-surface-2)]',
        'transition-colors duration-150 cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight truncate">{character.name}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {className || 'No class'}
            {race ? ` · ${race}` : ''}
          </p>
        </div>
        <span
          className="flex-none text-xs font-semibold px-2 py-0.5 rounded-full border"
          style={{
            background: 'var(--color-surface-2)',
            color: 'var(--color-accent-gold)',
            borderColor: 'var(--color-border-raw)',
          }}
        >
          Lvl {character.level}
        </span>
      </div>
    </button>
  )
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1 text-xs rounded-md font-medium transition-colors',
        active
          ? 'bg-secondary text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function EmptyState({
  onGuided,
  onQuickStart,
}: {
  onGuided: () => void
  onQuickStart: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
      <p className="text-muted-foreground">No characters yet.</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={onGuided}>
          <Wand2 className="h-4 w-4" />
          Guided Setup
        </Button>
        <Button variant="outline" onClick={onQuickStart}>
          <PenLine className="h-4 w-4" />
          Quick Start
        </Button>
      </div>
      <div className="text-xs text-muted-foreground space-y-1 max-w-xs">
        <p><span className="text-foreground font-medium">Guided Setup</span> — walks you through class, race, HP, skills, and equipment step by step.</p>
        <p><span className="text-foreground font-medium">Quick Start</span> — creates a blank sheet you fill in yourself.</p>
      </div>
    </div>
  )
}

function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}
