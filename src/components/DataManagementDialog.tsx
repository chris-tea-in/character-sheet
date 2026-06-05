import { useRef, useState } from 'react'
import { Download, Upload, Database, User, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { exportDb, importDb, exportCharacter, importCharacter } from '@/lib/importExport'
import { useCharacterStore } from '@/store/characters'
import type { Character } from '@/types/character'

type View = 'main' | 'confirm-db-import'

interface Props {
  open: boolean
  onClose: () => void
  onCharacterImported: (character: Character) => void
}

export function DataManagementDialog({ open, onClose, onCharacterImported }: Props) {
  const characters = useCharacterStore(s => s.characters)
  const [view, setView] = useState<View>('main')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  const dbFileRef = useRef<HTMLInputElement>(null)
  const charFileRef = useRef<HTMLInputElement>(null)

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setView('main')
      setPendingFile(null)
      setError('')
      setImporting(false)
      onClose()
    }
  }

  function handleDbFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setPendingFile(file)
    setError('')
    setView('confirm-db-import')
  }

  function handleCharFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setError('')
    setImporting(true)
    importCharacter(file)
      .then(character => {
        onCharacterImported(character)
        onClose()
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Import failed.'))
      .finally(() => setImporting(false))
  }

  async function handleConfirmDbImport() {
    if (!pendingFile) return
    setImporting(true)
    setError('')
    try {
      await importDb(pendingFile)
      // page reloads — nothing runs after this
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
      setImporting(false)
      setView('main')
    }
  }

  function handleExportCurrentDb() {
    exportDb().catch(console.error)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {view === 'main' ? (
          <MainView
            characters={characters}
            importing={importing}
            error={error}
            dbFileRef={dbFileRef}
            charFileRef={charFileRef}
            onDbFileChange={handleDbFileChange}
            onCharFileChange={handleCharFileChange}
          />
        ) : (
          <ConfirmDbImportView
            filename={pendingFile?.name ?? ''}
            importing={importing}
            error={error}
            onConfirm={handleConfirmDbImport}
            onCancel={() => { setView('main'); setPendingFile(null) }}
            onExportCurrent={handleExportCurrentDb}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function MainView({
  characters,
  importing,
  error,
  dbFileRef,
  charFileRef,
  onDbFileChange,
  onCharFileChange,
}: {
  characters: Character[]
  importing: boolean
  error: string
  dbFileRef: React.RefObject<HTMLInputElement | null>
  charFileRef: React.RefObject<HTMLInputElement | null>
  onDbFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCharFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Import / Export</DialogTitle>
      </DialogHeader>

      <div className="space-y-5 py-1">
        {/* Full database */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            All Characters
          </h3>
          <p className="text-xs text-muted-foreground">
            Export every character as a single SQLite file you can back up or import on another device.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => exportDb().catch(console.error)}>
              <Download className="h-3.5 w-3.5" />
              Export all (.sqlite)
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={importing}
              onClick={() => dbFileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {importing ? 'Importing…' : 'Import database'}
            </Button>
          </div>
          <input
            ref={dbFileRef}
            type="file"
            accept=".sqlite,.db"
            className="hidden"
            onChange={onDbFileChange}
          />
        </section>

        <div className="border-t border-border" />

        {/* Single character */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            Single Character
          </h3>
          <p className="text-xs text-muted-foreground">
            Export one character as JSON, or import a previously exported character file.
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={importing}
            onClick={() => charFileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {importing ? 'Importing…' : 'Import character (.json)'}
          </Button>
          <input
            ref={charFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={onCharFileChange}
          />

          {characters.length > 0 && (
            <div className="space-y-1 pt-1">
              {characters.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="text-sm truncate min-w-0">{c.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-none h-7 px-2 text-xs"
                    onClick={() => exportCharacter(c).catch(console.error)}
                  >
                    <Download className="h-3 w-3" />
                    Export
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Close</Button>
        </DialogClose>
      </DialogFooter>
    </>
  )
}

function ConfirmDbImportView({
  filename,
  importing,
  error,
  onConfirm,
  onCancel,
  onExportCurrent,
}: {
  filename: string
  importing: boolean
  error: string
  onConfirm: () => void
  onCancel: () => void
  onExportCurrent: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-accent)]" />
          Replace all data?
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3 py-1 text-sm">
        <p>
          Importing <span className="font-medium">{filename}</span> will replace your entire
          character database. This cannot be undone.
        </p>
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <Download className="h-3.5 w-3.5 flex-none text-muted-foreground" />
          <p className="text-xs text-muted-foreground flex-1">
            Back up your current characters before continuing.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="flex-none h-7 px-2 text-xs"
            disabled={importing}
            onClick={onExportCurrent}
          >
            Export now
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel} disabled={importing}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={onConfirm}
          disabled={importing}
        >
          {importing ? 'Importing…' : 'Replace & reload'}
        </Button>
      </DialogFooter>
    </>
  )
}
