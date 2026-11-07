// Safety guards: the e2e harness changes database settings and restarts containers, and the
// browser app writes rooms, so both must point at the LOCAL Supabase stack only.

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

/** The psql URL must be exactly the local stack: no query string or `host=` (libpq would follow it elsewhere). */
export function assertLocalDbUrl(url: string) {
  const refuse = (why: string) => {
    throw new Error(`Refusing to run e2e DB setup against ${why}; only postgresql://...@127.0.0.1:54322 (local Supabase) is allowed`)
  }
  if (/host\s*=/i.test(url)) refuse('a URL containing host=')
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return refuse('an unparseable URL')
  }
  if (u.search || url.includes('?')) refuse('a URL with a query string')
  if (u.hostname !== '127.0.0.1' || u.port !== '54322') refuse(`${u.hostname}:${u.port}`)
}

/** The URL the dev server gives the browser app; unset means the app's local fallback. */
export function assertLocalApiUrl(url: string | undefined) {
  if (!url) return
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    /* not a URL */
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run e2e: VITE_SUPABASE_URL is ${url}, not a localhost/127.0.0.1 URL. ` +
        'Point .env.local at the local stack (npx supabase status -o env) before running the e2e tests.',
    )
  }
}
