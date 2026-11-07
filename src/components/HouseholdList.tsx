import type { Participant } from '../lib/useRoom'

export default function HouseholdList({ participants }: { participants: Participant[] }) {
  const households = participants.filter((p) => p.kind === 'household')
  const typists = participants.length - households.length
  return (
    <div className="household-list">
      <ul>
        {households.map((p) => (
          <li key={p.id}>
            <span aria-label={p.ready ? 'ready' : 'not ready'}>{p.ready ? '✅' : '⏳'}</span>{' '}
            <span>{p.name}</span>
          </li>
        ))}
      </ul>
      {typists > 0 && <p className="muted">{typists} typing their words</p>}
    </div>
  )
}
