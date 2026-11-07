import { useState } from 'react'

/** A two-tap action: the first tap asks "question  Yes / No", the second (Yes) runs it. */
export default function ConfirmTap({
  label,
  question,
  onConfirm,
  ariaLabel,
  className = 'subtle',
}: {
  label: string
  question: string
  onConfirm: () => void
  ariaLabel?: string
  className?: string
}) {
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button type="button" className={className} aria-label={ariaLabel} onClick={() => setAsking(true)}>
        {label}
      </button>
    )
  return (
    <span className="confirm-tap" role="group" aria-label={question}>
      <span>{question}</span>
      <button
        type="button"
        className="danger"
        onClick={() => {
          setAsking(false)
          onConfirm()
        }}
      >
        Yes
      </button>
      <button type="button" onClick={() => setAsking(false)}>
        No
      </button>
    </span>
  )
}
