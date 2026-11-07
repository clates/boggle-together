# Boggle Together

A shared Boggle board and synced timer for pen-and-paper game night. One person starts a room, everyone else joins by code, and all players see the same board and countdown on their own phone.

Built with React, Vite, TypeScript, and Supabase.

## Run locally

Requires Node 20+ and Docker (for the local Supabase stack).

```sh
npm install
npx supabase start   # local Postgres/Auth/Realtime
npm run dev          # http://localhost:5173
```

## Tests

```sh
npm test            # unit/component tests (Vitest)
npm run test:db     # database tests (needs `npx supabase start`)
npm run test:e2e    # end-to-end tests (Playwright; run `npx playwright install` once)
```

## License

MIT
