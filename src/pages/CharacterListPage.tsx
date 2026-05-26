import { useCharacterStore } from '../store/characters'

export default function CharacterListPage() {
  const characters = useCharacterStore(s => s.characters)

  return (
    <div style={{ padding: '2rem' }}>
      <h1>D&amp;D 5e Character Sheet</h1>
      {characters.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
          No characters yet. Character creation coming soon.
        </p>
      ) : (
        <ul style={{ marginTop: '1rem', listStyle: 'none' }}>
          {characters.map(c => (
            <li key={c.id} style={{ marginBottom: '0.5rem' }}>
              <strong>{c.name}</strong>
              {' — '}Level {c.level} {c.class || 'Unknown class'}
              {c.spells.length > 0 && ` · ${c.spells.length} spell${c.spells.length !== 1 ? 's' : ''}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
