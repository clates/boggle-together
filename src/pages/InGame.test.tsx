import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Participant, RoomRow } from '../lib/useRoom'

const tone = vi.hoisted(() => vi.fn())
vi.mock('../lib/audio', () => ({ playCountdownTone: tone }))

import InGame, { type InGameRoom } from './InGame'

const LETTERS = ['T', 'E', 'R', 'S', 'A', 'N', 'O', 'I', 'L', 'D', 'P', 'M', 'U', 'C', 'H', 'Qu']
const ROUND_MS = 180_000
const T0 = Date.parse('2026-11-07T12:00:00Z')

const me: Participant = { room_code: 'ABCD', id: '1', kind: 'household', name: 'Smiths', ready: false, pens_down: false }

function makeRoom(over: Partial<InGameRoom> & { now?: () => number; roomOver?: Partial<RoomRow> } = {}): InGameRoom {
  const { now = () => T0, roomOver = {}, ...rest } = over
  return {
    room: {
      code: 'ABCD',
      round: 1,
      start_at: new Date(T0).toISOString(),
      ends_at: new Date(T0 + ROUND_MS).toISOString(),
      results_at: null,
      ...roomOver,
    },
    me,
    phase: 'playing',
    serverNowMs: now,
    board: LETTERS,
    actions: {
      pensDown: vi.fn().mockResolvedValue(undefined),
      removeParticipant: vi.fn().mockResolvedValue(undefined),
      showResults: vi.fn().mockResolvedValue(undefined),
      setReady: vi.fn().mockResolvedValue(undefined),
      startAnyway: vi.fn().mockResolvedValue(undefined),
      submitWord: vi.fn().mockResolvedValue(undefined),
    },
    ...rest,
  }
}

// jsdom normalizes colors (hsl -> rgb), so compare against the same normalization of the expected value.
function css(color: string) {
  const probe = document.createElement('div')
  probe.style.background = color
  return probe.style.background
}

beforeEach(() => tone.mockClear())
afterEach(() => vi.useRealTimers())

describe('InGame playing', () => {
  it('fill is 100% tall and green at progress 1', () => {
    render(<InGame code="ABCD" room={makeRoom({ now: () => T0 })} />)
    const fill = screen.getByTestId('fill')
    expect(fill.style.height).toBe('100%')
    expect(fill.style.background).toBe(css('hsl(130 70% 45%)'))
    expect(fill).toHaveAttribute('aria-hidden', 'true')
  })

  it('fill is 50% tall and yellow-green at progress 0.5', () => {
    render(<InGame code="ABCD" room={makeRoom({ now: () => T0 + ROUND_MS / 2 })} />)
    const fill = screen.getByTestId('fill')
    expect(fill.style.height).toBe('50%')
    expect(fill.style.background).toBe(css('hsl(65 70% 45%)'))
  })

  it('fill is absent at progress 0', () => {
    render(<InGame code="ABCD" room={makeRoom({ now: () => T0 + ROUND_MS, phase: 'locked' })} />)
    expect(screen.queryByTestId('fill')).not.toBeInTheDocument()
  })

  it('shows no clock-like text while playing', () => {
    const { container } = render(<InGame code="ABCD" room={makeRoom({ now: () => T0 + 61_000 })} />)
    expect(container.textContent).not.toMatch(/\d+:\d\d/)
    expect(screen.getByTestId('board')).toBeInTheDocument()
    expect(screen.getByText('Qu')).toBeInTheDocument()
  })

  it('renders a quiet blank when the board has not arrived', () => {
    render(<InGame code="ABCD" room={makeRoom({ board: null })} />)
    expect(screen.queryByTestId('board')).not.toBeInTheDocument()
    expect(screen.getByTestId('fill')).toBeInTheDocument()
  })

  it('rotate cycles 0, 90, 180, 270, 0 and calls no action', () => {
    const room = makeRoom()
    render(<InGame code="ABCD" room={room} />)
    const wrap = () => screen.getByTestId('board').parentElement!
    expect(wrap().style.transform).toBe('rotate(0deg)')
    fireEvent.click(screen.getByRole('button', { name: /menu/i }))
    expect(screen.getByText('ABCD')).toBeInTheDocument()
    const rotate = screen.getByRole('button', { name: /rotate/i })
    for (const deg of [90, 180, 270, 0]) {
      fireEvent.click(rotate)
      expect(wrap().style.transform).toBe(`rotate(${deg}deg)`)
    }
    for (const fn of Object.values(room.actions)) expect(fn).not.toHaveBeenCalled()
  })
})

describe('InGame countdown', () => {
  it('hides the board and shows whole seconds left', () => {
    render(<InGame code="ABCD" room={makeRoom({ phase: 'countdown', now: () => T0 - 3_200 })} />)
    expect(screen.queryByTestId('board')).not.toBeInTheDocument()
    expect(screen.getByTestId('countdown')).toHaveTextContent('4')
    expect(screen.getByText(/pens ready/i)).toBeInTheDocument()
  })

  it('plays the tone once per distinct second', () => {
    let now = T0 - 4_500
    const room = makeRoom({ phase: 'countdown', now: () => now })
    const { rerender } = render(<InGame code="ABCD" room={room} />)
    expect(tone).toHaveBeenCalledTimes(1)
    expect(tone).toHaveBeenLastCalledWith(5)
    for (const t of [T0 - 4_400, T0 - 4_100, T0 - 4_010]) {
      now = t
      rerender(<InGame code="ABCD" room={{ ...room }} />)
    }
    expect(tone).toHaveBeenCalledTimes(1)
    now = T0 - 3_900
    rerender(<InGame code="ABCD" room={{ ...room }} />)
    expect(tone).toHaveBeenCalledTimes(2)
    expect(tone).toHaveBeenLastCalledWith(4)
    now = T0 - 3_800
    rerender(<InGame code="ABCD" room={{ ...room }} />)
    expect(tone).toHaveBeenCalledTimes(2)
  })
})

describe('InGame locked', () => {
  it('Pens down! calls pensDown once, then shows waiting', async () => {
    const room = makeRoom({ phase: 'locked', now: () => T0 + ROUND_MS + 1_000 })
    let resolve!: () => void
    room.actions.pensDown = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    render(<InGame code="ABCD" room={room} />)
    expect(screen.getByTestId('board')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: 'Pens down!' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(room.actions.pensDown).toHaveBeenCalledTimes(1)
    await act(async () => resolve())
    expect(screen.getByText(/waiting for the other households/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pens down!' })).not.toBeInTheDocument()
  })

  it('shows waiting when the server already has pens down', () => {
    render(<InGame code="ABCD" room={makeRoom({ phase: 'locked', now: () => T0 + ROUND_MS, me: { ...me, pens_down: true } })} />)
    expect(screen.getByText(/waiting for the other households/i)).toBeInTheDocument()
  })

  it('surfaces a pensDown error inline and lets you retry', async () => {
    const room = makeRoom({ phase: 'locked', now: () => T0 + ROUND_MS })
    room.actions.pensDown = vi.fn().mockRejectedValue(new Error('Network down'))
    render(<InGame code="ABCD" room={room} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Pens down!' })))
    expect(screen.getByRole('alert')).toHaveTextContent('Network down')
    expect(screen.getByRole('button', { name: 'Pens down!' })).toBeEnabled()
  })

  it('Show results appears only 30 s after ends_at', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0 + ROUND_MS + 1_000)
    const room = makeRoom({ phase: 'locked', now: () => Date.now() })
    render(<InGame code="ABCD" room={room} />)
    expect(screen.queryByRole('button', { name: 'Show results' })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(28_000))
    expect(screen.queryByRole('button', { name: 'Show results' })).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1_500))
    const show = screen.getByRole('button', { name: 'Show results' })
    await act(async () => fireEvent.click(show))
    expect(room.actions.showResults).toHaveBeenCalledTimes(1)
  })
})
