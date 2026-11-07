import { useId, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { loadMode, loadName, saveMode, saveName, type Mode } from '../lib/remember'

const MAX = 24

const MODES: { kind: Mode; title: string; line: string }[] = [
  {
    kind: 'household',
    title: 'Shared screen',
    line: 'One device per household, usually a tablet or laptop in the middle of the table, that shows the board for everyone around it.',
  },
  {
    kind: 'typist',
    title: 'Type on my phone',
    line: 'Enter the words you find on your own phone as you play. The results show which of your words no other typist found.',
  },
]

export default function JoinForm({ onJoin }: { onJoin: (kind: Mode, name: string) => Promise<void> }) {
  const [params] = useSearchParams()
  const [name, setName] = useState(loadName)
  // ?m=type comes from a link meant for phones; it wins over whatever this browser remembers.
  const [kind, setKind] = useState<Mode>(() => (params.get('m') === 'type' ? 'typist' : loadMode() ?? 'household'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const id = useId()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (n.length < 1 || n.length > MAX) {
      setError(`Name must be 1 to ${MAX} characters`)
      return
    }
    setError(null)
    setBusy(true)
    try {
      await onJoin(kind, n)
      saveName(n)
      saveMode(kind)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <h1>Join the game</h1>
      <form onSubmit={submit}>
        <label>
          Your name (1 to {MAX} characters)
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <fieldset className="mode-cards">
          <legend>How will you play?</legend>
          {MODES.map((m) => (
            <label key={m.kind} className={`mode-card${kind === m.kind ? ' selected' : ''}`}>
              <input
                type="radio"
                name="kind"
                value={m.kind}
                checked={kind === m.kind}
                onChange={() => setKind(m.kind)}
                aria-labelledby={`${id}-${m.kind}-title`}
                aria-describedby={`${id}-${m.kind}-line`}
              />
              <span className="mode-text">
                <span id={`${id}-${m.kind}-title`} className="mode-title">{m.title}</span>
                <span id={`${id}-${m.kind}-line`} className="mode-line">{m.line}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="primary" disabled={busy}>
          Join
        </button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  )
}
