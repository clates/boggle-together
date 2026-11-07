# Boggle Together Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web app where several households share one Boggle board and one synchronized round timer for pen-and-paper play, with optional typed word entry and a post-round results screen.

**Architecture:** A static React single-page app talks directly to Supabase. All game rules live in Postgres functions (RPCs) guarded by row-level security, so no server of our own runs. The round's timing is two server timestamps; clients derive the phase from them using a measured clock offset. Live updates come from Supabase Realtime row changes.

**Tech Stack:** TypeScript, Vite, React, react-router, Supabase (Postgres, Realtime, anonymous auth, pg_cron), Vitest, React Testing Library, pgTAP (`supabase test db`), Playwright, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-07-boggle-together-design.md`. Mockups: `docs/superpowers/mockups/`.

## Global Constraints

- Board: 4x4 from the standard 16 Boggle dice; the "Qu" face is one tile reading "Qu".
- Round: 3 minutes (180 s). Countdown before the board appears: 5 s. Grace for late typed words: 2 s. "Show results" allowed 30 s after time expires. These are the defaults of `start_round`; nothing is user-configurable.
- Words: at least 3 letters; uppercased; de-duplicated per player; letters A-Z only; at most 20 letters; at most 300 words per player.
- Limits: at most 4 households and 24 participants per room. Rooms expire 6 hours after last activity (my call). Room creation rate-limited per user (10 per hour).
- No accounts, no tracking, no stored personal data. Supabase anonymous auth is the only identity.
- In-game screen: white background, letters fill nearly the whole screen, background color fill is the timer (green, then yellow, then red, draining downward), **no numeric clock anywhere**, tiles white with dark outlines, "Pens down!" at the end, dog-ear corner panel holding the 90-degree rotate button (local to that device) and room code.
- Post-round screen: landscape tablet is the primary target. Left: board, room code, household ready list, Ready? button. Right: one column per typist, alphabetical, words found by 2+ typists grey and struck through in place; the whole word area scrolls both ways as one page with names pinned at the top. 8 typists must stay readable (15 px words at 8, 20 px at 4).
- Typist devices do not show the board or a timer (provisional; keep this easy to change).
- Free tiers only. No always-on server. Public code, MIT license (my call).

## Review Focus

- A device with a wrong system clock (minutes off) still starts and ends the round at the same moment as the others (Task 5, Task 6).
- Refreshing the page mid-round restores the same household or typist with the same name, ready state and typed words (Task 6, Task 11).
- Two households tapping Ready in the same instant start exactly one round, not two (Task 3).
- A typed word arriving just inside the 2 s grace counts; one arriving after is rejected without breaking the typist's screen (Task 3, Task 9).
- Joining with a lowercase, padded, or nonexistent room code gives a clear message rather than a crash (Task 2, Task 7).

---

## File Structure

```
supabase/migrations/0001_schema.sql        tables, RLS, create_room, join_room, server_now
supabase/migrations/0002_round.sql         start_round, set_ready, start_anyway, get_board, submit_word, pens_down, show_results
supabase/migrations/0003_cleanup.sql       cleanup_old_rooms + pg_cron schedule
supabase/tests/*.sql                       pgTAP tests, one file per migration
src/lib/phase.ts                           derivePhase, progress
src/lib/drain.ts                           drainColor
src/lib/clock.ts                           estimateOffset
src/lib/words.ts                           normalizeWord, markShared
src/lib/supabase.ts                        client, ensureSession
src/lib/useRoom.ts                         realtime room state hook
src/components/{Board,DogEar,HouseholdList}.tsx
src/pages/{Home,JoinForm,Room,InGame,Results,Typist}.tsx
e2e/game.spec.ts                           Playwright full-game test
```

Every `*.test.ts(x)` sits next to its source file.

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `playwright.config.ts`, `README.md`, `LICENSE` (MIT), `supabase/config.toml` (via `supabase init`)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (Vitest), `test:db` (`supabase test db`), `test:e2e` (Playwright). Routes `/` and `/r/:code` rendering placeholders.

- [ ] **Step 1: Check prerequisites.** Run `node -v`, `docker info`, `supabase --version`. If Docker or the Supabase CLI is missing, stop and ask Chris; the plan assumes a local Supabase stack.
- [ ] **Step 2: Write failing test** `src/App.test.tsx`: renders `<App />` at `/` and finds the buttons "Start a room" and "Join a room".
- [ ] **Step 3: Run `npm test`** and confirm it fails.
- [ ] **Step 4: Scaffold** Vite React TS, add react-router, Vitest with jsdom, React Testing Library, Playwright, `supabase init`; implement `App` with the two routes.
- [ ] **Step 5: Run `npm test` and `npm run build`**; both pass.
- [ ] **Step 6: Write README** (what it is, how to run locally, how to run tests) and the MIT license. Commit: `chore: scaffold project`.

---

### Task 2: Database schema, security, rooms and joining

**Files:**
- Create: `supabase/migrations/0001_schema.sql`, `supabase/tests/0001_schema.test.sql`

**Interfaces:**
- Produces tables `rooms(code pk, created_by, created_at, last_activity_at, round int default 0, start_at, ends_at, results_at)`, `participants(room_code, id, kind, name, ready, pens_down, joined_at; pk(room_code,id))`, `boards(room_code, round, letters text[]; pk)`, `words(room_code, round, participant_id, word; pk all four)`. Functions `server_now() returns timestamptz`, `create_room() returns text`, `join_room(p_code text, p_kind text, p_name text) returns void`.
- `id` equals `auth.uid()`. `kind` is `'household'` or `'typist'`.
- Row security: `rooms` and `participants` readable only by members of that room; `boards` has no direct read policy; `words` readable by their owner, or by any member once the room's `results_at` is not null. All writes go through the functions (security definer).

- [ ] **Step 1: Write failing pgTAP tests** in `0001_schema.test.sql`:
  - `create_room()` returns a code matching `^[A-Z]+-[0-9]{2}$` and creates a room row.
  - `join_room(lower('  '||code||' '),'household','Lates')` works (code is trimmed and uppercased) and adds a participant.
  - `join_room('NOPE-00', ...)` raises an exception whose message is `Room not found`.
  - A 5th household and a 25th participant are each refused with `Room is full`.
  - Names shorter than 1 or longer than 24 characters are refused.
  - A user who is not a member sees zero rows from `rooms` and `participants`.
  - The 11th `create_room()` by one user within an hour raises `Too many rooms`.
- [ ] **Step 2: Run `supabase test db`**; confirm failure.
- [ ] **Step 3: Write the migration.** Room codes are a tree word from a fixed list of about 64 words, a dash, and two digits; retry on collision. Update `last_activity_at` in every function that writes.
- [ ] **Step 4: Run `supabase test db`**; all pass.
- [ ] **Step 5: Commit** `feat(db): rooms, participants, row security`.

---

### Task 3: Database round lifecycle

**Files:**
- Create: `supabase/migrations/0002_round.sql`, `supabase/tests/0002_round.test.sql`

**Interfaces:**
- Consumes: Task 2 tables and `join_room`.
- Produces (all security definer, all take `p_code text`):
  - `set_ready(p_code, p_ready boolean)`: households only; allowed when the room is in the lobby or results phase; when every household is ready, calls `start_round`.
  - `start_anyway(p_code)`: household only; allowed once at least half of households (rounded up) are ready.
  - `start_round(p_code)`: internal. Idempotent under races: lock the room row `for update` and do nothing if a round is already starting. Increments `round`, sets `start_at = now() + 5 s`, `ends_at = start_at + 180 s` (both read from `current_setting('boggle.countdown_seconds', true)` and `'boggle.round_seconds'`, defaulting to 5 and 180, so the e2e test can shorten them), clears `results_at`, all `ready` and `pens_down`, deletes the previous round's `words` and `boards`, and inserts a new board.
  - Board generation: shuffle the 16 standard dice and pick one random face per die. Letters are stored as `text[16]` with `'Qu'` for the Qu face.
  - `get_board(p_code) returns text[]`: returns null unless `now() >= start_at`; caller must be a member.
  - `submit_word(p_code, p_word text) returns void`: typists only; normalizes (trim, uppercase); rejects anything not A-Z, shorter than 3 or longer than 20; rejects outside `start_at .. ends_at + 2 s`; ignores duplicates silently; rejects after 300 words with `Word limit reached`.
  - `pens_down(p_code)`: households only, only after `ends_at`; when every household has confirmed, sets `results_at = now()`.
  - `show_results(p_code)`: households only, only from `ends_at + 30 s`; sets `results_at = now()`.

- [ ] **Step 1: Write failing pgTAP tests** in `0002_round.test.sql` (shorten timing by updating `start_at`/`ends_at` directly as superuser):
  - `set_ready` by all households starts a round: `round = 1`, `start_at - now()` is about 5 s, `ends_at - start_at = interval '180 seconds'`.
  - Race: call `set_ready` for the last household twice in a row; `round` is still 1.
  - `start_anyway` is refused with 1 of 4 households ready and accepted with 2 of 4.
  - `get_board` returns null before `start_at`, and a `text[]` of length 16 after; every tile is a single letter or `'Qu'`.
  - 1000 generated boards each use exactly one face from each of the 16 dice.
  - `submit_word`: accepts `'  train '` and stores `TRAIN`; rejects `'ab'`, `'tr4in'`, a 21-letter word; second `'TRAIN'` is ignored; accepted at `ends_at + 1.5 s`, rejected at `ends_at + 2.5 s`; the 301st word is refused; a household caller is refused.
  - `pens_down` before `ends_at` is refused; after all households confirm, `results_at` is set; `show_results` before 30 s is refused and after 30 s works.
  - Row security: a typist cannot read another typist's `words` while `results_at` is null, and can once it is set.
  - A new round deletes the previous round's `words`.
- [ ] **Step 2: Run `supabase test db`**; confirm failure.
- [ ] **Step 3: Write the migration** with the functions above.
- [ ] **Step 4: Run `supabase test db`**; all pass.
- [ ] **Step 5: Commit** `feat(db): round lifecycle`.

---

### Task 4: Cleanup of old rooms

**Files:**
- Create: `supabase/migrations/0003_cleanup.sql`, `supabase/tests/0003_cleanup.test.sql`

**Interfaces:**
- Produces: `cleanup_old_rooms() returns int` (number of rooms deleted); a `pg_cron` job running it every 15 minutes. Deleting a room cascades to its participants, boards and words.

- [ ] **Step 1: Write failing test:** a room with `last_activity_at` 7 hours old is deleted along with its participants and words; a room 5 hours old is kept; the function returns 1.
- [ ] **Step 2: Run `supabase test db`**; confirm failure.
- [ ] **Step 3: Implement** the function, add `on delete cascade` where missing, and schedule with `cron.schedule`.
- [ ] **Step 4: Run `supabase test db`**; pass.
- [ ] **Step 5: Commit** `feat(db): expire old rooms`.

---

### Task 5: Pure game logic in the client

**Files:**
- Create: `src/lib/phase.ts`, `drain.ts`, `clock.ts`, `words.ts`, each with a `.test.ts` beside it.

**Interfaces:**
- Produces:
  - `type Phase = 'lobby' | 'countdown' | 'playing' | 'locked' | 'results'`
  - `type RoomTimes = { start_at: string | null; ends_at: string | null; results_at: string | null }`
  - `derivePhase(room: RoomTimes, serverNowMs: number): Phase`: no `start_at` is `lobby`; `results_at` set is `results`; before `start_at` is `countdown`; before `ends_at` is `playing`; otherwise `locked`.
  - `progress(room: RoomTimes, serverNowMs: number): number`: 1 at `start_at`, falling linearly to 0 at `ends_at`, clamped to 0..1.
  - `drainColor(progress: number): string`: `` `hsl(${130 * p} 70% 45%)` `` with `p` clamped to 0..1, so 1 is green, 0.5 is yellow-green, and 0 is red.
  - `estimateOffset(samples: { sentMs: number; receivedMs: number; serverMs: number }[]): number`: offset to add to the local clock to get server time, taken from the sample with the lowest round trip: `serverMs + rtt / 2 - receivedMs`.
  - `normalizeWord(raw: string): string | null`: trim and uppercase; null if not A-Z only, shorter than 3, or longer than 20.
  - `markShared(lists: Record<string, string[]>): Record<string, { word: string; shared: boolean }[]>`: each list sorted alphabetically; `shared` is true when 2 or more players have that word.

- [ ] **Step 1: Write failing tests:**
  - `derivePhase` returns each of the five phases at the right instants; `progress` is 1, 0.5, 0 at start, midpoint and end, and is clamped outside.
  - `drainColor(1) === 'hsl(130 70% 45%)'`, `drainColor(0) === 'hsl(0 70% 45%)'`, `drainColor(2)` equals `drainColor(1)`.
  - Clock skew: with samples whose local clock is 10 minutes slow, `estimateOffset` returns about 600000; with two samples it prefers the one with the smaller round trip. `derivePhase` using the corrected time gives the same phase as a correct clock.
  - `normalizeWord('  train ') === 'TRAIN'`; returns null for `'ab'`, `'tr4in'`, `'two words'`, `''`, an emoji, and a 21-letter string.
  - `markShared({A:['rain','sand'],B:['sand','hold']})`: A's `sand` is shared, A's `rain` is not; lists are alphabetical.
- [ ] **Step 2: Run `npm test`**; confirm failures.
- [ ] **Step 3: Implement** each function as specified.
- [ ] **Step 4: Run `npm test`**; pass.
- [ ] **Step 5: Commit** `feat: pure game logic`.

---

### Task 6: Supabase client and live room state

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/useRoom.ts`, `src/lib/useRoom.test.tsx`

**Interfaces:**
- Consumes: Task 2 and 3 functions; Task 5 `derivePhase`, `estimateOffset`.
- Produces:
  - `supabase` client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; `ensureSession(): Promise<string>` signs in anonymously if there is no stored session and returns the user id.
  - `useRoom(code: string): { status: 'loading' | 'not-found' | 'ready'; room; participants; me; phase: Phase; serverNowMs: () => number; board: string[] | null; actions: { setReady(b: boolean): Promise<void>; startAnyway(): Promise<void>; submitWord(w: string): Promise<void>; pensDown(): Promise<void>; showResults(): Promise<void> } }`.
  - The hook subscribes to Realtime changes on `rooms` and `participants` for the code, fetches `get_board` once `phase` becomes `playing` or `locked` or `results`, measures the clock offset with 5 `server_now()` calls on mount, and re-renders on a timer (every 100 ms while `countdown` or `playing`).
  - Because the session is stored by Supabase in browser storage, a page refresh restores the same participant id and therefore the same place.

- [ ] **Step 1: Write failing tests** with a fake Supabase client: (a) with a system clock set 10 minutes slow, `phase` still becomes `playing` at the server's `start_at`; (b) `status` is `not-found` for an unknown code; (c) after unmount and remount with the same session, `me` is the same participant.
- [ ] **Step 2: Run `npm test`**; confirm failures.
- [ ] **Step 3: Implement** `supabase.ts` and `useRoom.ts`.
- [ ] **Step 4: Run `npm test`**; pass.
- [ ] **Step 5: Commit** `feat: live room state hook`.

---

### Task 7: Home, joining and the room shell

**Files:**
- Create: `src/pages/Home.tsx`, `JoinForm.tsx`, `Room.tsx`, `src/components/Board.tsx`, `HouseholdList.tsx`, with tests beside them.

**Interfaces:**
- Consumes: `useRoom`.
- Produces: `<Board letters={string[]} rotation={0|90|180|270} />` (4x4 grid, white tiles with dark outlines, "Qu" tile fits); `<HouseholdList participants={...} />` (households with a ready indicator; typists are not listed); `Room` chooses the view by `phase` and `me.kind`.
- Home: "Start a room" calls `create_room` then goes to `/r/<code>`; "Join a room" takes a code. `JoinForm` shows when the user is not yet a participant and asks for a name and a choice of "Shared screen" or "Type my words".
- Lobby (phase `lobby`): room code and invite link, household list, Ready? toggle, "Start anyway" once at least half of households are ready.

- [ ] **Step 1: Write failing tests:**
  - Joining with `'  maple-42 '` navigates to `/r/MAPLE-42`.
  - A nonexistent code shows the text "Room not found" and a link home.
  - `HouseholdList` shows a check for ready households and an hourglass for others, and omits typists.
  - `Board` renders 16 tiles; a `'Qu'` tile shows "Qu"; rotation 90 applies a 90-degree CSS rotation.
  - Ready? toggles via `actions.setReady`.
- [ ] **Step 2: Run `npm test`**; confirm failures.
- [ ] **Step 3: Implement** the pages and components.
- [ ] **Step 4: Run `npm test`**; pass.
- [ ] **Step 5: Commit** `feat: home, join and lobby`.

---

### Task 8: In-game screen for shared screens

**Files:**
- Create: `src/pages/InGame.tsx`, `src/components/DogEar.tsx`, tests beside them.

**Interfaces:**
- Consumes: `useRoom`, `Board`, `drainColor`, `progress`.
- Produces: `InGame` renders for households when `phase` is `countdown`, `playing` or `locked`.
  - `countdown`: board hidden, a large countdown number in whole seconds (this is the only place a number appears) and a soft tone hook (empty function `playCountdownTone(secondsLeft)` that a later change can fill in).
  - `playing`: white page; a fixed-position layer of height `progress * 100%` anchored at the bottom with `background: drainColor(progress)`; the board fills the viewport using the largest square that fits; no numeric clock.
  - `locked`: fill gone, "Pens down!" button. When tapped, it calls `actions.pensDown()` and shows "Waiting for others". After 30 s, a "Show results" button appears.
  - `DogEar`: a folded-corner tab; tapping opens a small panel with the room code and a rotate button that cycles the board 0, 90, 180, 270. Rotation is local state.

- [ ] **Step 1: Write failing tests:**
  - At `progress` 1 the fill is 100% tall and green; at 0.5 it is 50% tall and `hsl(65 70% 45%)`; at 0 it is absent.
  - No text node in the `playing` view matches a clock pattern like `\d+:\d\d`.
  - During `countdown` the board is not rendered.
  - Rotate button cycles rotation 0 to 90 to 180 to 270 to 0 and does not call any action.
  - In `locked`, tapping "Pens down!" calls `actions.pensDown` once; "Show results" appears only after 30 s.
- [ ] **Step 2: Run `npm test`**; confirm failures.
- [ ] **Step 3: Implement** `InGame` and `DogEar`.
- [ ] **Step 4: Run `npm test`**; pass.
- [ ] **Step 5: Screenshot check.** With the dev server and a seeded round, use Playwright at 1024x768 to capture `playing` at progress 1, 0.5 and 0.1; save to the scratchpad; view them and compare against `docs/superpowers/mockups/playing-screen-v3.html`. Fix anything that looks wrong.
- [ ] **Step 6: Commit** `feat: in-game screen`.

---

### Task 9: Typist screen

**Files:**
- Create: `src/pages/Typist.tsx`, `Typist.test.tsx`

**Interfaces:**
- Consumes: `useRoom`, `normalizeWord`.
- Produces: `Typist` shows in every phase for `me.kind === 'typist'`. Before and during `countdown`, a waiting message. During `playing`, a text box (Enter adds the word) and the player's own list, newest first, with no board and no timer. During `locked`, a "Time's up" message. In `results`, the results view (Task 10).
- Words failing `normalizeWord` are not sent and show a short inline hint ("3 letters or more, A to Z only"). A server rejection (for example, late word) shows "Too late" and does not clear the list.

- [ ] **Step 1: Write failing tests:**
  - Typing `' Train '` and pressing Enter calls `actions.submitWord('TRAIN')` and adds it to the list; typing `ab` calls nothing and shows the hint.
  - A duplicate word is shown once.
  - When `submitWord` rejects with a late-word error, "Too late" appears and earlier words remain.
  - The view contains no `Board` and no clock text.
- [ ] **Step 2: Run `npm test`**; confirm failures.
- [ ] **Step 3: Implement** `Typist`.
- [ ] **Step 4: Run `npm test`**; pass.
- [ ] **Step 5: Commit** `feat: typist screen`.

---

### Task 10: Results screen

**Files:**
- Create: `src/pages/Results.tsx`, `Results.test.tsx`

**Interfaces:**
- Consumes: `useRoom`, `Board`, `HouseholdList`, `markShared`.
- Produces: `Results` (phase `results`). Landscape two-pane layout. Left: board (still visible), room code, household list, Ready? button, "Start anyway" as in the lobby. Right: a single container with `overflow: auto` in both axes holding one column per typist; names pinned with `position: sticky; top: 0`; each name shows a word count; words alphabetical; shared words rendered with `<s>` and a grey color, others bold. Word size is 20 px for up to 4 typists and 15 px for more. Typist devices (phone width) show the same content stacked, using the same component.

- [ ] **Step 1: Write failing tests:**
  - With 4 typists of 30+ words each, every column header shows its name and count and the word lists are alphabetical.
  - A word held by 2 typists is inside a struck-through element in both columns; a unique word is not.
  - 8 typists render at the smaller font size; 4 at the larger.
  - The scroll container has `overflow: auto` and the name headers are sticky.
  - The Ready? button calls `actions.setReady`.
- [ ] **Step 2: Run `npm test`**; confirm failures.
- [ ] **Step 3: Implement** `Results`; fetch all `words` rows for the current round through the normal `words` select policy.
- [ ] **Step 4: Run `npm test`**; pass.
- [ ] **Step 5: Screenshot check.** Seed 4 and 8 typists with 30+ words, capture 1024x768 landscape, compare with `docs/superpowers/mockups/tablet-check.html`, and fix differences.
- [ ] **Step 6: Commit** `feat: results screen`.

---

### Task 11: End-to-end test

**Files:**
- Create: `e2e/game.spec.ts`, `e2e/global-setup.ts`; Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: the whole app against the local Supabase stack. `global-setup.ts` sets `boggle.countdown_seconds = 2` and `boggle.round_seconds = 8` on the local database and restarts connections so they apply.

- [ ] **Step 1: Write the failing test** `full game`: three browser contexts at 1024x768 (household "Lates" creates a room, household "Grandma" joins, a typist "Chris" joins from a fourth context at phone size). Assert:
  - Both households tap Ready; both boards appear within 300 ms of each other and show identical letters.
  - The typist submits `rain` and `sand` before time runs out; the typist view shows no board.
  - After time expires both households tap "Pens down!" and the results screen appears on all contexts.
  - A second typist "Jo" who also typed `sand` shows it struck through in both columns.
  - Tapping Ready on both households starts round 2 with a different board and cleared typist lists.
- [ ] **Step 2: Add** `test('refresh mid-round keeps place')`: reload the Grandma context during `playing`; assert the same board, still in the household list, same name.
- [ ] **Step 3: Add** `test('wrong system clock')`: launch Grandma's context with the clock offset by 10 minutes (Playwright's clock API); assert its board still appears within 300 ms of Lates's.
- [ ] **Step 4: Run `npm run test:e2e`**; fix any app bugs found until all pass.
- [ ] **Step 5: Commit** `test: end-to-end game`.

---

### Task 12: Deploy (needs Chris)

**Files:**
- Create: `vercel.json` (SPA fallback to `index.html`), `.env.example`; Modify: `README.md`

**Interfaces:**
- Consumes: from Chris, a new dedicated Supabase project (URL, anon key, database access), and the Vercel account and domain.

- [ ] **Step 1: Ask Chris for the Supabase project and Vercel access** at this point, not earlier.
- [ ] **Step 2: Apply migrations** with `supabase link` then `supabase db push`; enable anonymous sign-ins, enable the `pg_cron` extension, and turn on the anonymous sign-in rate limit and (if available) captcha.
- [ ] **Step 3: Deploy to Vercel** with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set; attach Chris's domain.
- [ ] **Step 4: Smoke test the live site** with Playwright against the real URL: create a room, join from a second context, run one round using the real 3-minute timing (or the shortened setting on a throwaway room).
- [ ] **Step 5: Document** deployment and self-hosting in the README. Commit `docs: deployment`.

---

## Self-Review

- **Spec coverage:** home and join (Task 7), lobby and Ready (7), synced countdown and board reveal (3, 6, 8), draining-color in-game screen with no clock and dog-ear rotate (8), Pens down and show-results fallback (3, 8), typist entry (3, 9), results columns with shared words struck through and two-way scroll (10), limits and cleanup (2, 3, 4), open source and Vercel/Supabase (1, 12), countdown audio hook (8). The provisional "typists don't see the board" decision is isolated in Task 9.
- **Types:** `Phase`, `RoomTimes`, `derivePhase`, `progress`, `drainColor`, `estimateOffset`, `normalizeWord`, `markShared` and the `actions` names are defined once in Tasks 5 and 6 and reused unchanged afterwards.
- **Review Focus:** each of the five lines has a test in the task that owns the code, and the first two also in Task 11.
