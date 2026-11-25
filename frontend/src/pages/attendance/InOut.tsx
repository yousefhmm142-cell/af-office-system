import { clock12 } from '../../lib/format'

/** Arrival in dark green, leaving in mulberry, only a dash between them. */
export function InOut({ inAt, outAt }: { inAt: string; outAt: string | null }) {
  return (
    <span className="inout num">
      <b className="t-in" title="حضور">{clock12(inAt)}</b>
      {outAt && (
        <>
          <span className="t-dash" aria-hidden="true">-</span>
          <b className="t-out" title="انصراف">{clock12(outAt)}</b>
        </>
      )}
    </span>
  )
}
