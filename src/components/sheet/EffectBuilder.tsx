import { useState } from 'react'
import { X } from 'lucide-react'
import { SKILL_DISPLAY_MAP } from '@/lib/dice'
import { specLabel } from '@/lib/effectSpec'
import type { EffectSpec, NumberTarget, RollTarget, GrantTarget } from '@/lib/effectSpec'
import type { AbilityName, SkillName } from '@/types/character'

const ABILITIES: AbilityName[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const SKILLS = Object.keys(SKILL_DISPLAY_MAP) as SkillName[]
const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
]

const fieldClass =
  'bg-[var(--color-surface-2)] text-foreground border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring'
const selectClass = `${fieldClass} [color-scheme:dark]`

function parseTarget(v: string): NumberTarget {
  const [head, arg] = v.split(':')
  if (head === 'ability') return { t: 'ability', ability: arg as AbilityName }
  if (head === 'save') return { t: 'save', ability: arg as AbilityName | 'all' }
  if (head === 'skill') return { t: 'skill', skill: arg as SkillName }
  return { t: head as 'ac' | 'speed' | 'initiative' | 'maxHp' | 'weaponAttack' | 'spellAttack' | 'spellSaveDC' | 'spellDamage' | 'damage' }
}

/**
 * Reusable effect authoring control: pick a target (ability, AC, speed, a save, a
 * skill, …) and a value (a numeric bonus, or advantage/disadvantage on a save/skill).
 * Emits a list of neutral EffectSpecs; the parent translates them (e.g. specToItemEffect).
 */
export function EffectBuilder({
  effects = [],
  onChange,
  onAdd,
  caption = 'Effects (while equipped)',
  mode = 'item',
}: {
  // Accumulation mode (item dialog): bind effects + onChange; the builder shows the list.
  effects?: EffectSpec[]
  onChange?: (next: EffectSpec[]) => void
  // Immediate mode (grant panel): each Add fires onAdd; the parent renders its own list.
  onAdd?: (spec: EffectSpec) => void
  caption?: string
  // 'grant' hides item-only targets (weapon to-hit/damage, spell damage) that have no
  // always-on ledger home.
  mode?: 'item' | 'grant'
}) {
  const [target, setTarget] = useState('ability:str')
  const [valueKind, setValueKind] = useState<'number' | 'adv' | 'dis'>('number')
  const [amount, setAmount] = useState('1')
  const [grantValue, setGrantValue] = useState('')
  const [grantAmount, setGrantAmount] = useState('60')

  const isGrant = target.startsWith('grant:')
  const grantTarget = isGrant ? (target.split(':')[1] as GrantTarget) : null
  const parsed = isGrant ? null : parseTarget(target)
  const advDisAllowed = !!parsed && (parsed.t === 'save' || parsed.t === 'skill')
  // skill/save proficiency + sense pick from a dropdown / typed name, not a free text field.
  const grantUsesSelect = grantTarget === 'skillProf' || grantTarget === 'saveProf'

  function pickTarget(v: string) {
    setTarget(v)
    if (v === 'grant:skillProf') setGrantValue(SKILLS[0])
    else if (v === 'grant:saveProf') setGrantValue('con')
    else if (v === 'grant:sense') setGrantValue('Darkvision')
    else if (v.startsWith('grant:')) setGrantValue('')
    else {
      const p = parseTarget(v)
      if (!(p.t === 'save' || p.t === 'skill')) setValueKind('number')
    }
  }

  function emit(spec: EffectSpec) {
    if (onAdd) onAdd(spec)
    else onChange?.([...effects, spec])
  }

  function add() {
    if (isGrant) {
      if (grantTarget === 'sense') {
        const r = Math.trunc(Number(grantAmount))
        emit({ kind: 'grant', target: 'sense', value: grantValue.trim() || 'Darkvision', amount: Number.isFinite(r) && r > 0 ? r : undefined })
        return
      }
      const v = grantValue.trim()
      if (!v) return
      emit({ kind: 'grant', target: grantTarget!, value: v })
      if (!grantUsesSelect) setGrantValue('')
      return
    }
    if (advDisAllowed && valueKind !== 'number') {
      emit({ kind: 'advdis', target: parsed as RollTarget, mode: valueKind === 'adv' ? 'adv' : 'dis' })
      return
    }
    const n = Math.trunc(Number(amount))
    if (!Number.isFinite(n) || n === 0) return
    emit({ kind: 'number', target: parsed!, amount: n })
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-muted-foreground">{caption}</span>

      {effects.length > 0 && (
        <ul className="space-y-1">
          {effects.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm rounded border border-border px-2 py-1">
              <span style={{ color: 'var(--color-accent-gold)' }}>{specLabel(e)}</span>
              <button
                type="button"
                onClick={() => onChange?.(effects.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove effect"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <select value={target} onChange={e => pickTarget(e.target.value)} className={`${selectClass} flex-1 min-w-[8rem]`}>
          <optgroup label="Ability score">
            {ABILITIES.map(a => <option key={a} value={`ability:${a}`}>{a.toUpperCase()}</option>)}
          </optgroup>
          <optgroup label="Combat">
            <option value="ac">Armor Class</option>
            <option value="speed">Speed</option>
            <option value="initiative">Initiative</option>
            <option value="maxHp">Max HP</option>
            {mode === 'item' && <option value="weaponAttack">Weapon attack (to-hit)</option>}
            {mode === 'item' && <option value="damage">Weapon damage</option>}
          </optgroup>
          <optgroup label="Spellcasting">
            <option value="spellAttack">Spell attack (to-hit)</option>
            <option value="spellSaveDC">Spell save DC</option>
            {mode === 'item' && <option value="spellDamage">Spell damage</option>}
          </optgroup>
          <optgroup label="Saving throw">
            {ABILITIES.map(a => <option key={a} value={`save:${a}`}>{a.toUpperCase()} save</option>)}
            <option value="save:all">All saves</option>
          </optgroup>
          <optgroup label="Skill">
            {SKILLS.map(s => <option key={s} value={`skill:${s}`}>{SKILL_DISPLAY_MAP[s]}</option>)}
          </optgroup>
          <optgroup label="Defenses & languages">
            <option value="grant:resistance">Resistance</option>
            <option value="grant:immunity">Immunity</option>
            <option value="grant:language">Language</option>
          </optgroup>
          {mode === 'grant' && (
            <optgroup label="Proficiency & senses">
              <option value="grant:skillProf">Skill proficiency</option>
              <option value="grant:saveProf">Save proficiency</option>
              <option value="grant:sense">Sense (darkvision …)</option>
            </optgroup>
          )}
        </select>

        {/* Grant value control varies by grant target */}
        {grantUsesSelect && (
          <select value={grantValue} onChange={e => setGrantValue(e.target.value)} className={`${selectClass} flex-1 min-w-[6rem]`} aria-label="Grant">
            {grantTarget === 'skillProf'
              ? SKILLS.map(s => <option key={s} value={s}>{SKILL_DISPLAY_MAP[s]}</option>)
              : ABILITIES.map(a => <option key={a} value={a}>{a.toUpperCase()} save</option>)}
          </select>
        )}
        {isGrant && grantTarget === 'sense' && (
          <>
            <input
              value={grantValue}
              onChange={e => setGrantValue(e.target.value)}
              placeholder="Sense"
              className={`${fieldClass} flex-1 min-w-[5rem]`}
              aria-label="Sense"
            />
            <input
              type="number" min={0}
              value={grantAmount}
              onChange={e => setGrantAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add() }}
              className={`${fieldClass} w-16 text-right [color-scheme:dark] flex-none`}
              aria-label="Range (ft)"
            />
          </>
        )}
        {isGrant && !grantUsesSelect && grantTarget !== 'sense' && (
          <input
            value={grantValue}
            onChange={e => setGrantValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') add() }}
            list={grantTarget === 'language' ? undefined : 'effect-damage-types'}
            placeholder={grantTarget === 'language' ? 'Language' : 'Damage type'}
            className={`${fieldClass} flex-1 min-w-[6rem]`}
            aria-label={grantTarget === 'language' ? 'Language' : 'Damage type'}
          />
        )}
        <datalist id="effect-damage-types">
          {DAMAGE_TYPES.map(t => <option key={t} value={t} />)}
        </datalist>

        {!isGrant && advDisAllowed && (
          <div className="flex rounded border border-border overflow-hidden text-xs flex-none">
            {(['number', 'adv', 'dis'] as const).map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setValueKind(k)}
                className="px-2 py-1.5 transition-colors"
                style={{ background: valueKind === k ? 'var(--color-accent-gold)' : undefined, color: valueKind === k ? '#000' : undefined }}
              >
                {k === 'number' ? 'Bonus' : k === 'adv' ? 'Adv' : 'Dis'}
              </button>
            ))}
          </div>
        )}

        {!isGrant && (!advDisAllowed || valueKind === 'number') && (
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className={`${fieldClass} w-16 text-right [color-scheme:dark] flex-none`}
            aria-label="Amount"
          />
        )}

        <button
          type="button"
          onClick={add}
          className="text-xs px-2.5 py-1.5 rounded border border-border hover:bg-secondary transition-colors flex-none"
        >
          Add
        </button>
      </div>
    </div>
  )
}
