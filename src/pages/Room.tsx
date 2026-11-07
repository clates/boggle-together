import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import HouseholdList from '../components/HouseholdList'
import { useRoom } from '../lib/useRoom'
import InGameStub from './InGame'
import JoinForm from './JoinForm'
import ResultsStub from './Results'
import TypistStub from './Typist'

type Room = ReturnType<typeof useRoom>

function Lobby({ code, room }: { code: string; room: Room }) {
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
      <HouseholdList participants={participants} />
      <button type="button" className="primary" onClick={() => run(() => actions.setReady(!me?.ready))}>
        Ready? {me?.ready ? '✅' : '⏳'}
      </button>
      {canForce && (
        <button type="button" onClick={() => run(() => actions.startAnyway())}>
          Start anyway
        </button>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </main>
  )
}

export default function Room() {
  const { code = '' } = useParams()
  const room = useRoom(code)
  const { status, me, phase, participants, actions } = room

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
  switch (phase) {
    case 'lobby':
      return isTypist ? (
        <main>
          <h1>Waiting for the game to start</h1>
          <p className="code">{code}</p>
        </main>
      ) : (
        <Lobby code={code} room={room} />
      )
    case 'countdown':
    case 'playing':
    case 'locked':
      return isTypist ? <TypistStub phase={phase} code={code} /> : <InGameStub phase={phase} code={code} />
    default:
      return <ResultsStub participants={participants} me={me} onToggleReady={() => void actions.setReady(!me?.ready)} />
  }
}
