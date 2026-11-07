import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import CodeField from '../components/CodeField'
import { ensureSession, supabase } from '../lib/supabase'

// Focus the code field on tablets and laptops; on phones a keyboard popping up would hide the page.
const wideScreen = () => {
  try {
    return window.matchMedia('(min-width: 600px)').matches
  } catch {
    return false
  }
}

export default function Home() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [autoFocus] = useState(wideScreen)

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

  return (
    <main>
      <h1>Boggle Together</h1>
      <p className="intro" data-testid="home-intro">
        Stretch your table across town for game night. Everyone writes on paper while one shared board and timer keep
        every household in step. Best alongside a voice or video call.
      </p>
      <button type="button" className="primary" onClick={start} disabled={busy}>
        Start a room
      </button>
      {error && <p role="alert" className="error">{error}</p>}
      <CodeField label="Have a room code? Type it here" onGo={(code) => navigate(`/r/${code}`)} autoFocus={autoFocus} />
    </main>
  )
}
