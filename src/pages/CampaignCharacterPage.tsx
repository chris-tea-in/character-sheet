import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CharacterSheetBlocks } from '@/components/sheet/CharacterSheetBlocks'
import { useDerivedSheet, type SheetReferenceData } from '@/components/sheet/useDerivedSheet'
import { DiceTray } from '@/components/sheet/DiceTray'
import { DiceRollModal } from '@/components/sheet/DiceRollModal'
import { loadSetupData, loadEquipmentData, loadFeatsData } from '@/lib/data'
import { slugToTitle } from '@/lib/characterSetup'
import { campaignCharacters, pushCharacter } from '@/lib/syncApi'
import type { Character, NewCharacter } from '@/types/character'
import { normalizeNewCharacter } from '@/types/character'

const PUSH_DEBOUNCE_MS = 1_200

export default function CampaignCharacterPage() {
  const { id: campaignId, charId } = useParams<{ id: string; charId: string }>()
  const navigate = useNavigate()

  const [data, setData] = useState<SheetReferenceData>({ setupData: null, equipmentCatalog: null, featData: null })
  const [character, setCharacter] = useState<Character | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading')
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState(false)

  // Debounced remote field-scoped push (the DM edits a record they don't own
  // locally, so this goes straight to the API rather than the local store).
  const patchRef = useRef<Partial<NewCharacter>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const metaRef = useRef<{ id: string; createdAt: number } | null>(null)

  useEffect(() => {
    Promise.all([loadSetupData(), loadEquipmentData(), loadFeatsData()])
      .then(([setupData, equipmentCatalog, featData]) => setData({ setupData, equipmentCatalog, featData }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!campaignId || !charId) return
    let cancelled = false
    campaignCharacters(campaignId).then(res => {
      if (cancelled) return
      if (!res.ok) { setLoadState('error'); return }
      const row = res.data.find(r => r.id === charId)
      if (!row) { setLoadState('notfound'); return }
      metaRef.current = { id: row.id, createdAt: row.createdAt }
      // row.data is untrusted JSON typed as NewCharacter — normalize so a record
      // missing a field can't crash the sheet (this is the one path that doesn't
      // round-trip through the local DB's column defaults).
      setCharacter({ id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt, ...normalizeNewCharacter(row.data) })
      setLoadState('ready')
    })
    return () => { cancelled = true }
  }, [campaignId, charId])

  async function flushPatch() {
    timerRef.current = null
    const meta = metaRef.current
    const patch = patchRef.current
    patchRef.current = {}
    if (!meta || Object.keys(patch).length === 0) return
    const res = await pushCharacter({ id: meta.id, createdAt: meta.createdAt, updatedAt: Date.now(), patch })
    setSaveError(!res.ok)
  }

  // Flush any pending edit when leaving the page.
  useEffect(() => () => { if (timerRef.current) { clearTimeout(timerRef.current); void flushPatch() } }, [])

  function handleSave(changes: Partial<NewCharacter>) {
    setCharacter(c => c ? { ...c, ...changes, updatedAt: Date.now() } : c)
    patchRef.current = { ...patchRef.current, ...changes }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flushPatch() }, PUSH_DEBOUNCE_MS)
  }

  function toggleEditing() {
    if (editing && timerRef.current) { clearTimeout(timerRef.current); void flushPatch() }
    setEditing(e => !e)
  }

  const sub = character
    ? (character.classes?.length
        ? character.classes.map(c => `${slugToTitle(c.classSlug)} ${c.level}`).join(' / ')
        : (character.class ? `${slugToTitle(character.class)} ${character.level}` : `Level ${character.level}`))
    : ''

  return (
    <div className="min-h-dvh flex flex-col pb-[52px]">
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(`/campaign/${campaignId}`)}
            className="text-muted-foreground hover:text-foreground transition-colors flex-none"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold leading-tight truncate">{character?.name || 'Character'}</p>
            <p className="text-sm text-muted-foreground truncate">
              {sub}{editing ? ' · editing' : ''}{saveError ? ' · save failed' : ''}
            </p>
          </div>
          {loadState === 'ready' && (
            <Button size="sm" variant={editing ? 'default' : 'outline'} onClick={toggleEditing}>
              {editing ? <><Eye className="h-4 w-4" />View</> : <><Pencil className="h-4 w-4" />Edit</>}
            </Button>
          )}
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {loadState === 'loading' && <p className="text-muted-foreground py-12 text-center">Loading character…</p>}
          {loadState === 'notfound' && <p className="text-muted-foreground py-12 text-center">This character isn’t in the campaign anymore.</p>}
          {loadState === 'error' && <p className="text-destructive py-12 text-center">Couldn’t load this character. You may not have access.</p>}
          {loadState === 'ready' && character && (
            <CampaignSheetBody character={character} data={data} onSave={handleSave} readOnly={!editing} />
          )}
        </div>
      </main>
    </div>
  )
}

// Rendered only once the character is loaded, so the derivation/roll hooks always
// run with a non-null character (keeps hook order stable across the async load).
function CampaignSheetBody({
  character, data, onSave, readOnly,
}: {
  character: Character
  data: SheetReferenceData
  onSave: (changes: Partial<NewCharacter>) => void
  readOnly: boolean
}) {
  const { derived } = useDerivedSheet(character, data)
  return (
    <>
      <CharacterSheetBlocks character={character} data={data} onSave={onSave} readOnly={readOnly} />
      <DiceTray derived={derived} />
      <DiceRollModal />
    </>
  )
}
