import { useState } from 'react'
import ConfirmTap from './ConfirmTap'

/** "Leave room" with a two-tap confirm; shows the error if leaving fails. */
export default function LeaveRoom({ onLeave }: { onLeave: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="leave-room">
      <ConfirmTap
        label="Leave room"
        question="Leave this room?"
        onConfirm={() => {
          setError(null)
          onLeave().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong'))
        }}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}
