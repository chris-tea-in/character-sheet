import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import type { Character, NewCharacter } from '@/types/character'
import type { ClassData, EquipmentData } from '@/types/data'
import type { SelectionEntry } from '@/components/SelectionList'

/**
 * Tool proficiencies, styled as an Equipment section card. Lives on the
 * character sheet between Items and Currency (relocated from the old
 * Proficiencies "Tools" tab). `toolProficiencies` is a free-form string[] —
 * no derive tier — so this is a pure read/write of the stored field.
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setPickerOpen(true)}
        className="text-muted-foreground hover:text-foreground mt-2"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Tool
      </Button>

      <SelectionList
        entries={catalogTools}
        value=""
        title="Add Tool Proficiency"
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addTool}
      />
    </div>
  )
}
