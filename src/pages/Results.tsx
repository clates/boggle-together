import { useMemo, useState } from 'react'
import Board from '../components/Board'
import HouseholdList from '../components/HouseholdList'
import type { Client } from '../lib/supabase'
import type { Participant, useRoom } from '../lib/useRoom'
import { useRoundWords, type RoundWordsStatus } from '../lib/useRoundWords'
import { markShared } from '../lib/words'

// The slice of the room hook this screen needs (the hook's return satisfies it).
export type ResultsRoom = Pick<ReturnType<typeof useRoom>, 'room' | 'participants' | 'me' | 'board'> & {
  actions: Pick<ReturnType<typeof useRoom>['actions'], 'setReady' | 'startAnyway'>
}

export type ResultsColumn = { id: string; name: string; words: { word: string; shared: boolean }[] }

export type ResultsControls = {
  ready: boolean
  canForce: boolean
  onReady: () => void
  onStartAnyway: () => void
  error: string | null
}

export type ResultsViewProps = {
  code: string
  board: string[] | null
  participants: Participant[]
  columns: ResultsColumn[]
  wordsStatus: RoundWordsStatus
  onRetry: () => void
  /** Ready / Start anyway; null for typists */
  controls: ResultsControls | null
}

const LARGE_UP_TO = 4

function WordColumns({ columns }: { columns: ResultsColumn[] }) {
  const size = columns.length <= LARGE_UP_TO ? 'large' : 'small'
  return (
    <div className={`results-words results-words-${size}`} data-size={size} data-testid="results-words" style={{ overflow: 'auto' }}>
      <div className="results-cols">
        {columns.map((c) => (
          <section key={c.id} className="results-col" data-testid="results-col">
            <h2 className="results-name" data-testid="results-name" style={{ position: 'sticky', top: 0 }}>
              <span className="results-name-text">{c.name}</span> <span className="results-count">{c.words.length}</span>
            </h2>
            <ul className="results-list">
              {c.words.map((w) => (
                <li key={w.word}>{w.shared ? <s>{w.word}</s> : <b>{w.word}</b>}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

export function ResultsView({ code, board, participants, columns, wordsStatus, onRetry, controls }: ResultsViewProps) {
  let words
  if (wordsStatus === 'error')
    words = (
      <div className="results-note">
        <p>Could not load the words.</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    )
  else if (columns.length === 0)
    words = (
      <div className="results-note">
        <p>Nobody typed their words this round. Score on paper!</p>
      </div>
    )
  else if (wordsStatus !== 'ready')
    words = (
      <div className="results-note">
        <p className="muted">Loading words...</p>
      </div>
    )
  else words = <WordColumns columns={columns} />

  return (
    <div className="results" data-testid="results">
      <aside className="results-side">
        <div className="results-board">{board ? <Board letters={board} rotation={0} /> : <div className="board-wrap" />}</div>
        <div className="results-info">
          <div>
            <p className="results-room-label">Room</p>
            <p className="results-room-code">{code}</p>
          </div>
          <HouseholdList participants={participants} />
          {controls && (
            <div className="results-controls">
              <button type="button" className="primary" onClick={controls.onReady}>
                Ready? {controls.ready ? '✅' : '⏳'}
              </button>
              {controls.canForce && (
                <button type="button" onClick={controls.onStartAnyway}>
                  Start anyway
                </button>
              )}
              {controls.error && (
                <p role="alert" className="error">
                  {controls.error}
                </p>
              )}
            </div>
          )}
        </div>
      </aside>
      {words}
    </div>
  )
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')
const joined = (p: Participant) => (typeof p.joined_at === 'string' ? p.joined_at : '')

export default function Results({ code, room, client }: { code: string; room: ResultsRoom; client?: Client }) {
  const { participants, me, board, actions } = room
  const round = room.room?.round ?? null
  const words = useRoundWords(code, round, round !== null, client)
  const [error, setError] = useState<string | null>(null)

  // join order, so lists do not reshuffle between reloads
  const ordered = useMemo(() => [...participants].sort((a, b) => (joined(a) < joined(b) ? -1 : joined(a) > joined(b) ? 1 : 0)), [participants])

  const columns = useMemo(() => {
    const typists = ordered.filter((p) => p.kind === 'typist')
    const marked = markShared(Object.fromEntries(typists.map((t) => [t.id, words.byParticipant[t.id] ?? []])))
    return typists.map((t) => ({ id: t.id, name: t.name, words: marked[t.id] }))
  }, [ordered, words.byParticipant])

  const households = participants.filter((p) => p.kind === 'household')
  const readyCount = households.filter((p) => p.ready).length
  const canForce = households.length > 0 && readyCount >= Math.ceil(households.length / 2) && readyCount < households.length
  const run = (fn: () => Promise<void>) => fn().then(() => setError(null), (e) => setError(errMsg(e)))

  const controls: ResultsControls | null =
    me?.kind === 'household'
      ? {
          ready: me.ready,
          canForce,
          onReady: () => run(() => actions.setReady(!me.ready)),
          onStartAnyway: () => run(() => actions.startAnyway()),
          error,
        }
      : null

  return (
    <ResultsView
      code={code}
      board={board}
      participants={ordered}
      columns={columns}
      wordsStatus={words.status}
      onRetry={words.retry}
      controls={controls}
    />
  )
}
