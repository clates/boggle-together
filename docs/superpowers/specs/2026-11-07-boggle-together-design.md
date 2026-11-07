# Boggle Together: Design

Working name: `boggle-together` (my call; rename freely).

## Intent

Chris's parents live far away. The families like playing Boggle together, and they want to keep the analog feel of game night: pens, paper, big families around a table. What they lack is a way to share the *same board* at the *same moment* with a *shared clock*.

This app is a shared board and a shared timer, nothing more. Everyone keeps writing words on paper. Scoring happens out loud on a voice call, the way it does around a table. A few people may type their words in on their own device instead of writing, and the app helps them by showing which of their words were found by more than one typist.

The app is an open resource. Anyone can start a room and play, and the code is public on Chris's GitHub.

## The game night

- A typical game night has around 4 households of up to 4 people each (roughly 16 players), but there is no limit on the number of households. Only an overall cap per room protects the service from abuse.
- Each household has one shared screen, usually a tablet in **landscape**, sitting in the middle of the table. Some households may use a laptop.
- Most players write on paper. Some individuals may type their words on their own phone or tablet.
- Households are on a voice or video call the whole time.

## Goals

1. Every household sees the same board at the same moment, and the round ends at the same moment for everyone.
2. The shared screen is readable from across a table: huge letters, no clutter.
3. Joining is effortless: no accounts, no installs, no sign-up. A short room code or link is enough.
4. After time is up, the group can see who typed which words and which words were found by more than one typist.
5. Run on free tiers with no always-on server. Open source.

## Non-goals and anti-goals

- **Not a digital replacement for pen and paper.** If using the app starts to feel like playing a phone game, it has failed. Typing words is optional.
- **No scoring and no dictionary.** The app does not add up points or check that words are real. Players settle those on the call.
- **No configuration in the MVP.** No timer length option, no board size option, no dice sets, no languages. One fixed game.
- **No accounts, no tracking, no stored personal data.** Names are free-text labels that disappear with the room.
- **Anti-goal:** a flow that needs a tutorial. If a grandparent can't join and play without help, it's wrong.

## Fixed rules for the MVP

- A 4x4 board shuffled from the standard Boggle dice. The "Qu" face shows as a single tile reading "Qu". (My call. The exact dice set is up to the builder.)
- A 3-minute round. (My call.)
- A short synchronized countdown (about 5 seconds) before each round begins. (My call.)
- Words of 3 or more letters, as in Boggle. (My call.)

## Screens and flow

### 1. Home

Two actions: **Start a room** and **Join a room** (enter a code). Nothing else.

### 2. Room (lobby and post-round)

The same screen serves as the lobby before the first round and as the results screen after each round (described below). Shows:

- The room name or invite code (a short, readable code such as `MAPLE-4207`: a tree word, a dash and four digits) and a link that joins directly.
- A list of households with a ready indicator for each.
- A **Ready?** button or toggle for each household.
- The board, when there is one.

When every household is ready, the countdown starts.

### 3. In-game (the shared screen)

This is the most important screen. Chris specifically chose and refined it.

- **White background.** The letters fill almost the entire screen. Maximize letter size.
- **The background is the timer.** A full-screen color fill starts green and drains downward. As it drains, its color shifts gradually from green to yellow to red. When the fill is gone, the round is over.
- **No numeric clock anywhere.** This was an explicit decision: "knowing there are precisely 8s doesn't aid you, just keep writing faster." Do not add a number.
- Letter tiles have white faces with dark outlines, so they stay readable over every fill color.
- At the end, "Pens down!" appears.
- A small **dog-ear panel** tucked into a corner holds the rotate button and, probably, the room code. It stays out of the way of the letters.
- **Rotate:** each household can turn the board in 90-degree steps on its own screen. This is local and affects nobody else. (Players sit on different sides of the table.) This is my call; Chris liked it.

Before the round starts, the board is hidden and a countdown is shown. The board appears on every screen at the same moment.

### 4. Pens down

When time is up, the board locks. Each household taps **Pens down!** to confirm they have stopped writing. When every household has confirmed, the post-round screen appears for everyone.

Words typed by digital players lock when time expires. Allow a short grace period of about 2 seconds so that words submitted just before the end still count. (My call.)

### 5. Post-round

A different layout from the in-game screen, built for reading. Landscape tablet is the primary target.

- **Left:** the board (still visible), the room name or invite code, the household list showing who is ready for the next round, and the **Ready?** button.
- **Right:** the word lists of every digital player, one **column per player**. Each column has the player's name at the top (pinned) and the number of words.
- Words are listed in **alphabetical order**. A word found by two or more digital players is shown **grey and struck through, in place**. Words found by only one player stay bold.
- The right side is **scrollable in both directions**, so many words and many players both work. The whole word area scrolls together as one page. It is not a separate scroll area per column. Player names stay pinned at the top while scrolling.
- Design for real game-night volume: each player may have 30+ words, and up to 8 digital players should stay readable (words around 15px at 8 players, 20px at 4).
- Chris wants room to add fun extras to this screen in later versions, so keep the structure open to additions. Don't build any of them now.

Mockups from the brainstorm are in `docs/superpowers/mockups/`. Treat them as intent, not pixel specs.

## Typing words (digital players)

This part was not discussed in detail, so these are my calls.

- A digital player joins the room on their own device using the same code or link and enters a name. They choose between "Shared screen" (the household display) and "Type my words".
- During a round, a "Type my words" device shows a text box and the player's own list so far. Press Enter to add a word. Words are uppercased and de-duplicated, and anything shorter than 3 letters is ignored.
- A player sees only their own list during the round. Nobody sees anyone else's list until the post-round screen.
- No validation against the dictionary or against the board in the MVP.
- Digital players do not tap "Pens down!". Their words lock when time expires.
- The phone view of the post-round screen is a responsive version of the same content. It is not specifically designed.

## Technical decisions

Decided by Chris:

- **Web app**, opened in a browser. Nothing to install.
- **Supabase** for the shared state and live updates. Chris has a connection ready.
- **Vercel** for hosting, with Chris's own domain pointing to it. Chris has an account ready.
- **Public code on GitHub** under Chris's account (`clates`).
- **No always-on server or stationary compute.**
- **Basic limits to protect an open service:** limit how fast rooms can be created, and clean up old rooms automatically.
- Testing with **Playwright**, iterating autonomously.

My calls (builder may change with reason):

- Rooms are identified by a short code. There are no user accounts, and every participant is anonymous.
- **Timing must be server-authoritative.** The start time of a round is a single timestamp in the shared state, and every client counts down to it using a measured offset between its own clock and the server's, so a tablet with a wrong clock still stays in sync.
- Supabase Realtime (broadcast and presence) carries the live state: who is in the room, ready and pens-down confirmations.
- Best-effort protection against peeking: the board letters should not reach clients before the round begins. Do not over-engineer this; it is a family game.
- Suggested limits: rooms expire a few hours after last activity; cap participants per room (for example 24) and words per player (for example 300) and word length; rate-limit room creation per client.
- Row-level security so that one room's data can't be read or changed by people who don't know its code.
- A single-page app with a static build, deployable on Vercel. Framework and language are the builder's choice. TypeScript is preferred.

## Added after review (my calls; Chris to confirm)

A reviewer read this document and asked what a builder couldn't guess. These are my answers, so Chris should check them.

- **Households.** One "Shared screen" device is one household. It has a name, entered when it joins, and it is the unit that counts for Ready and Pens down. A household with a second screen can just join as a second household. Typists are separate participants. They are not attached to a household and they don't appear in the household list. They appear only as columns on the post-round screen. There is no cap on the number of households. Only the overall participant cap (24 per room, my call) applies.
- **Typist devices do not show the board.** A typist reads the board off their household's shared screen and uses their own device only to type. This keeps the app from becoming a phone game. The typist device shows a text box and the player's own list, and no timer. It switches to the results when the post-round screen opens.
  **Chris wants to revisit this one.** Treat it as provisional: build the typist device so showing the board on it later is a small change.
- **Countdown audio (Chris's idea).** The pre-round countdown might play audio tones, which also helps households on a voice call. Not required for the first build. Leave room for it.
- **No host.** The room creator has no special powers. Room codes are generated, not chosen.
- **A stuck household must not freeze the game.** Any household may tap "Start anyway" once at least half of the households are ready. Likewise, the post-round screen opens when every household has confirmed Pens down, or when any household taps "Show results" 30 seconds after time expires.
- **Joining and rejoining.** Joining during a countdown or a round is allowed and the new device sees the current state. Rejoining after a refresh is best effort, using a token kept in the browser, and it should restore the household's place and a typist's words. No hard guarantee.
- **Board reveal.** The letters are not readable by clients before the round's start time. A time-gated read rule or a small server function is acceptable even if the board arrives a fraction of a second late on a slow connection. Do not do anything cleverer.
- **Next round.** Ready on the post-round screen starts a new round with a new board. Typists' lists are cleared. Past rounds are not kept. Ready only counts after the post-round screen is open.
- **Supabase.** Use a new, dedicated project. Free-tier limits are enough for roughly 24 clients. Chris will provide the project when it's time. Automatic cleanup of old rooms can use `pg_cron` or an equivalent.
- **Mockups** are in `docs/superpowers/mockups/` (`playing-screen-v3.html`, `post-round-v2.html`, `tablet-check.html`).

## Left to the builder

- Framework, project structure, data model, and the exact way sync and the countdown are implemented.
- The dice set and the shuffle method. Qu handling.
- Exact color values, fonts, animation, and the drain animation's easing. It should look smooth and calm.
- Room code format and wordlist.
- How a disconnected household rejoins (it should be easy and keep their place).
- What happens when a household never confirms "Pens down!" or never taps Ready. Some kind of timeout or "host can proceed" option is likely needed. This was not discussed.
- Test strategy. Multiple browser contexts in Playwright can stand in for multiple households.

## Later (explicitly out of scope now)

Fun post-round extras (stats and so on), configurable rounds, other board sizes or languages, scoring help, dictionary checks.
