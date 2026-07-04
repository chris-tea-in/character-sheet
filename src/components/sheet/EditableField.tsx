import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  placeholder?: string
  onSave: (value: string) => void
  className?: string
  inputClassName?: string
  type?: 'text' | 'number'
  min?: number
  max?: number
}

export function EditableField({
  value,
  placeholder = '—',
  onSave,
  className,
  inputClassName,
  type = 'text',
  min,
  max,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  function commit() {
    onSave(draft)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') { setDraft(value); setEditing(false) }
  }

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true) }}
        className={cn(
          'cursor-pointer hover:opacity-75 transition-opacity',
          !value && 'text-muted-foreground italic',
          className,
        )}
      >
        {value || placeholder}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      type={type}
      value={draft}
      min={min}
      max={max}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className={cn(
        'bg-transparent border-b border-ring focus:outline-none',
        inputClassName ?? className,
      )}
    />
  )
}

interface TextareaProps {
  value: string
  placeholder?: string
  onSave: (value: string) => void
  className?: string
  rows?: number
}

export function EditableTextarea({
  value,
  placeholder = 'Click to add…',
  onSave,
  className,
  rows = 3,
}: TextareaProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  function commit() {
    onSave(draft)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div
        onClick={() => { setDraft(value); setEditing(true) }}
        className={cn(
          'cursor-pointer hover:opacity-75 transition-opacity min-h-[40px] text-sm whitespace-pre-wrap',
          !value && 'text-muted-foreground italic',
          className,
        )}
      >
        {value || placeholder}
      </div>
    )
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={rows}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      className={cn(
        'w-full bg-transparent border border-ring rounded-md px-2 py-1 text-sm focus:outline-none resize-none',
        className,
      )}
    />
  )
}
