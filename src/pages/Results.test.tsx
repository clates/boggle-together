import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeWordsClient, type Row } from '../lib/fakeWordsClient'
import type { Participant } from '../lib/useRoom'
import Results, { type ResultsRoom } from './Results'

const LETTERS = 'TERSANOILDPMUCHE'.split('')

const person = (id: string, kind: Participant['kind'], name: string, extra: Partial<Participant> = {}): Participant => ({
  room_code: 'ABCD', id, kind, name, ready: false, pens_down: false, joined_at: `2026-11-07T10:00:0${id.length}.000Z`, ...extra,
})

function typists(n: number): Participant[] {
  // joined_at gives the order; ids are deliberately not in that order
  return Array.from({ length: n }, (_, i) =>
    person(`t${n - i}`, 'typist', `Typist ${i + 1}`, { joined_at: `2026-11-07T10:00:${String(10 + i).padStart(2, '0')}.000Z` }),
  )
}

// 32 unique words per typist, plus SHARED for the first two typists, in scrambled order.
function rowsFor(ts: Participant[]): Row[] {
  const rows: Row[] = []
  ts.forEach((t, ti) => {
    for (let i = 31; i >= 0; i--) rows.push({ participant_id: t.id, word: `${String.fromCharCode(90 - ((i * 7) % 26))}Q${ti}X${i}` })
    if (ti < 2) rows.push({ participant_id: t.id, word: 'SHARED' })
  })
  return rows
}

function makeRoom(over: Partial<ResultsRoom> = {}): ResultsRoom {
  const households = [person('h1', 'household', 'Lates', { ready: true }), person('h2', 'household', 'Aunt Jo')]
  return {
    room: { code: 'ABCD', round: 2, start_at: 'x', ends_at: 'x', results_at: 'x' },
    participants: [...households, ...typists(4)],
    me: households[1],
    board: LETTERS,
    actions: { setReady: vi.fn().mockResolvedValue(undefined), startAnyway: vi.fn().mockResolvedValue(undefined) },
    ...over,
  }
}

function setup(over: Partial<ResultsRoom> = {}, rows?: Row[]) {
  const room = makeRoom(over)
  const ts = room.participants.filter((p) => p.kind === 'typist')
  const data = rows ?? rowsFor(ts)
  const fake = fakeWordsClient(() => ({ data, error: null }))
  render(<Results code="ABCD" room={room} client={fake.client} />)
  return { room, fake }
}

const columns = () => screen.findAllByTestId('results-col')

describe('Results', () => {
  it('shows a column per typist in join order, each header with name and count, words alphabetical', async () => {
    setup()
    const cols = await columns()
    expect(cols).toHaveLength(4)
    cols.forEach((col, i) => {
      const header = within(col).getByTestId('results-name')
      const count = i < 2 ? 33 : 32
      expect(header).toHaveTextContent(`Typist ${i + 1}`)
      expect(header).toHaveTextContent(String(count))
      const words = within(col).getAllByRole('listitem').map((li) => li.textContent ?? '')
      expect(words).toHaveLength(count)
      expect(words).toEqual([...words].sort())
    })
  })

  it('strikes through a word found by 2 typists in both columns, and a unique word is bold, not struck', async () => {
    setup()
    const cols = await columns()
    for (const col of cols.slice(0, 2)) {
      const shared = within(col).getByText('SHARED')
      expect(shared.closest('s')).not.toBeNull()
    }
    const unique = within(cols[0]).getAllByRole('listitem').find((li) => li.textContent !== 'SHARED')!
    expect(unique.querySelector('s')).toBeNull()
    expect(unique.querySelector('b, strong')).not.toBeNull()
  })

  it('uses the larger word size for 4 typists', async () => {
    setup()
    await columns()
    expect(screen.getByTestId('results-words')).toHaveAttribute('data-size', 'large')
    expect(screen.getByTestId('results-words')).toHaveClass('results-words-large')
  })

  it('uses the smaller word size for 8 typists', async () => {
    const room = makeRoom()
    setup({ participants: [...room.participants.filter((p) => p.kind === 'household'), ...typists(8)] })
    expect(await columns()).toHaveLength(8)
    expect(screen.getByTestId('results-words')).toHaveAttribute('data-size', 'small')
    expect(screen.getByTestId('results-words')).toHaveClass('results-words-small')
  })

  it('has one scroll container with overflow auto and sticky names', async () => {
    setup()
    const cols = await columns()
    const scroller = screen.getByTestId('results-words')
    expect(scroller).toHaveStyle({ overflow: 'auto' })
    cols.forEach((col) => {
      expect(scroller).toContainElement(col)
      expect(within(col).getByTestId('results-name')).toHaveStyle({ position: 'sticky', top: '0px' })
    })
  })

  it('gives a typist with no words a column with 0, and keys columns by id even if names collide', async () => {
    const hh = person('h1', 'household', 'Lates')
    const a = person('a', 'typist', 'Sam', { joined_at: '2026-11-07T10:00:01Z' })
    const b = person('b', 'typist', 'Sam', { joined_at: '2026-11-07T10:00:02Z' })
    setup({ participants: [hh, a, b], me: hh }, [{ participant_id: 'a', word: 'CAT' }])
    const cols = await columns()
    expect(cols).toHaveLength(2)
    expect(within(cols[0]).getByTestId('results-name')).toHaveTextContent(/Sam\s*1/)
    expect(within(cols[1]).getByTestId('results-name')).toHaveTextContent(/Sam\s*0/)
    expect(within(cols[1]).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('shows the board, the room code and the household list', async () => {
    setup()
    await columns()
    expect(screen.getAllByTestId('tile')).toHaveLength(16)
    expect(screen.getByText('ABCD')).toBeInTheDocument()
    expect(screen.getByText('Lates')).toBeInTheDocument()
    expect(screen.getByText('Aunt Jo')).toBeInTheDocument()
  })

  it('the Ready? button calls actions.setReady', async () => {
    const { room } = setup()
    await userEvent.click(screen.getByRole('button', { name: /Ready\?/ }))
    expect(room.actions.setReady).toHaveBeenCalledWith(true)
  })

  it('shows a message when setReady fails', async () => {
    const setReady = vi.fn().mockRejectedValue(new Error('Network down'))
    setup({ actions: { setReady, startAnyway: vi.fn() } })
    await userEvent.click(screen.getByRole('button', { name: /Ready\?/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down')
  })

  it('shows Start anyway only when at least half but not all households are ready', async () => {
    const h = (id: string, ready: boolean) => person(id, 'household', 'H' + id, { ready })
    const ts = typists(1)
    // 1 of 2 ready: shown, and it calls startAnyway
    const { room } = setup({ participants: [h('1', true), h('2', false), ...ts], me: h('1', true) })
    await userEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    expect(room.actions.startAnyway).toHaveBeenCalled()
  })

  it.each([
    ['none of 3 ready', [false, false, false]],
    ['1 of 3 ready', [true, false, false]],
    ['all ready', [true, true]],
  ])('hides Start anyway when %s', async (_label, readies) => {
    const hs = readies.map((r, i) => person('h' + i, 'household', 'H' + i, { ready: r }))
    setup({ participants: [...hs, ...typists(1)], me: hs[0] })
    await columns()
    expect(screen.queryByRole('button', { name: 'Start anyway' })).toBeNull()
  })

  it('shows Start anyway for 2 of 4 ready', async () => {
    const hs = [true, true, false, false].map((r, i) => person('h' + i, 'household', 'H' + i, { ready: r }))
    setup({ participants: [...hs, ...typists(1)], me: hs[0] })
    expect(await screen.findByRole('button', { name: 'Start anyway' })).toBeInTheDocument()
  })

  it('typists see the board and words but no Ready or Start anyway buttons', async () => {
    const room = makeRoom()
    const me = room.participants.find((p) => p.kind === 'typist')!
    setup({ me })
    expect(await columns()).toHaveLength(4)
    expect(screen.getAllByTestId('tile')).toHaveLength(16)
    expect(screen.queryByRole('button', { name: /Ready\?/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start anyway' })).toBeNull()
  })

  it('shows a friendly line when nobody typed', async () => {
    const hs = [person('h1', 'household', 'Lates')]
    setup({ participants: hs, me: hs[0] }, [])
    expect(await screen.findByText('Nobody typed their words this round. Score on paper!')).toBeInTheDocument()
    expect(screen.queryAllByTestId('results-col')).toHaveLength(0)
  })

  it('shows a retry button when the words fail to load, and retrying loads them', async () => {
    const room = makeRoom()
    let fail = true
    const fake = fakeWordsClient(() => (fail ? { data: null, error: { message: 'boom' } } : { data: rowsFor(room.participants.filter((p) => p.kind === 'typist')), error: null }))
    render(<Results code="ABCD" room={room} client={fake.client} />)
    const retry = await screen.findByRole('button', { name: /retry/i })
    fail = false
    await userEvent.click(retry)
    await waitFor(() => expect(screen.getAllByTestId('results-col')).toHaveLength(4))
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })
})
