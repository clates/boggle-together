import { execFileSync } from 'node:child_process'
import { assertLocalDbUrl } from './guards'

// `postgres` connection to the LOCAL Supabase database only. These helpers change database
// settings and restart containers, so they refuse to touch anything but the local stack.
export const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
export const API_URL = 'http://127.0.0.1:54321'

const assertLocal = assertLocalDbUrl

export function psql(sql: string): string {
  assertLocal(DB_URL)
  return execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { encoding: 'utf8' }).trim()
}

// Short rounds for tests. start_round reads boggle.countdown_seconds / boggle.round_seconds via
// current_setting(). On Supabase the `postgres` role is not a superuser, and Postgres only lets
// superusers persist custom (placeholder) settings with ALTER DATABASE / ROLE / FUNCTION ... SET
// ("permission denied to set parameter"). So instead we register a PostgREST pre-request function
// (PostgREST's documented in-database config, which `postgres` may set on `authenticator`) that
// sets both values transaction-locally for every API request.
export function enableShortRounds(countdownSeconds: number, roundSeconds: number) {
  psql(`create or replace function public.e2e_short_rounds() returns void language sql as $$
    select set_config('boggle.countdown_seconds', '${countdownSeconds}', true),
           set_config('boggle.round_seconds', '${roundSeconds}', true);
  $$`)
  psql('grant execute on function public.e2e_short_rounds() to anon, authenticated')
  psql(`alter role authenticator set pgrst.db_pre_request = 'public.e2e_short_rounds'`)
}

export function disableShortRounds() {
  psql('alter role authenticator reset pgrst.db_pre_request')
  psql('drop function if exists public.e2e_short_rounds()')
}

// PostgREST reads its in-database config at startup, so restart its local container (about a
// second; this also drops its pooled connections) and wait until it answers again.
// (Terminating its backends with pg_terminate_backend leaves dead connections in the pool and a
// few requests then fail with 503; a restart is cleaner.)
export async function restartRest() {
  assertLocal(DB_URL)
  const names = execFileSync('docker', ['ps', '--filter', 'name=supabase_rest_', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  if (names.length !== 1) throw new Error(`Expected one local supabase_rest_* container, found: ${names.join(', ') || 'none'}`)
  execFileSync('docker', ['restart', names[0]], { stdio: 'ignore' })
  const deadline = Date.now() + 30_000
  let ok = 0
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_URL}/rest/v1/`, { method: 'HEAD' })
      ok = res.status < 500 ? ok + 1 : 0
    } catch {
      ok = 0
    }
    if (ok >= 3) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('PostgREST did not come back after restart')
}
