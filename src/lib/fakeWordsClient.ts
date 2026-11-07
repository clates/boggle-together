import type { Client } from './supabase'

// Test helper.
export type Row = { participant_id: string; word: string }
export type Resp = { data: Row[] | null; error: { message: string } | null }

// A tiny stand-in for the supabase query builder: records filters and the range, then answers.
export function fakeWordsClient(respond: (q: { table: string; filters: Record<string, unknown>; from: number; to: number }) => Resp) {
  const queries: { table: string; filters: Record<string, unknown>; from: number; to: number }[] = []
  const client = {
    from(table: string) {
      const q = { table, filters: {} as Record<string, unknown>, from: 0, to: Infinity }
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => ((q.filters[k] = v), b),
        order: () => b,
        range: (f: number, t: number) => ((q.from = f), (q.to = t), b),
        then: (res: (r: Resp) => unknown, rej: (e: unknown) => unknown) => {
          queries.push(q)
          return Promise.resolve().then(() => respond(q)).then(res, rej)
        },
      }
      return b
    },
  }
  return { client: client as unknown as Client, queries }
}

