import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import CharacterListPage from './pages/CharacterListPage'
import CreateCharacterPage from './pages/CreateCharacterPage'
import CharacterPage from './pages/CharacterPage'
import type { DbInitResult } from './storage'
import { useCharacterStore } from './store/characters'

interface AppProps {
  dbResult: DbInitResult
}

export default function App({ dbResult }: AppProps) {
  const load = useCharacterStore(s => s.load)
  const storageError = useCharacterStore(s => s.storageError)
  const clearStorageError = useCharacterStore(s => s.clearStorageError)

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      {!dbResult.persistent && (
        <div style={{ background: '#c4a35a', color: '#1a1a2e', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
          Storage is not persistent — export regularly to avoid data loss.
        </div>
      )}
      {storageError && (
        <div style={{ background: '#e94560', color: '#fff', padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{storageError}</span>
          <button onClick={clearStorageError} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold', marginLeft: '1rem' }}>✕</button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<CharacterListPage />} />
        <Route path="/create" element={<CreateCharacterPage />} />
        <Route path="/character/:id" element={<CharacterPage />} />
      </Routes>
    </>
  )
}
