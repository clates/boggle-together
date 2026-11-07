import { useState } from 'react'

// A folded-corner tab tucked in the top-right corner. Tapping it opens a small panel
// with the room code and a rotate button.
export default function DogEar({ code, onRotate }: { code: string; onRotate: () => void }) {
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
          <button type="button" onClick={onRotate}>
            Rotate board ↻
          </button>
        </div>
      )}
    </div>
  )
}
