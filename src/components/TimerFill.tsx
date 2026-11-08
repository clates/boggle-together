import type { CSSProperties } from 'react'
import { drainColor, drainEdge, LOW_AT } from '../lib/drain'

// The timer is the background: a layer anchored at the bottom whose height is the time left.
// Shared by the household screen and the typist phone so both drain identically. The colour comes
// in as --fill (with a darker waterline --fill-edge on top); in the last 20% it also gets static stripes.
export default function TimerFill({ progress }: { progress: number }) {
  if (!(progress > 0)) return null
  const style = { height: `${progress * 100}%`, '--fill': drainColor(progress), '--fill-edge': drainEdge(progress) } as CSSProperties
  return <div className={progress <= LOW_AT ? 'fill fill-low' : 'fill'} data-testid="fill" aria-hidden="true" style={style} />
}
