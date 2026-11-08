import { useState } from 'react'
import CopyLink from './CopyLink'

// A folded-corner tab tucked in the top-right corner. Tapping it opens a small panel
// with the room code, a rotate button and (households) the sound switch.
export default function DogEar({
  code,
  onRotate,
  sound,
}: {
  code: string
  onRotate: () => void
  sound?: { muted: boolean; onToggle: () => void }
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="dogear">
      <button
        type="button"
        className="dogear-tab"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="dogear-panel">
          <p className="muted">Room code</p>
          <p className="dogear-code">{code}</p>
          <CopyLink code={code} />
          <button type="button" onClick={onRotate}>
            Rotate board ↻
          </button>
          {sound && (
            <button type="button" aria-pressed={!sound.muted} onClick={sound.onToggle}>
              Sound: {sound.muted ? 'off' : 'on'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
