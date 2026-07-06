// Combat tab (plan Phase E): everything you can do on your turn, grouped by
// action economy — weapon attacks, castable spells (with slot availability +
// upcast pick), class abilities, and the static SRD generic actions — plus a
// two-slot turn queue (Action / Bonus Action) with commit-spends-once semantics
// and a session-only history (src/store/combatLog.ts).
//
// No math lives here: weapons come from the shared useWeaponActions assembly,
// spells reuse SpellBlock's dispatch payload shapes (derived.spellAttackBonus +
// breakdown rows), abilities use the same resolveResourceMax/earnedAbilities as
// ClassAbilitiesSection. Rolls stay MANUAL via the existing DiceRollModal —
// committing a turn only spends resources, it never rolls.
import { useEffect, useMemo, useState } from 'react'
import { RollButton } from '@/components/sheet/RollButton'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { useDiceStore } from '@/store/dice'
import { summarizeItemEffects } from '@/lib/characterStats'
import { useWeaponActions, characterWeapons, buildCatalogMaps, isItemActive } from '@/lib/weaponActions'
import { earnedAbilities, owningClassLevel, resolveResourceMax } from '@/lib/classFeatures'
import { normalizeCastingTime } from '@/lib/actionEconomy'
import type { ActionEconomy } from '@/lib/actionEconomy'
import { getSpellcastingInfo, PACT_SLOT_KEY } from '@/lib/spellcasting'
import type { SpellcastingProfile } from '@/lib/spellcasting'
import { ORDINALS, componentStr } from '@/lib/spells'
import { lookupFeatureDescription } from '@/lib/data'
import type { FeatureDescriptions } from '@/lib/data'
import { parseSpellDamage } from '@/lib/spellDamage'
import { parseSpellHeal } from '@/lib/spellHeal'
import { mergeCustomSpells, mergeCustomEquipment } from '@/lib/customContent'
import { loadSpellsData } from '@/lib/data'
import { abilityModifier } from '@/lib/dice'
import { ABILITY_FULL_TO_SHORT } from '@/lib/characterSetup'
import { useCombatLogStore } from '@/store/combatLog'
import type { QueuedEntry, QueueSlotKey } from '@/store/combatLog'
import { cn } from '@/lib/utils'
import type { Character, CharacterSpell, NewCharacter } from '@/types/character'
import type { ClassAbility, ClassData, EquipmentData, SpellData } from '@/types/data'
import type { DerivedStats } from '@/lib/characterStats'

const normalizeSlug = (slug: string) => slug.replace(/^spell:/, '')

// Static SRD generic actions — a data constant, no rules engine.
const GENERIC_ACTIONS: { name: string; economy: ActionEconomy; desc: string }[] = [
  { name: 'Dash', economy: 'action', desc: 'Gain extra movement equal to your speed for the turn.' },
  { name: 'Disengage', economy: 'action', desc: "Your movement doesn't provoke opportunity attacks for the rest of the turn." },
  { name: 'Dodge', economy: 'action', desc: 'Until your next turn: attacks against you have disadvantage and you make DEX saves with advantage (lost if incapacitated or speed 0).' },
  { name: 'Help', economy: 'action', desc: 'Give an ally advantage on their next ability check, or on their next attack against a creature within 5 feet of you.' },
  { name: 'Hide', economy: 'action', desc: 'Make a Dexterity (Stealth) check to become hidden.' },
  { name: 'Ready', economy: 'action', desc: 'Choose a trigger and a response; use your reaction when it occurs before your next turn.' },
  { name: 'Search', economy: 'action', desc: 'Devote your attention to finding something (Wisdom (Perception) or Intelligence (Investigation)).' },
  { name: 'Use an Object', economy: 'action', desc: 'Interact with a second object on your turn, or use an object that requires an action.' },
  { name: 'Opportunity Attack', economy: 'reaction', desc: 'When a hostile creature you can see moves out of your reach, make one melee attack against it.' },
]

interface SlotOption {
  key: number            // spellSlotsUsed key: 1–9 or PACT_SLOT_KEY
  castLevel: number      // the level the spell is cast at
  label: string
  remaining: number
}

function slotOptions(profile: SpellcastingProfile, slotsUsed: Partial<Record<number, number>>): SlotOption[] {
  const out: SlotOption[] = []
  if (profile.kind === 'slots' || profile.kind === 'slots+pact') {
    for (const [k, total] of Object.entries(profile.slotsByLevel)) {
      const level = Number(k)
      out.push({ key: level, castLevel: level, label: `${ORDINALS[level]}`, remaining: (total ?? 0) - (slotsUsed[level] ?? 0) })
    }
  }
  if (profile.kind === 'pact') {
    out.push({ key: PACT_SLOT_KEY, castLevel: profile.slotLevel, label: `Pact (${ORDINALS[profile.slotLevel]})`, remaining: profile.slotCount - (slotsUsed[PACT_SLOT_KEY] ?? 0) })
  }
  if (profile.kind === 'slots+pact') {
    out.push({ key: PACT_SLOT_KEY, castLevel: profile.pactSlotLevel, label: `Pact (${ORDINALS[profile.pactSlotLevel]})`, remaining: profile.pactSlotCount - (slotsUsed[PACT_SLOT_KEY] ?? 0) })
  }
  return out.sort((a, b) => a.castLevel - b.castLevel)
}

const ECONOMY_BADGE: Record<ActionEconomy, string> = { action: 'A', bonus_action: 'BA', reaction: 'R', other: '—' }

function Badge({ economy, title }: { economy: ActionEconomy; title?: string }) {
  return (
    <span
      className="text-[10px] font-bold px-1 py-0.5 rounded flex-none w-8 text-center"
      title={title}
      style={{ background: 'var(--color-surface-2)', color: 'var(--color-accent-gold)' }}
    >
      {ECONOMY_BADGE[economy]}
    </span>
  )
}

// `warn` marks a RAW-discouraged queue (second leveled spell): amber ⚠ styling,
// and the first tap flips to a red "Homebrew?" confirm — the second tap queues.
// Discouraged, never blocked.
function QueueButton({ queued, disabled, warn, confirming, onClick, title }: {
  queued: boolean
  disabled?: boolean
  warn?: boolean
  confirming?: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'text-xs px-2 py-0.5 rounded border transition-colors flex-none disabled:opacity-40',
        queued ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)]'
          : confirming ? 'border-[var(--color-accent-red)] text-[var(--color-accent-red)] font-semibold'
          : warn ? 'border-[var(--color-accent-gold)] text-[var(--color-accent-gold)]'
          : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {queued ? 'Queued' : confirming ? 'Homebrew?' : warn ? '⚠ Queue' : 'Queue'}
    </button>
  )
}

interface Props {
  character: Character
  derived: DerivedStats
  catalog: EquipmentData | null
  classRecord: ClassData | null
  classLevel: number
  classAbilities: ClassAbility[]
  featureDescriptions: FeatureDescriptions
  overrideSlotProfile?: SpellcastingProfile
  onSave: (changes: Partial<NewCharacter>) => void
}

export function CombatTab({ character, derived, catalog, classRecord, classLevel, classAbilities, featureDescriptions, overrideSlotProfile, onSave }: Props) {
  const { dispatch, dispatchDamage } = useRollDispatch(derived)
  const { assemble } = useWeaponActions(character, derived)
  const queue = useCombatLogStore(s => s.queue)
  const history = useCombatLogStore(s => s.history)
  const setSlot = useCombatLogStore(s => s.setSlot)
  const clearQueue = useCombatLogStore(s => s.clearQueue)
  const recordTurn = useCombatLogStore(s => s.recordTurn)
  const clearHistory = useCombatLogStore(s => s.clearHistory)

  // The queue is session-global; never let one character's queued costs commit
  // against another character's resources.
  useEffect(() => { clearQueue() }, [character.id, clearQueue])

  // Tap a spell/ability/action NAME to read its description (one open at a time,
  // keyed by the same stable row ids the queue uses).
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const toggleExpanded = (rowId: string) => setExpandedId(cur => (cur === rowId ? null : rowId))

  // Commit walkthrough: after spending, the queued entries' rolls fire one
  // DiceRollModal at a time — closing one opens the next. Same dispatches as the
  // row buttons (commit sequences them, it never rolls silently).
  const modal = useDiceStore(s => s.modal)
  const [pendingRolls, setPendingRolls] = useState<(() => void)[]>([])
  useEffect(() => {
    if (modal || pendingRolls.length === 0) return
    const [next, ...rest] = pendingRolls
    setPendingRolls(rest)
    next()
  }, [modal, pendingRolls])
  useEffect(() => { setPendingRolls([]) }, [character.id])

  // Soft-lock: queueing a SECOND leveled spell is RAW-discouraged — the button
  // warns and takes a confirm tap, but never blocks (homebrew allowed).
  const [confirmQueueId, setConfirmQueueId] = useState<string | null>(null)

  const [allSpells, setAllSpells] = useState<Record<string, SpellData>>({})
  useEffect(() => { loadSpellsData().then(setAllSpells).catch(() => {}) }, [])
  const spellMap = useMemo(
    () => mergeCustomSpells(allSpells, character.customSpells) ?? allSpells,
    [allSpells, character.customSpells],
  )

  const weapons = useMemo(() => characterWeapons(character, catalog), [character, catalog])

  // Loadout summary: active gear at a glance, between the Combat block and the
  // queue. Weapon numbers come from the same shared assembly as everywhere else.
  const catalogMaps = useMemo(() => buildCatalogMaps(mergeCustomEquipment(catalog, character)), [catalog, character])
  const activeItems = character.equipment.filter(e => !e.containerId && isItemActive(catalogMaps, e))

  const { profile: rawProfile, casterKind: rawCasterKind } = getSpellcastingInfo(classRecord ?? undefined, classLevel)
  const profile = overrideSlotProfile ?? rawProfile
  const isPreparedCaster = rawCasterKind === 'prepared'
  const options = slotOptions(profile, character.spellSlotsUsed)
  // Per-spell chosen spend slot (defaults to the lowest eligible with a slot left).
  const [chosenSlot, setChosenSlot] = useState<Record<string, number>>({})

  const castingShort = classRecord?.spellcasting?.ability
    ? ABILITY_FULL_TO_SHORT[classRecord.spellcasting.ability.toLowerCase()]
    : undefined
  const castingMod = castingShort ? abilityModifier(derived.effectiveAbilities[castingShort]) : 0

  // Castable spells: cantrips always; prepared casters leveled = prepared only.
  const spells = useMemo(() => {
    return character.spells
      .map(cs => ({ cs, sp: spellMap[normalizeSlug(cs.slug)] }))
      .filter(({ cs, sp }) => {
        const level = sp?.level ?? 0
        if (level === 0) return true
        return isPreparedCaster ? !!cs.prepared : true
      })
  }, [character.spells, spellMap, isPreparedCaster])

  const abilities = useMemo(() => earnedAbilities(character, classAbilities), [character, classAbilities])
  const abilityByKey = useMemo(() => new Map(abilities.map(a => [a.key, a])), [abilities])
  const abilityMax = (a: ClassAbility) =>
    a.resource ? resolveResourceMax(a.resource, owningClassLevel(character, a), derived.effectiveAbilities) : 0
  const abilityRemaining = (a: ClassAbility) => {
    const max = abilityMax(a)
    return max - Math.min(character.featureResourcesUsed[a.key] ?? 0, max)
  }

  // One place builds a spell's roll closures — the row buttons AND the commit
  // walkthrough share them, so the dice payloads can't drift.
  function spellRollFns(cs: CharacterSpell, sp: SpellData | undefined) {
    const slug = normalizeSlug(cs.slug)
    const label = sp?.name ?? slug
    const level = sp?.level ?? 0
    const catalogDmg = sp ? parseSpellDamage(sp) : null
    const heal = sp ? parseSpellHeal(sp) : null
    const hasDamage = !!(cs.damageDice || catalogDmg?.dice)
    const dmgDice = cs.damageDice ?? catalogDmg?.dice ?? ''
    const hit = hasDamage
      ? () => dispatch({ type: 'attack', label, modifier: derived.spellAttackBonus, bonuses: derived.breakdowns.spellAttack.map(s => ({ label: s.label, amount: s.amount })) })
      : undefined
    const damage = hasDamage
      ? () => dispatchDamage({
          label,
          baseDice: dmgDice,
          damageBonus: derived.itemSpellDamageBonus,
          damageType: cs.damageType ?? catalogDmg?.type ?? undefined,
          scaling: level === 0
            ? { kind: 'cantrip', characterLevel: character.level }
            : { kind: 'leveled', baseLevel: level, perLevel: cs.damagePerLevel ?? catalogDmg?.perLevel ?? undefined, maxLevel: 9 },
        })
      : undefined
    const healFn = !hasDamage && heal
      ? () => dispatchDamage({
          label,
          baseDice: heal.dice,
          damageBonus: heal.addsMod ? castingMod : 0,
          mode: 'heal',
          scaling: level === 0 ? undefined : { kind: 'leveled', baseLevel: level, perLevel: heal.perLevel ?? undefined, maxLevel: 9 },
        })
      : undefined
    return { hit, damage, heal: healFn, hasDamage, hasHeal: !!healFn }
  }

  function queuedIn(id: string): QueueSlotKey | null {
    if (queue.action?.id === id) return 'action'
    if (queue.bonusAction?.id === id) return 'bonusAction'
    return null
  }

  function toggleQueue(slot: QueueSlotKey, entry: QueuedEntry) {
    const already = queue[slot]?.id === entry.id
    setSlot(slot, already ? undefined : entry)
  }

  // ── Commit: spend every queued cost in ONE character write, then log ─────────
  function commitTurn() {
    const entries = [queue.action, queue.bonusAction].filter((e): e is QueuedEntry => !!e)
    if (entries.length === 0) return
    const changes: Partial<NewCharacter> = {}
    let slotsUsed = character.spellSlotsUsed
    let resUsed = character.featureResourcesUsed
    const costs: string[] = []
    for (const e of entries) {
      const cost = e.cost
      if (cost?.type === 'spell-slot') {
        const opt = options.find(o => o.key === cost.level)
        const cap = opt ? (slotsUsed[cost.level] ?? 0) + opt.remaining : Infinity
        slotsUsed = { ...slotsUsed, [cost.level]: Math.min((slotsUsed[cost.level] ?? 0) + 1, cap) }
        costs.push(cost.label)
      } else if (cost?.type === 'ability') {
        const ability = abilityByKey.get(cost.key)
        const cap = ability ? abilityMax(ability) : Infinity
        resUsed = { ...resUsed, [cost.key]: Math.min((resUsed[cost.key] ?? 0) + cost.amount, cap) }
        costs.push(cost.label)
      }
    }
    if (slotsUsed !== character.spellSlotsUsed) changes.spellSlotsUsed = slotsUsed
    if (resUsed !== character.featureResourcesUsed) changes.featureResourcesUsed = resUsed
    if (Object.keys(changes).length > 0) onSave(changes)   // single atomic write
    recordTurn(entries.map(e => e.label), costs)

    // Walk through the rolls in queue order — exactly what tapping the row
    // buttons by hand would dispatch (weapons: two-phase hit→dmg modal; attack
    // spells: hit then damage; heals: the heal roll).
    const rollFns: (() => void)[] = []
    for (const e of entries) {
      if (e.kind === 'weapon') {
        const cw = weapons.find(w => `weapon:${w.item.id}` === e.id)
        if (cw) rollFns.push(assemble(cw.item, cw.weapon, cw.active).rollHit)
      } else if (e.kind === 'spell') {
        const pair = spells.find(({ cs }) => `spell:${normalizeSlug(cs.slug)}` === e.id)
        if (pair) {
          const r = spellRollFns(pair.cs, pair.sp)
          if (r.hit) rollFns.push(r.hit)
          if (r.damage) rollFns.push(r.damage)
          else if (r.heal) rollFns.push(r.heal)
        }
      }
    }
    setPendingRolls(rollFns)
  }

  const bothLeveled = !!queue.action?.leveledSpell && !!queue.bonusAction?.leveledSpell

  // ── Row builders ──────────────────────────────────────────────────────────────

  function weaponRows() {
    return weapons.map(({ item, weapon, active }) => {
      const w = assemble(item, weapon, active)
      const slot = queuedIn(`weapon:${item.id}`)
      return (
        <div key={item.id} className="flex items-center gap-2 py-1.5">
          <Badge economy="action" title="Action" />
          <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
          <span className="text-xs text-muted-foreground flex-none">{w.displayToHit} · {w.displayDamage}</span>
          <RollButton label="Hit" rollMode={derived.attackRollState} onClick={w.rollHit} />
          <RollButton label="Dmg" tone="gold" onClick={w.rollDamage} />
          <QueueButton
            queued={slot === 'action'}
            onClick={() => toggleQueue('action', { id: `weapon:${item.id}`, kind: 'weapon', label: item.name })}
          />
        </div>
      )
    })
  }

  function spellRows(economy: ActionEconomy) {
    return spells
      .filter(({ sp }) => normalizeCastingTime(sp?.casting_time) === economy)
      .map(({ cs, sp }) => {
        const slug = normalizeSlug(cs.slug)
        const label = sp?.name ?? slug
        const level = sp?.level ?? 0
        const rolls = spellRollFns(cs, sp)
        const eligible = options.filter(o => o.castLevel >= level && o.remaining > 0)
        const chosen = eligible.find(o => o.key === chosenSlot[slug]) ?? eligible[0]
        const castable = level === 0 || !!chosen
        const slotIn = queuedIn(`spell:${slug}`)
        const slotKey: QueueSlotKey = economy === 'bonus_action' ? 'bonusAction' : 'action'
        const rowId = `spell:${slug}`
        return (
          <div key={cs.slug} className="py-1.5 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge economy={economy} title={economy === 'bonus_action' ? 'Bonus action' : economy === 'reaction' ? 'Reaction' : 'Action'} />
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-none" style={{ background: 'var(--color-surface-2)', color: 'var(--color-accent-gold)' }}>
              {level === 0 ? 'Cantrip' : `Lv ${level}`}
            </span>
            <button
              onClick={() => toggleExpanded(rowId)}
              className={cn('flex-1 text-sm font-medium truncate min-w-24 text-left hover:opacity-75 transition-opacity', !castable && 'opacity-50')}
              title="Tap to read the spell description"
            >
              {label}
            </button>
            {level > 0 && (
              eligible.length > 0 ? (
                <select
                  value={chosen?.key}
                  onChange={e => setChosenSlot(cur => ({ ...cur, [slug]: Number(e.target.value) }))}
                  className="text-xs bg-[var(--color-surface-2)] border border-border rounded px-1 py-0.5 flex-none"
                  title="Slot to spend on commit"
                >
                  {eligible.map(o => (
                    <option key={o.key} value={o.key}>{o.label} ({o.remaining} left)</option>
                  ))}
                </select>
              ) : (
                <span className="text-[10px] uppercase flex-none" style={{ color: 'var(--color-accent-red)' }}>no slots</span>
              )
            )}
            {rolls.hasDamage && (
              <>
                <RollButton label="Hit" rollMode={derived.attackRollState} onClick={() => rolls.hit?.()} />
                <RollButton label="Dmg" tone="gold" onClick={() => rolls.damage?.()} />
              </>
            )}
            {rolls.hasHeal && (
              <RollButton label="Heal" tone="gold" onClick={() => rolls.heal?.()} />
            )}
            {(economy === 'action' || economy === 'bonus_action') && (() => {
              // A second LEVELED spell in the same turn is RAW-discouraged: warn
              // styling + a confirm tap (never blocked — homebrew allowed).
              const otherLeveledQueued = level > 0 && slotIn !== slotKey && !!(
                (queue.action?.leveledSpell && queue.action.id !== rowId) ||
                (queue.bonusAction?.leveledSpell && queue.bonusAction.id !== rowId)
              )
              const entry: QueuedEntry = {
                id: rowId,
                kind: 'spell',
                label: level > 0 && chosen ? `${label} (${chosen.label} slot)` : label,
                leveledSpell: level > 0,
                cost: level > 0 && chosen
                  ? { type: 'spell-slot', level: chosen.key, label: `${chosen.label} slot` }
                  : undefined,
              }
              return (
                <QueueButton
                  queued={slotIn === slotKey}
                  disabled={!castable}
                  warn={otherLeveledQueued}
                  confirming={otherLeveledQueued && confirmQueueId === rowId}
                  title={!castable ? 'No slot available'
                    : otherLeveledQueued ? 'RAW: a bonus-action spell limits your other spell to a cantrip — tap twice to queue a second leveled spell anyway (homebrew)'
                    : undefined}
                  onClick={() => {
                    if (slotIn === slotKey) { toggleQueue(slotKey, entry); setConfirmQueueId(null); return }
                    if (otherLeveledQueued && confirmQueueId !== rowId) { setConfirmQueueId(rowId); return }
                    setConfirmQueueId(null)
                    toggleQueue(slotKey, entry)
                  }}
                />
              )
            })()}
          </div>
          {expandedId === rowId && (
            sp ? (
              <div className="pl-10 space-y-1.5 text-xs text-muted-foreground">
                <div className="flex gap-4 flex-wrap">
                  <span><span className="font-semibold text-foreground">Range:</span> {sp.range}</span>
                  <span><span className="font-semibold text-foreground">Duration:</span> {sp.duration}</span>
                  {sp.concentration && <span className="text-amber-400">Concentration</span>}
                  {sp.ritual && <span className="text-purple-400">Ritual</span>}
                  <span><span className="font-semibold text-foreground">Components:</span> {componentStr(sp.components)}</span>
                </div>
                <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap">{sp.description}</p>
                {sp.at_higher_levels && <p className="italic whitespace-pre-wrap">{sp.at_higher_levels}</p>}
              </div>
            ) : (
              <p className="pl-10 text-xs text-muted-foreground italic">No catalog entry for this spell.</p>
            )
          )}
          </div>
        )
      })
  }

  function abilityRows(economy: ActionEconomy) {
    return abilities
      .filter(a => a.action === economy)
      .map(a => {
        const remaining = a.resource ? abilityRemaining(a) : null
        const max = a.resource ? abilityMax(a) : null
        // Spend on commit: the ability's own uses (1), or its linked pool cost (ki).
        // Depluralize the resource label for a single spend ("1 ki point").
        const costPoolLabel = (abilityByKey.get(a.cost?.key ?? '')?.resource?.label ?? 'resource').toLowerCase()
        const cost = a.cost
          ? { type: 'ability' as const, key: a.cost.key, amount: a.cost.amount, label: `${a.cost.amount} ${a.cost.amount === 1 ? costPoolLabel.replace(/s$/, '') : costPoolLabel}` }
          : a.resource && a.resource.kind === 'uses'
            ? { type: 'ability' as const, key: a.key, amount: 1, label: `1 ${a.resource.label.toLowerCase().replace(/s$/, '')}` }
            : undefined
        const payable = a.cost
          ? (abilityByKey.get(a.cost.key) ? abilityRemaining(abilityByKey.get(a.cost.key)!) >= a.cost.amount : false)
          : remaining === null || remaining > 0
        const slotIn = queuedIn(a.key)
        const slotKey: QueueSlotKey = economy === 'bonus_action' ? 'bonusAction' : 'action'
        return (
          <div key={a.key} className="py-1.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge economy={economy} title={economy === 'bonus_action' ? 'Bonus action' : 'Action'} />
            <button
              onClick={() => toggleExpanded(a.key)}
              className="flex-1 text-sm font-medium truncate text-left hover:opacity-75 transition-opacity"
              title="Tap to read the feature description"
            >
              {a.name}
            </button>
            {remaining !== null && (
              <span className="text-xs text-muted-foreground flex-none">{remaining}/{max}</span>
            )}
            {(economy === 'action' || economy === 'bonus_action') && (
              <QueueButton
                queued={slotIn === slotKey}
                disabled={!payable}
                title={payable ? undefined : 'No uses left'}
                onClick={() => toggleQueue(slotKey, { id: a.key, kind: 'ability', label: a.name, cost })}
              />
            )}
          </div>
          {expandedId === a.key && (
            <p className="pl-10 text-xs text-muted-foreground whitespace-pre-wrap">
              {lookupFeatureDescription(featureDescriptions, a.source.classSlug, a.name)
                ?? 'No description authored yet — see the class entry in the rulebook.'}
            </p>
          )}
          </div>
        )
      })
  }

  function genericRows(economy: ActionEconomy) {
    return GENERIC_ACTIONS
      .filter(g => g.economy === economy)
      .map(g => {
        const rowId = `generic:${g.name}`
        const slotIn = queuedIn(rowId)
        return (
          <div key={g.name} className="py-1.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge economy={g.economy} title={g.desc} />
            <button
              onClick={() => toggleExpanded(rowId)}
              className="flex-1 text-sm truncate text-muted-foreground text-left hover:text-foreground transition-colors"
              title="Tap to read what this action does"
            >
              {g.name}
            </button>
            {g.economy === 'action' && (
              <QueueButton
                queued={slotIn === 'action'}
                onClick={() => toggleQueue('action', { id: rowId, kind: 'generic', label: g.name })}
              />
            )}
          </div>
          {expandedId === rowId && (
            <p className="pl-10 text-xs text-muted-foreground">{g.desc}</p>
          )}
          </div>
        )
      })
  }

  const otherAbilities = abilities.filter(a => a.action === 'other')

  function section(title: string, rows: React.ReactNode[], hint?: string) {
    if (rows.every(r => r === null) || rows.length === 0) return null
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
        {hint && <p className="text-[11px] text-muted-foreground mb-1">{hint}</p>}
        <div className="divide-y divide-border">{rows}</div>
      </div>
    )
  }

  // Action/Bonus/Reaction sections group their rows by kind (abilities, spells,
  // weapons, general) under small gold sub-headers; empty groups collapse.
  function groupedSection(title: string, groups: { label: string; rows: React.ReactNode[] }[]) {
    const nonEmpty = groups.filter(g => g.rows.length > 0)
    if (nonEmpty.length === 0) return null
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {nonEmpty.map(g => (
          <div key={g.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide py-1 mt-1" style={{ color: 'var(--color-accent-gold)' }}>
              {g.label}
            </p>
            <div className="divide-y divide-border">{g.rows}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <section className="space-y-3">
      {/* Loadout — active gear at a glance (manage it in the Inventory tab) */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Loadout</p>
        {activeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing equipped — activate gear in the Inventory tab.</p>
        ) : (
          <div className="divide-y divide-border">
            {activeItems.map(item => {
              const n = item.name.toLowerCase()
              const armor = catalogMaps.armorByName.get(n)
              const cw = catalogMaps.weaponByName.has(n) ? weapons.find(x => x.item.id === item.id) : undefined
              const brief = cw
                ? (() => { const a = assemble(cw.item, cw.weapon, true); return `${a.displayToHit} · ${a.displayDamage}` })()
                : armor ? `AC ${armor.ac_formula}`
                : summarizeItemEffects(catalogMaps.wondrousItemByName.get(n)?.effects) ?? ''
              return (
                <div key={item.id} className="flex items-center gap-2 py-1.5">
                  <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
                  {brief && <span className="text-xs text-muted-foreground truncate flex-none max-w-[60%]">{brief}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Turn</h2>

      {/* Turn queue — commit spends resources once, then walks through the rolls */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <p><span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">Action</span>{queue.action?.label ?? <span className="text-muted-foreground">—</span>}</p>
          <p><span className="text-xs uppercase tracking-wide text-muted-foreground mr-2">Bonus</span>{queue.bonusAction?.label ?? <span className="text-muted-foreground">—</span>}</p>
        </div>
        {bothLeveled && (
          <p className="text-[11px]" style={{ color: 'var(--color-accent-gold)' }}>
            ⚠ RAW: casting a bonus-action spell limits your action spell to a cantrip — two leveled spells in one turn is homebrew (allowed, not blocked).
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={commitTurn}
            disabled={!queue.action && !queue.bonusAction}
            className="px-3 py-1 text-xs rounded font-semibold disabled:opacity-40"
            style={{ background: 'var(--color-accent-red)', color: '#fff' }}
          >
            Commit turn
          </button>
          <button
            onClick={clearQueue}
            disabled={!queue.action && !queue.bonusAction}
            className="px-3 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
          >
            Clear
          </button>
          <span className="text-[11px] text-muted-foreground">Commit spends slots/uses · rolls stay on each row</span>
        </div>
      </div>

      {groupedSection('Action', [
        { label: 'Class Abilities', rows: abilityRows('action') },
        { label: 'Spells', rows: spellRows('action') },
        { label: 'Weapon Attacks', rows: weaponRows() },
        { label: 'General', rows: genericRows('action') },
      ])}
      {groupedSection('Bonus Action', [
        { label: 'Class Abilities', rows: abilityRows('bonus_action') },
        { label: 'Spells', rows: spellRows('bonus_action') },
      ])}
      {groupedSection('Reaction', [
        { label: 'Class Abilities', rows: abilityRows('reaction') },
        { label: 'Spells', rows: spellRows('reaction') },
        { label: 'General', rows: genericRows('reaction') },
      ])}
      {otherAbilities.length > 0 && section('No Action / Special', otherAbilities.map(a => {
        const max = a.resource ? abilityMax(a) : null
        const remaining = a.resource ? abilityRemaining(a) : null
        return (
          <div key={a.key} className="py-1.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge economy="other" title="No action / special" />
            <button
              onClick={() => toggleExpanded(a.key)}
              className="flex-1 text-sm font-medium truncate text-left hover:opacity-75 transition-opacity"
              title="Tap to read the feature description"
            >
              {a.name}
            </button>
            {remaining !== null && <span className="text-xs text-muted-foreground flex-none">{remaining}/{max}</span>}
          </div>
          {expandedId === a.key && (
            <p className="pl-10 text-xs text-muted-foreground whitespace-pre-wrap">
              {lookupFeatureDescription(featureDescriptions, a.source.classSlug, a.name)
                ?? 'No description authored yet — see the class entry in the rulebook.'}
            </p>
          )}
          </div>
        )
      }))}

      {/* Session-only history — mirrors dice history; lost on refresh by design */}
      {history.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Turn History</p>
            <button onClick={clearHistory} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          </div>
          <div className="divide-y divide-border">
            {history.map(t => (
              <div key={t.id} className="py-1.5 text-xs">
                <span className="text-foreground">{t.labels.join(' + ')}</span>
                {t.costs.length > 0 && <span className="text-muted-foreground"> · spent {t.costs.join(', ')}</span>}
                <span className="text-muted-foreground float-right">{new Date(t.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
