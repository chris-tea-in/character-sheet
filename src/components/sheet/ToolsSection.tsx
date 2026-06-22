import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { buildCustomTool } from '@/lib/customContent'
import type { Character, NewCharacter } from '@/types/character'
import type { ClassData, EquipmentData, ToolItem } from '@/types/data'
import type { SelectionEntry } from '@/components/SelectionList'

const TOOL_CATEGORIES: ToolItem['tool_category'][] = [
  "Artisan's Tools", 'Gaming Set', 'Musical Instrument', 'Other',
]
const fieldClass =
  'w-full bg-[var(--color-surface-2)] text-foreground border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring'

/**
 * Tool proficiencies, styled as an Equipment section card. Lives on the
 * character sheet between Items and Currency (relocated from the old
 * Proficiencies "Tools" tab). `toolProficiencies` is a free-form string[] —
 * no derive tier — so this is a pure read/write of the stored field. Homebrew
 * tools (#6d) are stored as catalog-shaped defs in `customTools` (so they appear
 * in the picker) and the name is also added to `toolProficiencies`.
 */
export function ToolsSection({
  character,
  catalog,
  classRecord,
  onSave,
}: {
  character: Character
  catalog?: EquipmentData | null
  classRecord: ClassData | null
  onSave: (changes: Partial<NewCharacter>) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customCategory, setCustomCategory] = useState<ToolItem['tool_category']>("Artisan's Tools")

  useEffect(() => {
    if (customOpen) { setCustomName(''); setCustomCategory("Artisan's Tools") }
  }, [customOpen])

  const catalogTools: SelectionEntry[] = (catalog?.tools ?? []).map(t => ({
    slug: t.name,
    detail: { name: t.name, subtitle: t.tool_category, sections: [] },
    group: t.tool_category,
  }))

  const granted = new Set(classRecord?.tool_proficiencies ?? [])
  const current = character.toolProficiencies ?? []

  function addTool(name: string) {
    if (!current.includes(name)) onSave({ toolProficiencies: [...current, name] })
    setPickerOpen(false)
  }

  function removeTool(name: string) {
    onSave({ toolProficiencies: current.filter(t => t !== name) })
  }

  // Store the custom tool def (so it lists in the picker like a catalog tool) AND
  // grant proficiency in one write.
  function createCustomTool() {
    const tool = buildCustomTool({ name: customName, toolCategory: customCategory })
    if (!tool.name) return
    const changes: Partial<NewCharacter> = {
      customTools: [...(character.customTools ?? []), tool],
    }
    if (!current.includes(tool.name)) changes.toolProficiencies = [...current, tool.name]
    onSave(changes)
    setCustomOpen(false)
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Tools
      </p>
      {current.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tool proficiencies.</p>
      ) : (
        <div className="divide-y divide-border">
          {current.map(name => (
            <div key={name} className="flex items-center gap-3 py-1.5">
              <span className="flex-1 text-sm truncate">{name}</span>
              {granted.has(name) && (
                <span className="text-[10px] uppercase tracking-wide flex-none" style={{ color: 'var(--color-accent-gold)' }}>
                  class
                </span>
              )}
              <button
                onClick={() => removeTool(name)}
                className="text-muted-foreground hover:text-destructive transition-colors flex-none"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Tool
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCustomOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Custom
        </Button>
      </div>

      <SelectionList
        entries={catalogTools}
        value=""
        title="Add Tool Proficiency"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addTool}
      />

      <Dialog open={customOpen} onOpenChange={o => { if (!o) setCustomOpen(false) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Custom Tool</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Name</span>
              <input
                autoFocus
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="e.g. Glassblower's Tools"
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-muted-foreground">Category</span>
              <select
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value as ToolItem['tool_category'])}
                className={`${fieldClass} [color-scheme:dark]`}
              >
                {TOOL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>Cancel</Button>
            <Button onClick={createCustomTool} disabled={!customName.trim()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
