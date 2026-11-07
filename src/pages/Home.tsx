import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ensureSession, supabase } from '../lib/supabase'

export default function Home() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function start() {
    setError(null)
    setBusy(true)
    try {
      await ensureSession()
      const { data, error: err } = await supabase.rpc('create_room')
      if (err) throw new Error(err.message)
      navigate(`/r/${data as string}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a room')
    } finally {
      setBusy(false)
    }
  }

  function join(e: FormEvent) {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (!c) {
      setError('Enter a room code')
      return
    }
    navigate(`/r/${c}`)
  }

  return (
    <main>
      <h1>Boggle Together</h1>
      <button type="button" className="primary" onClick={start} disabled={busy}>
        Start a room
      </button>
      <form onSubmit={join}>
        <label>
          Room code
          <input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" />
        </label>
        <button type="submit">Join a room</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  )
}
