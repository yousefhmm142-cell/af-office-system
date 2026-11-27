import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type P = [number, number]
/** A closed path through the points, each corner rounded by its own radius. */
function rounded(points: P[], radii: number[]): string {
  const n = points.length
  let d = ''
  for (let i = 0; i < n; i++) {
    const [x, y] = points[i]!, prev = points[(i - 1 + n) % n]!, next = points[(i + 1) % n]!
    const r = radii[i] ?? 0
    const toward = (a: P, len: number): P => { const dx = a[0] - x, dy = a[1] - y, l = Math.hypot(dx, dy) || 1, k = Math.min(len, l / 2) / l; return [x + dx * k, y + dy * k] }
    const a = toward(prev, r), b = toward(next, r)
    d += `${i === 0 ? 'M' : 'L'}${a[0].toFixed(2)},${a[1].toFixed(2)} Q${x},${y} ${b[0].toFixed(2)},${b[1].toFixed(2)} `
  }
  return d + 'Z'
}

const CUT = 68, GAP = 8, R = 26, r = 11

/**
 * The login card with two corners cut on the diagonal (top on the reading side, bottom on the other),
 * a glass triangle sitting in each cut, and a light that runs round the whole edge.
 */
export function ChamferCard({ className, verified, children }: { className: string; verified: boolean; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  // Once verified, the card keeps the height it had: the content changes, the window does not shrink.
  const lastH = useRef(0)
  const verifiedNow = useRef(verified)
  verifiedNow.current = verified
  const lock = verified && lastH.current ? lastH.current : null
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => { if (!verifiedNow.current) lastH.current = el.offsetHeight; setSize({ w: el.offsetWidth, h: el.offsetHeight }) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const w = size?.w ?? 0, h = size?.h ?? 0
  // Physical corners: cut at top-right and bottom-left (the page reads right to left).
  const card = rounded([[0, 0], [w - CUT, 0], [w, CUT], [w, h], [CUT, h], [0, h - CUT]], [R, r, r, R, r, r])
  const inset = 0.75
  const edge = rounded([[inset, inset], [w - CUT, inset], [w - inset, CUT], [w - inset, h - inset], [CUT, h - inset], [inset, h - CUT]], [R, r, r, R, r, r])
  const s = CUT - GAP * Math.SQRT2
  const tri1 = rounded([[1, 1], [s - 1, 1], [s - 1, s - 1]], [9, 15, 9])
  const tri2 = rounded([[1, 1], [s - 1, s - 1], [1, s - 1]], [9, 9, 15])

  // Where each triangle travels to meet the other in the middle as one square, with a hairline between.
  const mx = w / 2 - s / 2, my = h / 2 - s / 2, split = 2.5
  const vars = { '--tx1': `${-(w - s - mx) + split}px`, '--ty1': `${my - split}px`, '--tx2': `${mx - split}px`, '--ty2': `${-(h - s - my) + split}px`, '--s': `${s}px` } as CSSProperties

  return (
    <div className="lc-shell" data-verified={verified || undefined} style={vars}>
      {size && <>
        <svg className="lc-tri t1" width={s} height={s} aria-hidden="true"><path d={tri1} /></svg>
        <svg className="lc-tri t2" width={s} height={s} aria-hidden="true"><path d={tri2} /></svg>
      </>}
      <section ref={ref} className={className} data-verified={verified || undefined} style={size ? { clipPath: `path("${card}")`, minHeight: lock ?? undefined } : undefined}>
        {size && (
          <svg className="lc-frame" width={w} height={h} aria-hidden="true">
            <path className="lc-frame-base" d={edge} pathLength={1000} />
            <path className="lc-frame-light" d={edge} pathLength={1000} />
            <path className="lc-frame-light l2" d={edge} pathLength={1000} />
          </svg>
        )}
        {children}
      </section>
    </div>
  )
}
