import HouseholdList from '../components/HouseholdList'
import type { Participant } from '../lib/useRoom'

// STUB: Task 10 replaces this with the real results view.
export default function ResultsStub({
  participants,
  me,
  onToggleReady,
}: {
  participants: Participant[]
  me: Participant | null
  onToggleReady: () => void
}) {
  return (
    <main data-testid="results-stub">
      <h1>Results</h1>
      <HouseholdList participants={participants} />
      {me?.kind === 'household' && (
        <button type="button" className="primary" onClick={onToggleReady}>
          Ready? {me.ready ? '✅' : '⏳'}
        </button>
      )}
    </main>
  )
}
