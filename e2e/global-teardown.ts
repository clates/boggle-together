import { disableShortRounds, restartRest } from './db'

// Put the normal game lengths back so local dev is unaffected.
export default async function globalTeardown() {
  disableShortRounds()
  await restartRest()
}
