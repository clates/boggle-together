export type Env = { PROD?: boolean; VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }

const LOCAL_URL = 'http://127.0.0.1:54321'

function missing(env: Env): string[] {
  return (['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const).filter((k) => !env[k])
}

/** A message naming the missing settings in a production build, or null when the site can start. */
export function configProblem(env: Env): string | null {
  const m = missing(env)
  if (!env.PROD || m.length === 0) return null
  return `Missing ${m.join(', ')}. Set ${m.length > 1 ? 'them' : 'it'} for the production build and deploy again.`
}

/** The Supabase URL and key. Throws in production when either is missing; dev and tests fall back to the local stack. */
export function readConfig(env: Env): { url: string; key: string } {
  const problem = configProblem(env)
  if (problem) throw new Error(`Boggle Together is not configured: ${problem}`)
  return { url: env.VITE_SUPABASE_URL || LOCAL_URL, key: env.VITE_SUPABASE_ANON_KEY || 'missing-anon-key' }
}
