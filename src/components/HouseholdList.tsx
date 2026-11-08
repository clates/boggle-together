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
  const typists = participants.filter((p) => p.kind === 'typist')
  const remove = (p: Participant) =>
    onRemove && p.id !== meId ? (
      <>
        {' '}
        <ConfirmTap label="Remove" ariaLabel={`Remove ${p.name}`} question={`Remove ${p.name}?`} onConfirm={() => onRemove(p.id)} />
      </>
    ) : null
  return (
    <div className="household-list">
      <ul>
        {households.map((p) => (
          <li key={p.id}>
            <span aria-label={p.ready ? 'ready' : 'not ready'}>{p.ready ? '✅' : '⏳'}</span>{' '}
            <span>{p.name}</span>
            {remove(p)}
          </li>
        ))}
      </ul>
      {typists.length > 0 && (
        <>
          <p className="muted">{typists.length === 1 ? 'Typing on a phone' : 'Typing on phones'}</p>
          <ul className="typist-names">
            {typists.map((p) => (
              <li key={p.id}>
                <span aria-hidden="true">⌨️</span> <span>{p.name}</span>
                {remove(p)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
