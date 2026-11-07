import { enableShortRounds, restartRest } from './db'

// Short rounds for tests: 2 s countdown, 8 s round.
export default async function globalSetup() {
  enableShortRounds(2, 8)
  await restartRest()
}
