import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Client = SupabaseClient

export const supabase: Client = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:54321',
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'missing-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true } },
)

const inflight = new WeakMap<object, Promise<string>>()

/** Signs in anonymously if there is no stored session; returns the user id. Safe to call concurrently. */
export function ensureSession(client: Client = supabase): Promise<string> {
  let p = inflight.get(client)
  if (!p) {
    p = (async () => {
      const { data } = await client.auth.getSession()
      if (data.session) return data.session.user.id
      const { data: s, error } = await client.auth.signInAnonymously()
      if (error || !s.user) throw error ?? new Error('Anonymous sign-in failed')
      return s.user.id
    })()
    p.catch(() => inflight.delete(client))
    inflight.set(client, p)
  }
  return p
}
