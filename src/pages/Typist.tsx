import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Phase } from '../lib/phase'
import { sendWithRetry } from '../lib/retry'
import { isServerRejection } from '../lib/rpcError'
import { normalizeWord } from '../lib/words'
import type { useRoom } from '../lib/useRoom'

type Room = ReturnType<typeof useRoom>
export type TypistRoom = {
  me: Room['me']
  phase: Phase
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
  const { phase, actions } = room
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

  if (phase === 'countdown') {
    return (
      <main>
        <h1>Get ready...</h1>
        <p>The board will appear on your household's screen.</p>
      </main>
    )
  }

  return (
    <main>
      {phase === 'locked' && <h1>Time's up!</h1>}
      <form onSubmit={submit}>
        <input
          ref={inputRef}
          type="text"
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
          style={{ fontSize: 24, width: '100%', boxSizing: 'border-box' }}
        />
      </form>
      {message && <p role="alert" className="error">{message}</p>}
      <p className="muted">{words.length === 1 ? '1 word' : `${words.length} words`}</p>
      <ul style={{ listStyle: 'none', padding: 0, fontSize: 20 }}>
        {words.map((w) => (
          <li key={w}>
            {w}
            {sending.has(w) && <span className="muted"> sending...</span>}
          </li>
        ))}
      </ul>
    </main>
  )
}
