import { useEffect, useRef, useState } from 'react'
import Board, { type Rotation } from '../components/Board'
import DogEar from '../components/DogEar'
import { useRoundAudio } from '../lib/audio/useRoundAudio'
import { drainColor } from '../lib/drain'
import { progress } from '../lib/phase'
import type { useRoom } from '../lib/useRoom'

// The slice of the room hook this screen needs (the hook's return satisfies it).
export type InGameRoom = Pick<ReturnType<typeof useRoom>, 'room' | 'me' | 'phase' | 'serverNowMs' | 'board' | 'actions'>

const SHOW_RESULTS_AFTER_MS = 30_000
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')

function Countdown({ startAt, now }: { startAt: number; now: number }) {
  const seconds = Number.isFinite(startAt) ? Math.max(0, Math.ceil((startAt - now) / 1000)) : 0
  return (
    <div className="countdown">
      <p className="countdown-number" data-testid="countdown" aria-live="assertive">
        {seconds}
      </p>
      <p className="countdown-line">Get your pens ready</p>
    </div>
  )
}

function Locked({ room }: { room: InGameRoom }) {
  const { actions, me, serverNowMs } = room
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [showing, setShowing] = useState(false)
  const busy = useRef(false)
  const [, force] = useState(0)

  const endsAt = room.room?.ends_at ? Date.parse(room.room.ends_at) : NaN
  const canShow = Number.isFinite(endsAt) && serverNowMs() >= endsAt + SHOW_RESULTS_AFTER_MS

  // The hook stops ticking once locked, so wake up ourselves when "Show results" is due.
  useEffect(() => {
    if (canShow || !Number.isFinite(endsAt)) return
    const delay = Math.max(0, endsAt + SHOW_RESULTS_AFTER_MS - serverNowMs()) + 50
    const t = setTimeout(() => force((n) => n + 1), delay)
    return () => clearTimeout(t)
  }, [canShow, endsAt, serverNowMs])

  async function pensDown() {
    if (busy.current) return
    busy.current = true
    setState('sending')
    setError(null)
    try {
      await actions.pensDown()
      setState('done')
    } catch (e) {
      busy.current = false
      setState('idle')
      setError(errMsg(e))
    }
  }

  async function showResults() {
    if (showing) return
    setShowing(true)
    setError(null)
    try {
      await actions.showResults()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setShowing(false)
    }
  }

  const waiting = state === 'done' || me?.pens_down
  return (
    <div className="locked-bar">
      {waiting ? (
        <p className="waiting">Waiting for the other households...</p>
      ) : (
        <button type="button" className="pens-down" onClick={pensDown} disabled={state === 'sending'}>
          Pens down!
        </button>
      )}
      {canShow && (
        <button type="button" className="show-results" onClick={showResults} disabled={showing}>
          Show results
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  )
}

function SoundPrompt({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="sound-prompt">
      <button type="button" className="sound-enable" onClick={onEnable}>
        🔈 Tap to enable sound
      </button>
      <p className="sound-note">On an iPad, the side switch (mute) silences sound.</p>
    </div>
  )
}

export default function InGame({ code, room }: { code: string; room: InGameRoom }) {
  const { phase, board, serverNowMs } = room
  const audio = useRoundAudio(room.room, phase, serverNowMs)
  const prompt = audio.status === 'locked'
  const [rotation, setRotation] = useState<Rotation>(0)
  const rotate = () => setRotation((r) => (((r + 90) % 360) as Rotation))

  const now = serverNowMs()
  const times = room.room ?? { start_at: null, ends_at: null, results_at: null }
  const p = phase === 'playing' ? progress(times, now) : 0

  return (
    <div className={`ingame ingame-${phase}${prompt ? ' ingame-sound-prompt' : ''}`} data-testid="in-game">
      {p > 0 && (
        <div
          className="fill"
          data-testid="fill"
          aria-hidden="true"
          style={{ height: `${p * 100}%`, background: drainColor(p) }}
        />
      )}
      {phase === 'countdown' ? (
        <Countdown startAt={times.start_at ? Date.parse(times.start_at) : NaN} now={now} />
      ) : (
        <div className="stage">
          {board ? <Board letters={board} rotation={rotation} /> : <div className="board-blank" aria-label="Loading board" />}
        </div>
      )}
      {phase === 'locked' && <Locked room={room} />}
      {prompt && <SoundPrompt onEnable={audio.unlock} />}
      <DogEar code={code} onRotate={rotate} sound={{ muted: audio.muted, onToggle: audio.toggleMute }} />
    </div>
  )
}
