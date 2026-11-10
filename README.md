# Boggle Together

[![CI](https://github.com/clates/boggle-together/actions/workflows/ci.yml/badge.svg)](https://github.com/clates/boggle-together/actions/workflows/ci.yml)

A shared Boggle board and a shared timer for pen-and-paper game night between households that live far apart. Each household puts one shared screen (usually a tablet) in the middle of its table, and every household's screen shows the same board at the same moment, with the same countdown. Everyone still writes words on paper and scores out loud on the video call. A few people can instead type their words on their own phone (**Type on my phone**); the results then show which of their words no other typist found.

Built with React, Vite, TypeScript, and Supabase.

## How the game works

One person taps **Start a room** and shares the room code (a garden word and four digits, such as `PECAN-2654`) or the link. Codes are made to be read out on the call: on the home screen, typing what was said ("pecan 2654", any case, with or without a space or hyphen) or pasting the link goes straight into the room, and a near miss such as `PECKAN` gets a "Did you mean PECAN?". Each household joins on its shared screen as **Shared screen**; anyone who wants to type their words joins on their own phone as **Type on my phone** (a link with `?m=type` preselects it, and the lobby on a shared screen shows a QR code of that link for phones at the same table). The join form remembers the last name and choice on that device. When every household taps **Ready?**, a short countdown starts and the same 4x4 board appears on every shared screen for a 3-minute round, with the background draining away as the timer. Typing phones show the same board and the same draining background above their word box, with a **Rotate board** button for whoever sits at an angle (they stay silent). When time is up, each household taps **Pens down!**. The results then show the board and each typist's words, with words found by more than one typist struck through. Tap **Ready?** again for the next round. If a household is stuck, **Start anyway** appears once at least half the households are ready, results can be opened 30 seconds after the round, and any household can **Remove** a household that has gone (or someone who should not be there). Anyone can **Leave room**. The app does no scoring and no dictionary checks: settle those on the call.

## The board solver

After a round, the results screen shows what was hiding on the board: the longest word, the highest-scoring (Scrabble) word, the busiest tile and how many words there were in all. The app still never checks anyone's words. The solver runs in the browser against `src/lib/wordlist.txt` (about 170,000 words, loaded only when the results screen opens), built from the public-domain ENABLE word list by `node scripts/build-wordlist.mjs`. Offensive words are left out (`scripts/wordlist-blocklist.txt`; add to it freely and rebuild).

## Look and colours

The theme is "Table Blue": a faint blue page, ivory letter tiles with navy letters and outlines, a crimson red for the main action (Start a room, Ready?, Join, Pens down!) and a darker blue for secondary actions and links. Every colour is a token in the `:root` block at the top of `src/index.css` (a unit test fails if a colour literal appears anywhere else); all text meets WCAG AA and tile letters AAA. The timer fill is computed in `src/lib/drain.ts`: it sweeps in OKLCH from a bluish green (full) through sunflower yellow (half) to vermilion (held for the last 15%), converted to plain hex so older iPads render it, with a darker "waterline" along its top edge and faint static stripes in the last 20%, so the stage reads even without colour vision.

## Link previews

A pasted room link (Discord, Slack, iMessage...) unfurls as "Join ROWAN-8209 · Boggle Together" with the room word on letter tiles. Link crawlers do not run JavaScript, so `middleware.ts` (Vercel Routing Middleware) writes the room's tags into the page on `/r/:code`, and `api/og.tsx` draws the 1200x630 image (Satori lays it out, resvg turns it into a PNG); every other page uses the home card in `index.html`. Both use only the code in the link, never room state, and only codes whose word is on one of the room word lists get tiles (anything else gets the home card). The tags and copy live in `src/lib/share.ts`; the image's colours mirror the `:root` tokens (a unit test checks them). The font is Noto Sans Bold cut down to basic Latin to keep the edge function small (`fonts/`, SIL Open Font License).

## Run locally

Requires Node 22.22.2 or newer on the 22 line, or Node 24.15+ (jsdom 31, used by the unit tests, needs it; Vitest and Vite need 22.12+), and Docker (for the local Supabase stack).

1. Install and start the local Supabase stack (Postgres, Auth, Realtime):

   ```sh
   npm install
   npx supabase start
   ```

2. Create `.env.local` with the local API URL and anon key. Print them with:

   ```sh
   npx supabase status -o env
   ```

   Copy `.env.example` to `.env.local`, then set `VITE_SUPABASE_URL` to the `API_URL` value (`http://127.0.0.1:54321`) and `VITE_SUPABASE_ANON_KEY` to the `ANON_KEY` value (the `PUBLISHABLE_KEY` value also works):

   ```sh
   cp .env.example .env.local
   ```

3. Start the app:

   ```sh
   npm run dev          # http://localhost:5173
   ```

## Tests

```sh
npm test            # unit/component tests (Vitest)
npm run test:db     # database tests (needs `npx supabase start`; run `npx supabase db reset` first to apply new migrations)
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

Never run them with `.env.local` pointed at a hosted project. Global setup refuses to run unless
`VITE_SUPABASE_URL` is a localhost/127.0.0.1 URL (or unset) and the database URL is exactly
`127.0.0.1:54322`. If a dev server is already running, the tests reuse it, so make sure it was
started with the local settings.

To keep the suite fast, global setup shortens rounds to a 2 s countdown and a 12 s round. The
`postgres` role on Supabase cannot persist custom settings with `ALTER DATABASE`, so setup installs
a PostgREST pre-request function (`public.e2e_short_rounds`, set via
`alter role authenticator set pgrst.db_pre_request`) and restarts the local `supabase_rest_*`
container; global teardown removes both and restarts it again. If a run is killed before teardown
and local games stay short, reset by hand:

```sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -c "alter role authenticator reset pgrst.db_pre_request" \
  -c "drop function if exists public.e2e_short_rounds()"
docker restart $(docker ps --filter name=supabase_rest_ --format '{{.Names}}')
```

## Host your own

The app is a static site plus a Supabase project. There is no server of your own to run.

1. Create a project at [supabase.com](https://supabase.com).
2. Link this repo to it and apply the migrations:

   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

3. Turn on anonymous sign-ins: Authentication > Sign In / Providers > Allow anonymous sign-ins.
   Do **not** turn on captcha for anonymous sign-ins. The app sends no captcha token, so new
   visitors could not sign in at all.
4. Enable the `pg_cron` extension (Database > Extensions) so idle rooms are cleaned up after 6 hours, then check that the job exists in the SQL editor:

   ```sql
   select * from cron.job;
   ```

   If `cleanup-old-rooms` is missing (pg_cron was off when the migration ran), schedule it:

   ```sql
   select cron.schedule('cleanup-old-rooms', '*/15 * * * *', 'select public.cleanup_old_rooms()');
   ```

5. Build with your project's settings (Project Settings > API): set `VITE_SUPABASE_URL` to the project URL and `VITE_SUPABASE_ANON_KEY` to the anon (or publishable) key. A production build without them shows "This site is not configured".
6. Deploy the static build (`npm run build`, output in `dist/`) to Vercel or any static host. Set the two variables in the host's environment settings, and add an SPA rewrite that serves `index.html` for every path. Without it, invite links such as `/r/PECAN-2654` return 404. On Vercel that is a `vercel.json` with:

   ```json
   { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
   ```

## License

MIT
