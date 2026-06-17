import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import CharacterListPage from './pages/CharacterListPage'
import CreateCharacterPage from './pages/CreateCharacterPage'
import CharacterPage from './pages/CharacterPage'
import CampaignPage from './pages/CampaignPage'
import CampaignCharacterPage from './pages/CampaignCharacterPage'
import JoinCampaignPage from './pages/JoinCampaignPage'
import type { DbInitResult } from './storage'
import { useCharacterStore } from './store/characters'
import { useSyncStore } from './store/sync'

interface AppProps {
  dbResult: DbInitResult
}

export default function App({ dbResult }: AppProps) {
  const load = useCharacterStore(s => s.load)
  const storageError = useCharacterStore(s => s.storageError)
  const clearStorageError = useCharacterStore(s => s.clearStorageError)
  const syncStatus = useSyncStore(s => s.status)
  const reconnect = useSyncStore(s => s.reconnect)

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      {syncStatus === 'auth-expired' && (
        <div style={{ background: '#c4a35a', color: '#1a1a2e', padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Your session expired — your edits are saved locally. Reconnect to resume syncing.</span>
          <button onClick={reconnect} style={{ background: '#1a1a2e', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold', marginLeft: '1rem', padding: '0.25rem 0.75rem', borderRadius: '4px' }}>Reconnect</button>
        </div>
      )}
      {storageError && (
        <div style={{ background: '#e94560', color: '#fff', padding: '0.5rem 1rem', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{storageError}</span>
          <button onClick={clearStorageError} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 'bold', marginLeft: '1rem' }}>✕</button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<CharacterListPage notPersistent={!dbResult.persistent} />} />
        <Route path="/create" element={<CreateCharacterPage />} />
        <Route path="/character/:id" element={<CharacterPage />} />
        <Route path="/character/:id/edit" element={<CreateCharacterPage />} />
        <Route path="/campaign/:id" element={<CampaignPage />} />
        <Route path="/campaign/:id/character/:charId" element={<CampaignCharacterPage />} />
        <Route path="/join/:code" element={<JoinCampaignPage />} />
      </Routes>
    </>
  )
}
