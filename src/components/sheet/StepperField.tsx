import { cn } from '@/lib/utils'

interface Props {
  value: number
  onSave: (v: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  valueClassName?: string
  size?: 'sm' | 'md'
}

export function StepperField({
  value,
  onSave,
  min,
  max,
  step = 1,
  className,
  valueClassName,
  size = 'md',
}: Props) {
  const btnSize = size === 'sm' ? 'w-5 h-5 text-xs' : 'w-7 h-7 text-sm'

  function decrement() {
    const next = value - step
    onSave(min !== undefined ? Math.max(min, next) : next)
  }

  function increment() {
    const next = value + step
    onSave(max !== undefined ? Math.min(max, next) : next)
  }

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <button
        onClick={decrement}
        className={cn(
          btnSize,
          'rounded border border-border hover:bg-secondary flex items-center justify-center font-bold leading-none transition-colors',
        )}
      >
        −
      </button>
      <span className={cn('font-bold tabular-nums text-center min-w-[2ch]', valueClassName)}>
        {value}
      </span>
      <button
        onClick={increment}
        className={cn(
          btnSize,
          'rounded border border-border hover:bg-secondary flex items-center justify-center font-bold leading-none transition-colors',
        )}
      >
        +
      </button>
    </div>
  )
}
