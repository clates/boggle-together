import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { psql } from './db'

// Max gap between two households' boards first appearing.
const BOARD_SYNC_MS = 300

const DESKTOP = { width: 1024, height: 768 }
const PHONE = { width: 390, height: 844 }

const IN_GAME_BOARD = '[data-testid="in-game"] [data-testid="board"]'

type Player = {
  name: string
  context: BrowserContext
  page: Page
  /** Node-side Date.now() each time an in-game board appears (comparable across contexts, even with a faked page clock) */
  boardSeen: number[]
  /** The page's own Date.now() at the same moments */
  boardSeenPage: number[]
}

async function newPlayer(
  browser: Browser,
  name: string,
  viewport: { width: number; height: number },
  opts: { clockOffsetMs?: number } = {},
): Promise<Player> {
  const context = await browser.newContext({ viewport })
  if (opts.clockOffsetMs) {
    // Shifts Date.now() in the page; time keeps flowing and timers keep firing.
    await context.clock.install({ time: Date.now() + opts.clockOffsetMs })
  }
  const boardSeen: number[] = []
  const boardSeenPage: number[] = []
  await context.exposeBinding('__boardSeen', (_src, pageNow: number) => {
    boardSeen.push(Date.now())
    boardSeenPage.push(pageNow)
  })
  await context.addInitScript((selector) => {
    let present = false
    const check = () => {
      const now = !!document.querySelector(selector)
      if (now && !present) (window as unknown as { __boardSeen: (t: number) => void }).__boardSeen(Date.now())
      present = now
    }
    new MutationObserver(check).observe(document, { childList: true, subtree: true })
  }, IN_GAME_BOARD)
  const page = await context.newPage()
  return { name, context, page, boardSeen, boardSeenPage }
}

async function joinAs(p: Player, code: string, kind: 'household' | 'typist') {
  await p.page.goto(`/r/${code}`)
  await joinForm(p, kind)
}

/** Joins the way a code is passed on a call: typed on the home screen as heard ("pecan 2654"). */
async function joinByVoice(p: Player, code: string, kind: 'household' | 'typist') {
  await p.page.goto('/')
  await p.page.getByLabel(/room code/i).pressSequentially(code.toLowerCase().replace('-', ' '))
  await p.page.waitForURL(new RegExp(`/r/${code}$`)) // no Enter, no extra step
  await joinForm(p, kind)
}

async function joinForm(p: Player, kind: 'household' | 'typist') {
  await p.page.getByLabel(/Your name/).fill(p.name)
  if (kind === 'typist') await p.page.getByRole('radio', { name: 'Type on my phone' }).check()
  await p.page.getByRole('button', { name: 'Join' }).click()
  if (kind === 'typist') await expect(p.page.getByRole('heading', { name: 'Waiting for the game to start' })).toBeVisible()
  else await expect(readyButton(p)).toBeVisible()
}

async function createRoom(p: Player): Promise<string> {
  await p.page.goto('/')
  await p.page.getByRole('button', { name: 'Start a room' }).click()
  await p.page.waitForURL(/\/r\/[A-Z]+-\d{4}$/)
  const code = new URL(p.page.url()).pathname.split('/').pop()!
  expect(code).toMatch(/^[A-Z]+-\d{4}$/)
  await joinForm(p, 'household')
  return code
}

const readyButton = (p: Player) => p.page.getByRole('button', { name: /^Ready\?/ })

async function tiles(p: Player, selector = IN_GAME_BOARD): Promise<string[]> {
  return p.page.locator(`${selector} [data-testid="tile"]`).allTextContents()
}

/** Waits for the next in-game board on each household and returns the gap between first appearances. */
async function boardsAppear(players: Player[], seenBefore: number[]): Promise<number> {
  await Promise.all(players.map((p) => expect(p.page.locator(IN_GAME_BOARD)).toBeVisible({ timeout: 20_000 })))
  await expect.poll(() => players.every((p, i) => p.boardSeen.length > seenBefore[i])).toBe(true)
  const times = players.map((p, i) => p.boardSeen[seenBefore[i]])
  const gap = Math.max(...times) - Math.min(...times)
  const pageGap = Math.abs(players[0].boardSeenPage[seenBefore[0]] - players[1].boardSeenPage[seenBefore[1]])
  console.log(`[timing] board appearance gap ${gap} ms (node clock); page clocks differ by ${pageGap} ms`)
  return gap
}

async function typeWord(p: Player, word: string) {
  const input = p.page.getByLabel('Word')
  await input.fill(word)
  await input.press('Enter')
  await expect(p.page.getByRole('listitem').filter({ hasText: new RegExp(`^${word}$`, 'i') })).toBeVisible()
}

async function pensDownAll(households: Player[], everyone: Player[]) {
  await Promise.all(households.map((p) => expect(p.page.getByRole('button', { name: 'Pens down!' })).toBeVisible({ timeout: 20_000 })))
  for (const p of households) await p.page.getByRole('button', { name: 'Pens down!' }).click()
  await Promise.all(everyone.map((p) => expect(p.page.getByTestId('results')).toBeVisible()))
}

function roomRound(code: string): number {
  expect(code).toMatch(/^[A-Z]+-\d{4}$/)
  return Number(psql(`select round from rooms where code = '${code}'`))
}

const players: Player[] = []
test.afterEach(async () => {
  await Promise.all(players.splice(0).map((p) => p.context.close()))
})
async function add(...ps: Promise<Player>[]) {
  const out = await Promise.all(ps)
  players.push(...out)
  return out
}

test('full game', async ({ browser }) => {
  const [lates, grandma, chris, jo] = await add(
    newPlayer(browser, 'Lates', DESKTOP),
    newPlayer(browser, 'Grandma', DESKTOP),
    newPlayer(browser, 'Chris', PHONE),
    newPlayer(browser, 'Jo', PHONE),
  )
  const households = [lates, grandma]
  const typists = [chris, jo]
  const everyone = [...households, ...typists]

  const code = await createRoom(lates)
  await joinByVoice(grandma, code, 'household')
  await joinAs(chris, code, 'typist')
  await joinByVoice(jo, code, 'typist')
  await expect(lates.page.locator('.household-list li')).toHaveText([/Lates/, /Grandma/])
  await expect(lates.page.getByText('2 people typing on phones')).toBeVisible()

  // Round 1
  for (const p of households) await readyButton(p).click()
  const gap1 = await boardsAppear(households, [0, 0])
  expect(gap1).toBeLessThanOrEqual(BOARD_SYNC_MS)
  const round1 = await tiles(lates)
  expect(round1).toHaveLength(16)
  expect(await tiles(grandma)).toEqual(round1)

  // Typists type; they never see a board
  await Promise.all(typists.map((p) => expect(p.page.getByLabel('Word')).toBeVisible()))
  await typeWord(chris, 'rain')
  await typeWord(chris, 'sand')
  await typeWord(jo, 'sand')
  await typeWord(jo, 'hold')
  for (const p of typists) {
    await expect(p.page.getByTestId('board')).toHaveCount(0)
    expect(p.boardSeen).toHaveLength(0)
  }

  await pensDownAll(households, everyone)
  for (const p of typists) expect(p.boardSeen).toHaveLength(0)

  // Results: shared word struck through in both columns
  for (const p of everyone) {
    const chrisCol = p.page.getByTestId('results-col').filter({ has: p.page.getByTestId('results-name').filter({ hasText: 'Chris' }) })
    const joCol = p.page.getByTestId('results-col').filter({ has: p.page.getByTestId('results-name').filter({ hasText: 'Jo' }) })
    await expect(chrisCol.locator('s')).toHaveText(['SAND'])
    await expect(chrisCol.locator('b')).toHaveText(['RAIN'])
    await expect(joCol.locator('s')).toHaveText(['SAND'])
    await expect(joCol.locator('b')).toHaveText(['HOLD'])
  }

  // Round 2
  for (const p of households) await readyButton(p).click()
  await Promise.all(households.map((p) => expect(p.page.getByTestId('countdown')).toBeVisible()))
  await Promise.all(typists.map((p) => expect(p.page.getByRole('heading', { name: 'Get ready...' })).toBeVisible()))
  const gap2 = await boardsAppear(households, [1, 1])
  expect(gap2).toBeLessThanOrEqual(BOARD_SYNC_MS)
  expect(roomRound(code)).toBe(2)
  const round2 = await tiles(lates)
  expect(round2).toHaveLength(16)
  expect(await tiles(grandma)).toEqual(round2)
  // Different board with overwhelming probability; the countdown and the round number above
  // already prove a new round, so an (astronomically unlikely) equal roll is only logged.
  if (round2.join() === round1.join()) console.log('[note] round 2 rolled the same board as round 1')
  else expect(round2).not.toEqual(round1)

  // Typists: back to typing with empty lists
  for (const p of typists) {
    await expect(p.page.getByLabel('Word')).toBeVisible()
    await expect(p.page.getByText('0 words')).toBeVisible()
    await expect(p.page.getByRole('listitem')).toHaveCount(0)
    await expect(p.page.getByTestId('board')).toHaveCount(0)
  }
})

test('refresh mid-round keeps place', async ({ browser }) => {
  const [lates, grandma, chris] = await add(
    newPlayer(browser, 'Lates', DESKTOP),
    newPlayer(browser, 'Grandma', DESKTOP),
    newPlayer(browser, 'Chris', PHONE),
  )
  const code = await createRoom(lates)
  await joinAs(grandma, code, 'household')
  await joinAs(chris, code, 'typist')

  for (const p of [lates, grandma]) await readyButton(p).click()
  await boardsAppear([lates, grandma], [0, 0])
  const letters = await tiles(grandma)
  await expect(chris.page.getByLabel('Word')).toBeVisible()
  await typeWord(chris, 'rain')
  await typeWord(chris, 'sand')

  // The typist list is optimistic: wait until the server has both words, otherwise a reload
  // in the same instant can abort the in-flight submit_word request (that word is then lost).
  await expect.poll(() => psql(`select count(*) from words where room_code = '${code}'`)).toBe('2')

  // Reload both while the round is being played
  await expect(grandma.page.getByTestId('fill')).toBeVisible()
  await Promise.all([grandma.page.reload(), chris.page.reload()])

  await expect(grandma.page.locator(IN_GAME_BOARD)).toBeVisible()
  expect(await tiles(grandma)).toEqual(letters)
  await expect(grandma.page.getByLabel(/Your name/)).toHaveCount(0)
  // after a reload the list comes back in server order; compare as a set
  await expect(chris.page.getByText('2 words')).toBeVisible()
  expect((await chris.page.getByRole('listitem').allTextContents()).sort()).toEqual(['RAIN', 'SAND'])

  // Still the same household (same name, listed once) once the round is over
  await pensDownAll([lates, grandma], [lates, grandma, chris])
  await expect(grandma.page.locator('.household-list li')).toHaveText([/Lates/, /Grandma/])
  const rows = psql(`select kind || ':' || name from participants where room_code = '${code}' order by joined_at`)
  expect(rows.split('\n')).toEqual(['household:Lates', 'household:Grandma', 'typist:Chris'])
})

test('wrong system clock', async ({ browser }) => {
  const [lates, grandma] = await add(
    newPlayer(browser, 'Lates', DESKTOP),
    newPlayer(browser, 'Grandma', DESKTOP, { clockOffsetMs: 10 * 60 * 1000 }),
  )
  // the fake clock really is 10 minutes ahead in Grandma's page
  await grandma.page.goto('/')
  const skew = (await grandma.page.evaluate(() => Date.now())) - Date.now()
  expect(Math.abs(skew - 10 * 60 * 1000)).toBeLessThan(5000)

  const code = await createRoom(lates)
  await joinAs(grandma, code, 'household')
  for (const p of [lates, grandma]) await readyButton(p).click()
  const gap = await boardsAppear([lates, grandma], [0, 0])
  expect(gap).toBeLessThanOrEqual(BOARD_SYNC_MS)
  expect(await tiles(grandma)).toEqual(await tiles(lates))

  // the drain fill is in step on both screens
  const heights = await Promise.all(
    [lates, grandma].map((p) => p.page.getByTestId('fill').evaluate((el) => parseFloat((el as HTMLElement).style.height))),
  )
  console.log(`[timing] fill heights ${heights.map((h) => h.toFixed(1)).join('% / ')}%`)
  expect(heights[0]).toBeLessThan(100)
  expect(Math.abs(heights[0] - heights[1])).toBeLessThan(5)
})

test('two households tap Ready at the same instant', async ({ browser }) => {
  const [lates, grandma] = await add(newPlayer(browser, 'Lates', DESKTOP), newPlayer(browser, 'Grandma', DESKTOP))
  const code = await createRoom(lates)
  await joinAs(grandma, code, 'household')

  await Promise.all([readyButton(lates).click(), readyButton(grandma).click()])
  await boardsAppear([lates, grandma], [0, 0])
  expect(roomRound(code)).toBe(1)
  await pensDownAll([lates, grandma], [lates, grandma])
  expect(roomRound(code)).toBe(1)
})

test('a misheard code is fixed in place on the not-found page', async ({ browser }) => {
  const [lates, grandma] = await add(newPlayer(browser, 'Lates', DESKTOP), newPlayer(browser, 'Grandma', PHONE))
  const code = await createRoom(lates)
  const [word, digits] = code.split('-')
  const wrong = `${word}-${digits.slice(0, 3)}${(Number(digits[3]) + 1) % 10}`
  expect(psql(`select count(*) from rooms where code = '${wrong}'`)).toBe('0')

  await grandma.page.goto('/')
  await grandma.page.getByLabel(/room code/i).pressSequentially(wrong.toLowerCase().replace('-', ', '))
  await expect(grandma.page.getByRole('heading', { name: `No room with the code ${wrong}` })).toBeVisible()
  const field = grandma.page.getByLabel(/room code/i)
  await expect(field).toHaveValue(wrong)
  await field.press('End')
  await field.press('Backspace')
  await field.pressSequentially(digits[3])
  await grandma.page.waitForURL(new RegExp(`/r/${code}$`))
  await joinForm(grandma, 'household')
  await expect(lates.page.locator('.household-list li')).toHaveText([/Lates/, /Grandma/])
})
