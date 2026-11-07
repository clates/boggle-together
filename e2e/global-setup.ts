import { loadEnv } from 'vite'
import { enableShortRounds, restartRest } from './db'
import { assertLocalApiUrl } from './guards'

// Short rounds for tests: 2 s countdown, 12 s round.
export const COUNTDOWN_SECONDS = 2
export const ROUND_SECONDS = 12

export default async function globalSetup() {
  // The same env the dev server gives the browser (process env first, then .env.local / .env).
  assertLocalApiUrl(loadEnv('development', process.cwd(), 'VITE_').VITE_SUPABASE_URL)
  enableShortRounds(COUNTDOWN_SECONDS, ROUND_SECONDS)
  await restartRest()
}
