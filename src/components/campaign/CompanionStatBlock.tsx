import { useMemo } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { StepperField } from '@/components/sheet/StepperField'
import { RollButton } from '@/components/sheet/RollButton'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { companionRollStats } from '@/lib/companionStats'
import { abilityModifier, formatBonus } from '@/lib/dice'
import { COMPANION_ABILITIES, COMPANION_SKILLS } from '../../../shared/companionValidation'
import type { CampaignCompanion } from '@/lib/syncApi'
import type { RollOrigin } from '@/types/dice'

// One companion's stat-block card. The companion is a first-class roller: its
// dispatches feed companionRollStats (its OWN numbers — nothing inherited from the
// owning PC) and every kind carries an origin tag so the entries land in the
// Companions roll history, not the main dice tray. `rollable` is off on surfaces
// that don't mount the dice tray + roll modal (the campaign hub page).

const SKILL_LABELS: Record<string, string> = {
  acrobatics: 'Acrobatics', animalHandling: 'Animal Handling', arcana: 'Arcana',
  athletics: 'Athletics', deception: 'Deception', history: 'History', insight: 'Insight',
  intimidation: 'Intimidation', investigation: 'Investigation', medicine: 'Medicine',
  nature: 'Nature', perception: 'Perception', performance: 'Performance',
  persuasion: 'Persuasion', religion: 'Religion', sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth', survival: 'Survival',
}

interface CompanionStatBlockProps {
  companion: CampaignCompanion
  rollable: boolean
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
  /** Persist a data change (HP steppers). Parent PUTs the full blob. */
  onSaveData: (data: CampaignCompanion['data']) => void
  /** Optional slot for an assignment control (campaign page / move-between-chars). */
  assignControl?: React.ReactNode
  /** Attribution line, e.g. "added by DM Chris" (shown when provided). */
  attribution?: string
}

export function CompanionStatBlock({
  companion, rollable, canEdit, canDelete, onEdit, onDelete, onSaveData, assignControl, attribution,
}: CompanionStatBlockProps) {
  const data = companion.data
  const stats = useMemo(() => companionRollStats(data), [data])
  const { dispatch, dispatchDamage } = useRollDispatch(stats)
  const origin: RollOrigin = { scope: 'companion', companionId: companion.id, companionName: data.name }

  const textLines: Array<[string, string]> = [
    ['Senses', data.senses], ['Languages', data.languages],
    ['Resistances', data.resistances], ['Immunities', data.immunities],
    ['Condition Immunities', data.conditionImmunities], ['Vulnerabilities', data.vulnerabilities],
  ]

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-tight truncate">{data.name || 'Unnamed companion'}</p>
          {data.kindLine && <p className="text-xs italic text-muted-foreground truncate">{data.kindLine}</p>}
          {attribution && <p className="text-[10px] text-muted-foreground mt-0.5">{attribution}</p>}
        </div>
        {canEdit && (
          <button onClick={onEdit}
            className="flex-none text-muted-foreground hover:text-foreground transition-colors"
            title={`Edit ${data.name}`} aria-label={`Edit ${data.name}`}>
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete}
            className="flex-none text-muted-foreground hover:text-destructive transition-colors"
            title={`Delete ${data.name}`} aria-label={`Delete ${data.name}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {assignControl}

      {/* Vitals: AC / speed / HP trackers */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span>
          <span className="text-muted-foreground">AC </span>
          <span className="font-bold tabular-nums">{data.ac}</span>
          {data.acNote && <span className="text-xs text-muted-foreground"> ({data.acNote})</span>}
        </span>
        {data.speed && (
          <span>
            <span className="text-muted-foreground">Speed </span>
            <span className="font-semibold">{data.speed}</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">HP</span>
          {canEdit ? (
            <StepperField size="sm" typeable value={data.currentHp} min={0} max={data.maxHp}
              onSave={v => onSaveData({ ...data, currentHp: v })} />
          ) : (
            <span className="font-bold tabular-nums">{data.currentHp}</span>
          )}
          <span className="text-muted-foreground">/ {data.maxHp}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Temp</span>
          {canEdit ? (
            <StepperField size="sm" typeable value={data.tempHp} min={0}
              onSave={v => onSaveData({ ...data, tempHp: v })} />
          ) : (
            <span className="font-bold tabular-nums">{data.tempHp}</span>
          )}
        </span>
      </div>

      {/* Abilities — tap a cell for an ability check */}
      <div className="grid grid-cols-6 gap-1">
        {COMPANION_ABILITIES.map(ab => {
          const mod = abilityModifier(data.abilities[ab])
          const cell = (
            <>
              <p className="text-[10px] uppercase text-muted-foreground">{ab}</p>
              <p className="font-bold tabular-nums leading-tight">{data.abilities[ab]}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatBonus(mod)}</p>
            </>
          )
          return rollable ? (
            <button key={ab}
              onClick={() => dispatch({ type: 'ability', ability: ab, origin })}
              className="rounded-md border border-border py-1 text-center hover:border-[var(--color-accent-gold)] transition-colors"
              title={`Roll a ${ab.toUpperCase()} check for ${data.name}`}>
              {cell}
            </button>
          ) : (
            <div key={ab} className="rounded-md border border-border py-1 text-center">{cell}</div>
          )
        })}
      </div>

      {/* Saves — always all six; skills — only overridden ones (checks cover the rest) */}
      <div className="flex flex-wrap gap-1">
        {COMPANION_ABILITIES.map(ab => {
          const mod = stats.saveModifiers[ab]
          const text = `${ab.toUpperCase()} ${formatBonus(mod)}`
          return rollable ? (
            <button key={ab}
              onClick={() => dispatch({ type: 'save', ability: ab, origin })}
              className="px-2 py-0.5 rounded-md border border-border text-xs tabular-nums text-muted-foreground hover:text-foreground hover:border-[var(--color-accent-gold)] transition-colors"
              title={`Roll a ${ab.toUpperCase()} save for ${data.name}`}>
              {text}
            </button>
          ) : (
            <span key={ab} className="px-2 py-0.5 rounded-md border border-border text-xs tabular-nums text-muted-foreground">
              {text}
            </span>
          )
        })}
      </div>
      {COMPANION_SKILLS.some(sk => data.skillOverrides?.[sk] !== undefined) && (
        <div className="flex flex-wrap gap-1">
          {COMPANION_SKILLS.filter(sk => data.skillOverrides?.[sk] !== undefined).map(sk => {
            const text = `${SKILL_LABELS[sk]} ${formatBonus(stats.skillModifiers[sk])}`
            return rollable ? (
              <button key={sk}
                onClick={() => dispatch({ type: 'skill', skill: sk, origin })}
                className="px-2 py-0.5 rounded-md border border-border text-xs tabular-nums text-muted-foreground hover:text-foreground hover:border-[var(--color-accent-gold)] transition-colors"
                title={`Roll ${SKILL_LABELS[sk]} for ${data.name}`}>
                {text}
              </button>
            ) : (
              <span key={sk} className="px-2 py-0.5 rounded-md border border-border text-xs tabular-nums text-muted-foreground">
                {text}
              </span>
            )
          })}
        </div>
      )}

      {/* Attacks — the automated-roll payoff: Hit drives the full two-phase modal */}
      {data.attacks.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attacks</p>
          {data.attacks.map((atk, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{atk.name}</span>
                <span className="text-muted-foreground text-xs">
                  {' '}{formatBonus(atk.toHit)} · {atk.damageDice}
                  {atk.damageBonus !== 0 ? formatBonus(atk.damageBonus) : ''}
                  {atk.damageType ? ` ${atk.damageType}` : ''}
                  {atk.extraDamage?.length ? ` + ${atk.extraDamage.map(r => `${r.dice} ${r.damageType}`).join(' + ')}` : ''}
                  {atk.notes ? ` · ${atk.notes}` : ''}
                </span>
              </div>
              {rollable && (
                <>
                  <RollButton
                    label="Hit"
                    onClick={() => dispatch({
                      type: 'attack',
                      label: `${data.name}: ${atk.name}`,
                      modifier: atk.toHit,
                      damageDice: atk.damageDice,
                      damageBonus: atk.damageBonus,
                      damageType: atk.damageType,
                      extraDamage: atk.extraDamage,
                      bonuses: [{ label: 'Stat block to-hit', amount: atk.toHit }],
                      origin,
                    })}
                  />
                  <RollButton
                    label="Dmg" tone="gold"
                    onClick={() => dispatchDamage({
                      label: `${data.name}: ${atk.name}`,
                      baseDice: atk.damageDice,
                      damageBonus: atk.damageBonus,
                      damageType: atk.damageType,
                      extraDamage: atk.extraDamage,
                      origin,
                    })}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {data.traits.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Traits</p>
          {data.traits.map((t, i) => (
            <p key={i} className="text-sm">
              <span className="font-semibold italic">{t.name}.</span>{' '}
              <span className="text-muted-foreground whitespace-pre-wrap">{t.description}</span>
            </p>
          ))}
        </div>
      )}

      {textLines.some(([, v]) => v) && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {textLines.filter(([, v]) => v).map(([k, v]) => (
            <p key={k}><span className="font-semibold">{k}:</span> {v}</p>
          ))}
        </div>
      )}

      {data.playerNotes && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t border-border pt-2">
          {data.playerNotes}
        </p>
      )}
    </section>
  )
}
