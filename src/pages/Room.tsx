import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HouseholdList from '../components/HouseholdList'
import LeaveRoom from '../components/LeaveRoom'
import { unlockAudio } from '../lib/audio'
import { useRoom } from '../lib/useRoom'
import { supabase } from '../lib/supabase'
import InGame from './InGame'
import JoinForm from './JoinForm'
import Results from './Results'
import Typist from './Typist'

type Room = ReturnType<typeof useRoom>

function Lobby({ code, room, onLeave }: { code: string; room: Room; onLeave: () => Promise<void> }) {
  const { participants, me, actions } = room
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const link = `${location.origin}/r/${code}`
  const households = participants.filter((p) => p.kind === 'household')
  const readyCount = households.filter((p) => p.ready).length
  const canForce = households.length > 0 && readyCount >= Math.ceil(households.length / 2) && readyCount < households.length

  const run = (fn: () => Promise<void>) => fn().then(() => setError(null), (e) => setError(e instanceof Error ? e.message : 'Something went wrong'))

  async function copy() {
    try {
      await navigator.clipboard?.writeText(link)
      setCopied(true)
    } catch {
      /* ignore */
    }
  }

  return (
    <main>
      <p className="muted">Room code</p>
      <p className="code">{code}</p>
      <p>
        <span className="link">{link}</span>{' '}
        <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      </p>
      <HouseholdList participants={participants} meId={me?.id} onRemove={(id) => void run(() => actions.removeParticipant(id))} />
      <button type="button" className="primary" onClick={() => (unlockAudio(), run(() => actions.setReady(!me?.ready)))}>
        Ready? {me?.ready ? '✅' : '⏳'}
      </button>
      {canForce && (
        <button type="button" onClick={() => (unlockAudio(), run(() => actions.startAnyway()))}>
          Start anyway
        </button>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <LeaveRoom onLeave={onLeave} />
    </main>
  )
}

export default function Room() {
  // codes are stored uppercase; a link typed or lowercased by a chat app must still work
  const code = (useParams().code ?? '').trim().toUpperCase()
  const room = useRoom(code)
  const { status, me, phase } = room
  const navigate = useNavigate()
  const leave = async () => {
    if (me) await room.actions.removeParticipant(me.id)
    navigate('/')
  }

  if (status === 'loading') return <main><p className="muted">Loading...</p></main>
  if (status === 'not-found')
    return (
      <main>
        <h1>Room not found</h1>
        <Link to="/">Back to home</Link>
      </main>
    )
  if (status === 'needs-join') return <JoinForm onJoin={room.join} />

  const isTypist = me?.kind === 'typist'
  const loadOwnWords = async () => {
    const { data } = await supabase.from('words').select('word').eq('room_code', code).eq('round', room.room?.round ?? 0).eq('participant_id', me?.id ?? '')
    return (data ?? []).map((r: { word: string }) => r.word)
  }
  switch (phase) {
    case 'lobby':
      return isTypist ? (
        <main>
          <h1>Waiting for the game to start</h1>
          <p className="code">{code}</p>
          <LeaveRoom onLeave={leave} />
        </main>
      ) : (
        <Lobby code={code} room={room} onLeave={leave} />
      )
    case 'countdown':
    case 'playing':
    case 'locked':
      return isTypist ? <Typist room={room} loadOwnWords={loadOwnWords} /> : <InGame code={code} room={room} />
    default:
      return <Results code={code} room={room} onLeave={leave} />
  }
}
