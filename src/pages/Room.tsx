import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import CodeField from '../components/CodeField'
import HouseholdList from '../components/HouseholdList'
import JoinQr from '../components/JoinQr'
import LeaveRoom from '../components/LeaveRoom'
import { unlockAudio } from '../lib/audio'
import { isComplete, normalizeCode } from '../lib/roomCode'
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
      <JoinQr url={`${link}?m=type`} />
      <HouseholdList participants={participants} meId={me?.id} onRemove={(id) => void run(() => actions.removeParticipant(id))} />
      <button type="button" className="primary" onClick={() => (unlockAudio(), run(() => actions.setReady(!me?.ready)))}>
        Ready? {me?.ready ? '✅' : '⏳'}
      </button>
      {canForce && (
        <button type="button" className="secondary" onClick={() => (unlockAudio(), run(() => actions.startAnyway()))}>
          Start anyway
        </button>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <LeaveRoom onLeave={onLeave} />
    </main>
  )
}

// A retry of the same code (from the not-found page) must look it up again: each retry bumps a
// counter in the location state, which remounts the room and so reruns the lookup.
// Typists never tap Ready: the round starts when the shared screens do. A typist who made the room
// on their own phone has no shared screen yet, so they can make this device the shared screen.
function TypistLobby({ code, room, onLeave }: { code: string; room: Room; onLeave: () => Promise<void> }) {
  const { participants, me, actions, join } = room
  const [error, setError] = useState<string | null>(null)
  const households = participants.filter((p) => p.kind === 'household')
  const readyCount = households.filter((p) => p.ready).length

  async function becomeSharedScreen() {
    if (!me) return
    try {
      await actions.removeParticipant(me.id)
      await join('household', me.name)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  return (
    <main>
      <h1>You are in. Waiting for the game to start</h1>
      <p className="code">{code}</p>
      {households.length === 0 ? (
        <>
          <p>
            No shared screen has joined yet. A round starts when the shared screens (a tablet or laptop on each table) tap Ready, so open
            this room on one of them and your phone will show the board when it starts.
          </p>
          <p className="muted">Playing on just this device? Use it as the shared screen instead.</p>
          <button type="button" className="secondary" onClick={() => void becomeSharedScreen()}>
            Use this device as the shared screen
          </button>
        </>
      ) : (
        <p>
          {readyCount} of {households.length} shared {households.length === 1 ? 'screen is' : 'screens are'} ready. When the round starts, the
          board appears here and you type the words you find.
        </p>
      )}
      <HouseholdList participants={participants} meId={me?.id} />
      {error && <p role="alert" className="error">{error}</p>}
      <LeaveRoom onLeave={onLeave} />
    </main>
  )
}

export default function Room() {
  const retry = (useLocation().state as { retry?: number } | null)?.retry ?? 0
  return <RoomView key={retry} />
}

function RoomView() {
  // codes are stored uppercase; a link typed or lowercased by a chat app (or /r/pecan 2654) must still work
  const param = (useParams().code ?? '').trim().toUpperCase()
  const spoken = normalizeCode(param)
  const code = isComplete(spoken) ? spoken : param
  const retry = (useLocation().state as { retry?: number } | null)?.retry ?? 0
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
        <h1 className="not-found">
          No room with the code <span className="nowrap">{code}</span>
        </h1>
        <p className="muted">Check it against what was said, fix it here, and you will go straight in.</p>
        <CodeField
          key={code}
          label="Room code"
          initial={code}
          autoFocus={retry > 0}
          onGo={(c) => navigate(`/r/${c}`, { replace: true, state: { retry: retry + 1 } })}
        />
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
        <TypistLobby code={code} room={room} onLeave={leave} />
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
