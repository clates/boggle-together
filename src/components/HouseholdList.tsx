import type { Participant } from '../lib/useRoom'
import ConfirmTap from './ConfirmTap'

export default function HouseholdList({
  participants,
  meId,
  onRemove,
}: {
  participants: Participant[]
  /** the current user's id: their own row gets no Remove button (they use Leave room) */
  meId?: string
  /** when given, each other household gets a two-tap Remove */
  onRemove?: (id: string) => void
}) {
  const households = participants.filter((p) => p.kind === 'household')
  const typists = participants.length - households.length
  return (
    <div className="household-list">
      <ul>
        {households.map((p) => (
          <li key={p.id}>
            <span aria-label={p.ready ? 'ready' : 'not ready'}>{p.ready ? '✅' : '⏳'}</span>{' '}
            <span>{p.name}</span>
            {onRemove && p.id !== meId && (
              <>
                {' '}
                <ConfirmTap label="Remove" ariaLabel={`Remove ${p.name}`} question={`Remove ${p.name}?`} onConfirm={() => onRemove(p.id)} />
              </>
            )}
          </li>
        ))}
      </ul>
      {typists > 0 && <p className="muted">{typists === 1 ? '1 person typing on a phone' : `${typists} people typing on phones`}</p>}
    </div>
  )
}
