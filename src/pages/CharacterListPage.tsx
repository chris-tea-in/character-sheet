import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characters'
import type { Character } from '@/types/character'

type SortOrder = 'recent' | 'alpha'

export default function CharacterListPage() {
  const characters = useCharacterStore((s) => s.characters)
  const [sort, setSort] = useState<SortOrder>('recent')
  const navigate = useNavigate()

  const sorted = useMemo(() => {
    if (sort === 'alpha') {
      return [...characters].sort((a, b) => a.name.localeCompare(b.name))
    }
    return characters // already ordered by updated_at DESC from SQL
  }, [characters, sort])

  function handleNew() {
    navigate('/create')
  }

  return (
    <div className="min-h-dvh p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Characters</h1>
          <Button onClick={handleNew}>
            <Plus className="h-4 w-4" />
            New Character
          </Button>
        </div>

        {characters.length === 0 ? (
          <EmptyState onNew={handleNew} />
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
    </div>
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

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-muted-foreground mb-6">No characters yet.</p>
      <Button onClick={onNew}>
        <Plus className="h-4 w-4" />
        Create your first character
      </Button>
    </div>
  )
}

function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1)
}
