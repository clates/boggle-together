import { drainColor } from '../lib/drain'

// The timer is the background: a layer anchored at the bottom whose height is the time left.
// Shared by the household screen and the typist phone so both drain identically.
export default function TimerFill({ progress }: { progress: number }) {
  if (!(progress > 0)) return null
  return (
    <div
      className="fill"
      data-testid="fill"
      aria-hidden="true"
      style={{ height: `${progress * 100}%`, background: drainColor(progress) }}
    />
  )
}
