import { useEffect, useRef, useState } from 'react'
import { Download, Upload, Database, User, AlertTriangle, RotateCcw } from 'lucide-react'
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
import { getDb, flush } from '@/storage'
import { insertBackup, listBackups, type CharacterBackup } from '@/storage/characterRepo'
import type { Character } from '@/types/character'

type View = 'main' | 'confirm-db-import' | 'restore'

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

interface Props {
  open: boolean
  onClose: () => void
  onCharacterImported: (character: Character) => void
}

export function DataManagementDialog({ open, onClose, onCharacterImported }: Props) {
  const characters = useCharacterStore(s => s.characters)
  const update = useCharacterStore(s => s.update)
  const [view, setView] = useState<View>('main')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')

  // Local rollback snapshots (H7): how many each character has, plus the open
  // restore session's character + its snapshots.
  const [backupCounts, setBackupCounts] = useState<Map<string, number>>(new Map())
  const [restoreCharId, setRestoreCharId] = useState<string | null>(null)
  const [backups, setBackups] = useState<CharacterBackup[]>([])
  const [restoring, setRestoring] = useState(false)

  const dbFileRef = useRef<HTMLInputElement>(null)
  const charFileRef = useRef<HTMLInputElement>(null)

  // Count snapshots when the dialog opens so the main view can show a Restore
  // affordance only for characters that actually have any.
  useEffect(() => {
    if (!open) return
    const db = getDb()
    const counts = new Map<string, number>()
    for (const c of characters) {
      const n = listBackups(db, c.id).length
      if (n > 0) counts.set(c.id, n)
    }
    setBackupCounts(counts)
  }, [open, characters])

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setView('main')
      setPendingFile(null)
      setError('')
      setImporting(false)
      setRestoreCharId(null)
      setBackups([])
      setRestoring(false)
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
    exportDb().catch(err => {
      if ((err as Error)?.name !== 'AbortError')
        setError(err instanceof Error ? err.message : 'Export failed.')
    })
  }

  function handleExportCharacter(character: Character) {
    exportCharacter(character).catch(err => {
      if ((err as Error)?.name !== 'AbortError')
        setError(err instanceof Error ? err.message : 'Export failed.')
    })
  }

  function openRestore(charId: string) {
    setRestoreCharId(charId)
    setBackups(listBackups(getDb(), charId))
    setError('')
    setView('restore')
  }

  async function handleRestore(backup: CharacterBackup) {
    if (!restoreCharId) return
    setRestoring(true)
    setError('')
    try {
      // Snapshot the current local state first so restoring is itself reversible.
      const current = characters.find(c => c.id === restoreCharId)
      if (current) {
        const { id: _i, createdAt: _c, updatedAt: _u, ...data } = current
        insertBackup(getDb(), restoreCharId, data, current.updatedAt)
        await flush()
      }
      await update(restoreCharId, backup.data)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.')
      setRestoring(false)
    }
  }

  const restoreChar = characters.find(c => c.id === restoreCharId)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {view === 'main' && (
          <MainView
            characters={characters}
            importing={importing}
            error={error}
            backupCounts={backupCounts}
            dbFileRef={dbFileRef}
            charFileRef={charFileRef}
            onDbFileChange={handleDbFileChange}
            onCharFileChange={handleCharFileChange}
            onExportDb={handleExportCurrentDb}
            onExportCharacter={handleExportCharacter}
            onRestore={openRestore}
          />
        )}
        {view === 'confirm-db-import' && (
          <ConfirmDbImportView
            filename={pendingFile?.name ?? ''}
            importing={importing}
            error={error}
            onConfirm={handleConfirmDbImport}
            onCancel={() => { setView('main'); setPendingFile(null) }}
            onExportCurrent={handleExportCurrentDb}
          />
        )}
        {view === 'restore' && (
          <RestoreView
            charName={restoreChar?.name ?? 'Character'}
            backups={backups}
            restoring={restoring}
            error={error}
            onRestore={handleRestore}
            onBack={() => { setView('main'); setRestoreCharId(null); setBackups([]); setError('') }}
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
  backupCounts,
  dbFileRef,
  charFileRef,
  onDbFileChange,
  onCharFileChange,
  onExportDb,
  onExportCharacter,
  onRestore,
}: {
  characters: Character[]
  importing: boolean
  error: string
  backupCounts: Map<string, number>
  dbFileRef: React.RefObject<HTMLInputElement | null>
  charFileRef: React.RefObject<HTMLInputElement | null>
  onDbFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCharFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onExportDb: () => void
  onExportCharacter: (c: Character) => void
  onRestore: (charId: string) => void
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
            <Button size="sm" variant="outline" onClick={onExportDb}>
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
            Export one character as JSON, or import a previously exported character file. A
            <RotateCcw className="inline h-3 w-3 mx-0.5" /> Restore appears when a character has local
            snapshots saved before a cloud sync replaced it.
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
                  <div className="flex-none flex items-center gap-1">
                    {(backupCounts.get(c.id) ?? 0) > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onRestore(c.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onExportCharacter(c)}
                    >
                      <Download className="h-3 w-3" />
                      Export
                    </Button>
                  </div>
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
          <AlertTriangle className="h-4 w-4 text-[var(--color-accent-red)]" />
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

function RestoreView({
  charName,
  backups,
  restoring,
  error,
  onRestore,
  onBack,
}: {
  charName: string
  backups: CharacterBackup[]
  restoring: boolean
  error: string
  onRestore: (backup: CharacterBackup) => void
  onBack: () => void
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Restore “{charName}”
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-3 py-1 text-sm">
        <p className="text-xs text-muted-foreground">
          Local snapshots saved automatically before a cloud sync replaced this character. Restoring
          makes the chosen snapshot the current version and re-syncs it. Your current version is
          snapshotted first, so this is reversible.
        </p>
        <div className="space-y-1">
          {backups.length === 0 && <p className="text-xs text-muted-foreground">No snapshots.</p>}
          {backups.map(b => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <span className="text-xs">{formatTime(b.backedUpAt)}</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={restoring}
                onClick={() => onRestore(b)}
              >
                {restoring ? 'Restoring…' : 'Restore'}
              </Button>
            </div>
          ))}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onBack} disabled={restoring}>
          Back
        </Button>
      </DialogFooter>
    </>
  )
}
