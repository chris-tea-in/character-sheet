interface Props {
  onClick: () => void
  advantage?: boolean
  disabled?: boolean
}

export function RollButton({ onClick, advantage, disabled }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80 transition-opacity flex-none disabled:opacity-40 disabled:cursor-not-allowed"
      style={{ background: 'var(--color-accent)', color: '#fff' }}
      title={advantage ? 'Rolling with advantage' : undefined}
    >
      {advantage ? 'Roll (Adv)' : 'Roll'}
    </button>
  )
}
