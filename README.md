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

### End-to-end tests

The e2e tests drive several browser contexts (two households, two typists) through whole games
against the **local** Supabase stack, so it must be running first:

```sh
npx supabase start
npx playwright install chromium   # once
npm run test:e2e                  # starts `npm run dev` if it is not already running
```

To keep the suite fast, global setup shortens rounds to a 2 s countdown and an 8 s round. The
`postgres` role on Supabase cannot persist custom settings with `ALTER DATABASE`, so setup installs
a PostgREST pre-request function (`public.e2e_short_rounds`, set via
`alter role authenticator set pgrst.db_pre_request`) and restarts the local `supabase_rest_*`
container; global teardown removes both and restarts it again. Setup refuses to run against
anything but `127.0.0.1:54322`. If a run is killed before teardown and local games stay short,
reset by hand:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "alter role authenticator reset pgrst.db_pre_request" \
  -c "drop function if exists public.e2e_short_rounds()"
docker restart $(docker ps --filter name=supabase_rest_ --format '{{.Names}}')
```

## License

MIT
