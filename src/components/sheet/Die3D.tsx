// A single 3D tumbling die for the roll modal. It's a CSS cube (transform-style:
// preserve-3d) that tumbles for ~0.75s and lands with its FRONT face — which always
// shows the real rolled value — facing the viewer. A small d{sides} label sits below.
// Used for every die type (the cube is a stylized 3D die; the label says which die it is).
// `tone` colors a natural 20 gold and a natural 1 red; `dimmed` is the dropped advantage
// die; `delay` staggers multiple dice (damage / pools) so they don't all land at once.

import { useEffect, useRef, useState } from 'react'

const TONE_COLOR: Record<'gold' | 'red' | 'normal', string> = {
  gold: 'var(--color-accent-gold)',
  red: 'var(--color-accent-red)',
  normal: 'var(--color-accent-gold)',
}

const TUMBLE_MS = 720  // keep in sync with the die-tumble animation in globals.css

export function Die3D({
  value,
  sides,
  tone = 'normal',
  dimmed = false,
  delay = 0,
  size = 46,
  countTo,
}: {
  value: number
  sides: number
  tone?: 'gold' | 'red' | 'normal'
  dimmed?: boolean
  delay?: number
  size?: number
  // When set, the die lands on `value` (the natural roll), then the face number counts
  // UP to `countTo` (the final total) — and re-counts whenever countTo changes (a bonus
  // was added). Omit to just show `value`.
  countTo?: number
}) {
  const color = TONE_COLOR[tone]
  // Count-up display state (only used when countTo is provided).
  const [display, setDisplay] = useState(value)
  const displayRef = useRef(value)
  const firstRef = useRef(true)
  useEffect(() => { displayRef.current = display }, [display])
  useEffect(() => {
    if (countTo === undefined) return
    const target = countTo
    const from = firstRef.current ? value : displayRef.current
    const startDelay = firstRef.current ? TUMBLE_MS + delay : 0  // first run waits for the tumble to land
    firstRef.current = false
    if (from === target) { setDisplay(target); return }
    let raf = 0
    let t0 = 0
    const tick = (t: number) => {
      if (!t0) t0 = t
      const e = t - t0 - startDelay
      if (e < 0) { raf = requestAnimationFrame(tick); return }
      const p = Math.min(1, e / 420)
      const eased = 1 - (1 - p) * (1 - p)
      setDisplay(Math.round(from + (target - from) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [countTo, value, delay])
  const front = countTo !== undefined ? display : value
  const half = size / 2
  const faces: Array<{ k: string; t: string }> = [
    { k: 'front', t: `translateZ(${half}px)` },
    { k: 'back', t: `rotateY(180deg) translateZ(${half}px)` },
    { k: 'right', t: `rotateY(90deg) translateZ(${half}px)` },
    { k: 'left', t: `rotateY(-90deg) translateZ(${half}px)` },
    { k: 'top', t: `rotateX(90deg) translateZ(${half}px)` },
    { k: 'bottom', t: `rotateX(-90deg) translateZ(${half}px)` },
  ]
  // The front face shows the roll (or the counting total when countTo is set); other
  // faces show plausible decoys so the tumble reads as a real die.
  const faceValue = (k: string, i: number) => (k === 'front' ? front : ((value + i * 5) % sides) + 1)
  // The die may grow past 2 digits once a total counts up; shrink the font a touch.
  const fontScale = String(front).length >= 3 ? 0.32 : 0.44

  return (
    <div className="flex flex-col items-center gap-1" style={{ opacity: dimmed ? 0.4 : 1 }}>
      <div className="die3d" style={{ width: size, height: size }}>
        <div
          className="die3d-cube"
          style={{
            width: size,
            height: size,
            color,
            animationDelay: `${delay}ms`,
            filter: tone === 'gold' ? 'drop-shadow(0 0 7px var(--color-accent-gold))' : undefined,
          }}
        >
          {faces.map((f, i) => (
            <div key={f.k} className="die3d-face" style={{ transform: f.t, fontSize: size * fontScale, color }}>
              {faceValue(f.k, i)}
            </div>
          ))}
        </div>
      </div>
      <span className={`text-[10px] uppercase tracking-wide text-muted-foreground ${dimmed ? 'line-through' : ''}`}>
        d{sides}
      </span>
    </div>
  )
}
