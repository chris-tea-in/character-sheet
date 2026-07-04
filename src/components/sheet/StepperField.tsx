import { useEffect, useRef, useState } from 'react'
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
  /** Allow clicking the value to type a number directly. Off by default —
   * some callers (e.g. the Level stepper) rely on strictly ±step changes. */
  typeable?: boolean
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
  typeable = false,
}: Props) {
  const btnSize = size === 'sm' ? 'w-5 h-5 text-xs' : 'w-7 h-7 text-sm'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function decrement() {
    const next = value - step
    onSave(min !== undefined ? Math.max(min, next) : next)
  }

  function increment() {
    const next = value + step
    onSave(max !== undefined ? Math.min(max, next) : next)
  }

  function commitTyped() {
    const parsed = parseInt(draft, 10)
    setEditing(false)
    if (Number.isNaN(parsed)) return
    let next = step > 1 ? Math.round(parsed / step) * step : parsed
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    onSave(next)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commitTyped()
    if (e.key === 'Escape') setEditing(false)
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
      {typeable && editing ? (
        <input
          ref={inputRef}
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitTyped}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-[5ch] bg-transparent border-b border-ring font-bold tabular-nums text-center focus:outline-none',
            valueClassName,
          )}
        />
      ) : (
        <span
          onClick={typeable ? () => { setDraft(String(value)); setEditing(true) } : undefined}
          className={cn(
            'font-bold tabular-nums text-center min-w-[2ch]',
            typeable && 'cursor-pointer hover:opacity-75 transition-opacity',
            valueClassName,
          )}
        >
          {value}
        </span>
      )}
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
