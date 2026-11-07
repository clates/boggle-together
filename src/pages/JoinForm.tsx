import { useState, type FormEvent } from 'react'

type Kind = 'household' | 'typist'
const MAX = 24

export default function JoinForm({ onJoin }: { onJoin: (kind: Kind, name: string) => Promise<void> }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>('household')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        <div className="choices">
          <label>
            <input type="radio" name="kind" checked={kind === 'household'} onChange={() => setKind('household')} />
            Shared screen
          </label>
          <label>
            <input type="radio" name="kind" checked={kind === 'typist'} onChange={() => setKind('typist')} />
            Type my words
          </label>
        </div>
        <button type="submit" className="primary" disabled={busy}>
          Join
        </button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  )
}
