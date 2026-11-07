import { useEffect, useRef, useState, type FormEvent } from 'react'
import Board, { type Rotation } from '../components/Board'
import Countdown from '../components/Countdown'
import TimerFill from '../components/TimerFill'
import { progress } from '../lib/phase'
import { sendWithRetry } from '../lib/retry'
import { isServerRejection } from '../lib/rpcError'
import { normalizeWord } from '../lib/words'
import type { useRoom } from '../lib/useRoom'
import { useVisualViewport } from '../lib/useVisualViewport'

// The slice of the room hook this screen needs (the hook's return satisfies it).
// No audio here: typists stay silent, so this screen never touches the audio engine.
export type TypistRoom = Pick<ReturnType<typeof useRoom>, 'me' | 'phase' | 'room' | 'serverNowMs' | 'board'> & {
  actions: { submitWord: (w: string) => Promise<void> }
}

const HINT = '3 letters or more, A to Z only'
const OFFLINE = "Couldn't send. Check your connection."
const FRIENDLY: Record<string, string> = { 'Too late': 'Too late', 'Word limit reached': 'Word limit reached' }

export default function Typist({
  room,
  loadOwnWords,
}: {
  room: TypistRoom
  loadOwnWords?: () => Promise<string[]>
}) {
  const { phase, actions, board, serverNowMs } = room
  const rootRef = useRef<HTMLDivElement>(null)
  useVisualViewport(rootRef)
  const [rotation, setRotation] = useState<Rotation>(0)
  const rotate = () => setRotation((r) => (((r + 90) % 360) as Rotation))
  const [text, setText] = useState('')
  const [words, setWords] = useState<string[]>([]) // newest first
  const [message, setMessage] = useState<string | null>(null)
  const [sending, setSending] = useState<Set<string>>(() => new Set()) // words being retried
  const inputRef = useRef<HTMLInputElement>(null)
  const typing = phase === 'playing' || phase === 'locked'

  // focus when playing starts
  useEffect(() => {
    if (phase === 'playing') inputRef.current?.focus()
  }, [phase])

  // after a refresh mid-round, bring back the words the server already has
  useEffect(() => {
    if (!typing || !loadOwnWords) return
    let cancelled = false
    loadOwnWords().then(
      (old) => {
        if (cancelled) return
        setWords((cur) => [...cur, ...old.filter((w) => !cur.includes(w))])
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
    // once per mount that reaches a typing phase
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing])

  function submit(e: FormEvent) {
    e.preventDefault()
    const word = normalizeWord(text)
    if (!word) {
      setMessage(HINT)
      return
    }
    setText('')
    setMessage(null)
    if (words.includes(word)) return
    setWords((cur) => [word, ...cur])
    const mark = (on: boolean) =>
      setSending((cur) => {
        if (cur.has(word) === on) return cur
        const next = new Set(cur)
        if (on) next.add(word)
        else next.delete(word)
        return next
      })
    // network failures retry (a duplicate is ignored server-side); only a server answer is final
    sendWithRetry(() => actions.submitWord(word), { onRetry: () => mark(true) }).then(
      () => mark(false),
      (err: unknown) => {
        mark(false)
        setWords((cur) => cur.filter((w) => w !== word))
        if (isServerRejection(err)) {
          const msg = err instanceof Error ? err.message : ''
          setMessage(FRIENDLY[msg] ?? (msg || 'Something went wrong'))
        } else setMessage(OFFLINE)
      },
    )
  }

  const now = serverNowMs()
  const times = room.room ?? { start_at: null, ends_at: null, results_at: null }
  const p = phase === 'playing' ? progress(times, now) : 0

  return (
    <div ref={rootRef} className={`typist typist-${phase}`} data-testid="typist">
      <TimerFill progress={p} />
      {phase === 'countdown' ? (
        <Countdown startAt={times.start_at ? Date.parse(times.start_at) : NaN} now={now} />
      ) : (
        <div className="typist-layout">
          <div className="typist-board">
            {board ? <Board letters={board} rotation={rotation} /> : <div className="board-blank" aria-label="Loading board" />}
          </div>
          <div className="typist-side">
            {phase === 'locked' && <h1 className="typist-timesup">Time's up!</h1>}
            <form onSubmit={submit} className="typist-form">
              <input
                ref={inputRef}
                type="text"
                className="typist-input"
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setMessage(null)
                }}
                aria-label="Word"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
              />
            </form>
            {message && (
              <p role="alert" className="error typist-message">
                {message}
              </p>
            )}
            <section className="typist-words">
              <div className="typist-words-head">
                <p className="typist-count">{words.length === 1 ? '1 word' : `${words.length} words`}</p>
                <button type="button" className="subtle typist-rotate" onClick={rotate}>
                  Rotate board ↻
                </button>
              </div>
              <ul className="typist-list">
                {words.map((w) => (
                  <li key={w}>
                    {w}
                    {sending.has(w) && <span className="muted"> sending...</span>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
