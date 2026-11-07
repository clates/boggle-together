import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, type Client } from './supabase'

export type RoundWordsStatus = 'idle' | 'loading' | 'ready' | 'error'

export type RoundWords = {
  status: RoundWordsStatus
  /** participant id -> words, in the order the server returned them */
  byParticipant: Record<string, string[]>
  retry: () => void
}

const PAGE = 1000 // PostgREST max_rows
const LATE_REFETCH_MS = 2500 // words in flight when results opened land within the 2 s grace

async function fetchAll(client: Client, code: string, round: number): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {}
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('words')
      .select('participant_id, word')
      .eq('room_code', code)
      .eq('round', round)
      .order('participant_id')
      .order('word')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { participant_id: string; word: string }[]
    for (const r of rows) (out[r.participant_id] ??= []).push(r.word)
    if (rows.length < PAGE) return out
  }
}

/** All words of one round of a room (readable by members once results are open). */
export function useRoundWords(code: string, round: number | null, enabled: boolean, client: Client = supabase): RoundWords {
  const [status, setStatus] = useState<RoundWordsStatus>('idle')
  const [byParticipant, setByParticipant] = useState<Record<string, string[]>>({})
  const [attempt, setAttempt] = useState(0)
  const loaded = useRef(false)

  useEffect(() => {
    loaded.current = false
    setByParticipant({})
    setStatus('idle')
  }, [code, round])

  useEffect(() => {
    if (!enabled || round === null) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetchAll(client, code, round)
        if (cancelled) return
        loaded.current = true
        setByParticipant(res)
        setStatus('ready')
      } catch {
        // a failed late refetch keeps what we already have
        if (!cancelled && !loaded.current) setStatus('error')
      }
    }
    if (!loaded.current) setStatus('loading')
    void load()
    const late = setTimeout(load, LATE_REFETCH_MS)
    return () => {
      cancelled = true
      clearTimeout(late)
    }
  }, [client, code, round, enabled, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { status, byParticipant, retry }
}
