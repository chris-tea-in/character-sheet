interface Props {
  onClick: () => void
  advantage?: boolean
  disabled?: boolean
  label?: string                 // default "Roll"; e.g. "Hit" / "Dmg"
  tone?: 'red' | 'gold'          // default red; gold distinguishes the Dmg button
  title?: string
}

export function RollButton({ onClick, advantage, disabled, label = 'Roll', tone = 'red', title }: Props) {
  const background = tone === 'gold' ? 'var(--color-accent-gold)' : 'var(--color-accent-red)'
  const color = tone === 'gold' ? '#000' : '#fff'
  const text = advantage ? `${label} (Adv)` : label
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80 transition-opacity flex-none disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background, color }}
      title={title ?? (advantage ? 'Rolling with advantage' : undefined)}
    >
      {text}
    </button>
  )
}
