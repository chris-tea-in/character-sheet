import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'
import { initDb, getDb, flush, type DbInitResult } from './storage'
import { normalizeCharacterStats } from './storage/normalizeStats'
import { loadSetupData, loadFeatsData } from './lib/data'
import { useSyncStore } from './store/sync'
import { useCampaignStore } from './store/campaigns'

const root = createRoot(document.getElementById('root')!)

// Cap on how long first paint waits for the cloud pull before falling back to the
// local cache, so a slow/absent network never hangs the open (offline returns fast
// on its own; this only bounds a slow-but-connected case).
const SYNC_GATE_MS = 4_000

function Splash({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'system-ui, sans-serif', color: '#9a9a9a', background: '#1c1c1c', fontSize: '0.95rem' }}>
      {message}
    </div>
  )
}

async function bootstrap() {
  // Immediate feedback while the local DB opens and the cloud pull runs.
  root.render(<Splash message="Loading your characters…" />)

  let dbResult: DbInitResult
  try {
    dbResult = await initDb()
  } catch (err) {
    root.render(
      <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', color: '#eaeaea', background: '#1c1c1c', minHeight: '100dvh' }}>
        <h1 style={{ marginBottom: '0.75rem' }}>Unable to open local database</h1>
        <p style={{ color: '#9a9a9a', marginBottom: '1.5rem' }}>
          {err instanceof Error ? err.message : 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => { indexedDB.deleteDatabase('dnd-character-sheet'); location.reload() }}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          Clear local data and retry
        </button>
      </div>
    )
    return
  }

  // One-time backfill to base-stats storage (see normalizeStats.ts). Runs here
  // because migrations can't fetch reference data. On fetch failure rows stay
  // flagged un-normalized and the conversion retries on the next launch.
  try {
    const [setupData, featData] = await Promise.all([loadSetupData(), loadFeatsData()])
    if (normalizeCharacterStats(getDb(), setupData, featData)) await flush()
  } catch {
    // data fetch failed — keep rows flagged, retry next launch
  }

  // Cloud-authoritative open: pull the latest saved characters from the cloud and
  // merge them into the local DB BEFORE first paint, so opening or refreshing the
  // app shows the freshest data (e.g. a DM's edits) instead of a stale local cache.
  // runInitialSync no-ops quickly when offline/no-backend; the timeout bounds a
  // slow-but-connected pull so the open is never blocked. If the timeout wins, the
  // pull finishes in the background and refreshes the store in place.
  await Promise.race([
    useSyncStore.getState().runInitialSync(),
    new Promise<void>(resolve => setTimeout(resolve, SYNC_GATE_MS)),
  ]).catch(() => { /* never block first paint on a sync error */ })

  root.render(
    <StrictMode>
      <BrowserRouter>
        <App dbResult={dbResult} />
      </BrowserRouter>
    </StrictMode>,
  )

  // Campaign membership is cloud-only and not needed for first paint — load it
  // after render (it no-ops offline).
  void useCampaignStore.getState().load()
}

bootstrap()
