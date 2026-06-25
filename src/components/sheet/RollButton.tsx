interface Props {
  onClick: () => void
  advantage?: boolean            // legacy: true → Adv
  rollMode?: 'adv' | 'dis'       // preferred: shows (Adv)/(Dis), netted per RAW
  disabled?: boolean
  label?: string                 // default "Roll"; e.g. "Hit" / "Dmg"
  tone?: 'red' | 'gold'          // default red; gold distinguishes the Dmg button
  title?: string
}

export function RollButton({ onClick, advantage, rollMode, disabled, label = 'Roll', tone = 'red', title }: Props) {
  const background = tone === 'gold' ? 'var(--color-accent-gold)' : 'var(--color-accent-red)'
  const color = tone === 'gold' ? '#000' : '#fff'
  const mode = rollMode ?? (advantage ? 'adv' : undefined)
  const text = mode === 'adv' ? `${label} (Adv)` : mode === 'dis' ? `${label} (Dis)` : label
  const modeTitle = mode === 'adv' ? 'Rolling with advantage' : mode === 'dis' ? 'Rolling with disadvantage' : undefined
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80 transition-opacity flex-none disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background, color }}
      title={title ?? modeTitle}
    >
      {text}
    </button>
  )
}
