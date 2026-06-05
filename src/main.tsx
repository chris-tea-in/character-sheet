import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/globals.css'
import { initDb, type DbInitResult } from './storage'

const root = createRoot(document.getElementById('root')!)

async function bootstrap() {
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

  root.render(
    <StrictMode>
      <BrowserRouter>
        <App dbResult={dbResult} />
      </BrowserRouter>
    </StrictMode>,
  )
}

bootstrap()
