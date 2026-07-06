import { Eye, EyeOff, X } from 'lucide-react'
import { EffectBuilder } from './EffectBuilder'
import { specToLedgerCustom } from '@/lib/effectSpec'
import { generateId } from '@/lib/uuid'
import type { EffectSpec } from '@/lib/effectSpec'
import type { Character, NewCharacter, LedgerOverrides } from '@/types/character'

/**
 * Always-on character effects (Modifier Ledger, Step 6c / Phase 2). The DM or player
 * grants a bonus or advantage/disadvantage straight onto the character — not tied to
 * an item. Numeric grants land in ledgerOverrides.custom (applied by deriveCharacterStats,
 * 6a); advantage/disadvantage grants land in ledgerOverrides.customAdvDis (6c). Each is
 * disable-able (kept, struck-through, re-enableable) or removable, like any ledger row.
 */
export function CustomEffectsBlock({
  character,
  onSave,
}: {
  character: Character
  onSave: (changes: Partial<NewCharacter>) => void
}) {
  const lo = character.ledgerOverrides

  function handleAdd(spec: EffectSpec) {
    const grants = specToLedgerCustom(spec, generateId())
    if (!grants.length) return
    const custom = { ...lo.custom }
    const customAdvDis = [...(lo.customAdvDis ?? [])]
    const customGrants = [...(lo.customGrants ?? [])]
    for (const g of grants) {
      if (g.kind === 'number') custom[g.targetKey] = [...(custom[g.targetKey] ?? []), g.mod]
      else if (g.kind === 'advdis') customAdvDis.push(g.entry)
      else customGrants.push(g.entry)
    }
    onSave({ ledgerOverrides: { ...lo, custom, customAdvDis, customGrants } })
  }

  // Distinct grants (dedup by id — a single "all saves" numeric grant spans 6 targets).
  const seen = new Set<string>()
  const grants: { id: string; label: string }[] = []
  for (const mods of Object.values(lo.custom)) {
    for (const m of mods) if (!seen.has(m.id)) { seen.add(m.id); grants.push({ id: m.id, label: m.label }) }
  }
  for (const a of lo.customAdvDis ?? []) {
    // Situational grants show their clause (they're opt-in chips at roll time, not standing).
    if (!seen.has(a.id)) { seen.add(a.id); grants.push({ id: a.id, label: a.condition ? `${a.label} — only ${a.condition}` : a.label }) }
  }
  for (const g of lo.customGrants ?? []) {
    if (!seen.has(g.id)) { seen.add(g.id); grants.push({ id: g.id, label: g.label }) }
  }

  function toggleDisable(id: string) {
    const has = lo.disabled.includes(id)
    onSave({ ledgerOverrides: { ...lo, disabled: has ? lo.disabled.filter(d => d !== id) : [...lo.disabled, id] } })
  }

  function remove(id: string) {
    const custom: LedgerOverrides['custom'] = {}
    for (const [k, mods] of Object.entries(lo.custom)) {
      const kept = mods.filter(m => m.id !== id)
      if (kept.length) custom[k] = kept
    }
    onSave({
      ledgerOverrides: {
        ...lo,
        custom,
        customAdvDis: (lo.customAdvDis ?? []).filter(a => a.id !== id),
        customGrants: (lo.customGrants ?? []).filter(g => g.id !== id),
        disabled: lo.disabled.filter(d => d !== id),
      },
    })
  }

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Custom Effects
      </h2>
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        {grants.length > 0 && (
          <ul className="space-y-1">
            {grants.map(g => {
              const disabled = lo.disabled.includes(g.id)
              return (
                <li key={g.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={() => toggleDisable(g.id)}
                      className="flex-none text-muted-foreground hover:text-foreground transition-colors"
                      title={disabled ? 'Re-enable' : 'Disable'}
                    >
                      {disabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <span
                      className={`truncate ${disabled ? 'line-through opacity-40' : ''}`}
                      style={{ color: disabled ? undefined : 'var(--color-accent-gold)' }}
                    >
                      {g.label}
                    </span>
                  </span>
                  <button
                    onClick={() => remove(g.id)}
                    className="flex-none text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove effect"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <EffectBuilder mode="grant" caption="Add an always-on effect" onAdd={handleAdd} />

        <p className="text-[11px] text-muted-foreground">
          Always-on bonuses, advantage/disadvantage, resistances + languages applied directly to this
          character (e.g. a DM buff). Toggle off to suppress a grant or remove it here.
        </p>
      </div>
    </section>
  )
}
