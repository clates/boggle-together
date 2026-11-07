import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Participant, RoomRow } from '../lib/useRoom'
import { RpcError } from '../lib/rpcError'
import { resetAudio } from '../lib/audio'
import { FakeAudioContext } from '../lib/audio/fakeAudioContext'
import Typist, { type TypistRoom } from './Typist'

const LETTERS = ['T', 'E', 'R', 'S', 'A', 'N', 'O', 'I', 'L', 'D', 'P', 'M', 'U', 'C', 'H', 'Qu']
const ROUND_MS = 180_000
const T0 = Date.parse('2026-11-07T12:00:00Z')

const rejected = (msg: string) => new RpcError(msg, 'P0001')
const offline = () => new RpcError('TypeError: Failed to fetch', '')

const me: Participant = { room_code: 'ABCD', id: '1', kind: 'typist', name: 'Typist', ready: false, pens_down: false }

function makeRoom(over: Partial<TypistRoom> & { now?: number; roomOver?: Partial<RoomRow> } = {}): TypistRoom {
  const { now = T0 + 1000, roomOver = {}, ...rest } = over
  return {
    me,
    phase: 'playing',
    room: {
      code: 'ABCD',
      round: 1,
      start_at: new Date(T0).toISOString(),
      ends_at: new Date(T0 + ROUND_MS).toISOString(),
      results_at: null,
      ...roomOver,
    },
    serverNowMs: () => now,
    board: LETTERS,
    actions: { submitWord: vi.fn().mockResolvedValue(undefined) },
    ...rest,
  }
}

// jsdom normalizes colors (hsl -> rgb), so compare against the same normalization of the expected value.
function css(color: string) {
  const probe = document.createElement('div')
  probe.style.background = color
  return probe.style.background
}

let AudioCtor: ReturnType<typeof vi.fn>
beforeEach(() => {
  const ctx = new FakeAudioContext({})
  AudioCtor = vi.fn(function () {
    return ctx
  })
  vi.stubGlobal('AudioContext', AudioCtor)
  resetAudio()
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetAudio()
})

const tileTexts = () => screen.getAllByTestId('tile').map((t) => t.textContent)

function type(text: string) {
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: text } })
  fireEvent.submit(input.closest('form')!)
}

describe('Typist', () => {
  it('normalizes, submits and lists a word', () => {
    const room = makeRoom()
    render(<Typist room={room} />)
    type(' Train ')
    expect(room.actions.submitWord).toHaveBeenCalledWith('TRAIN')
    expect(screen.getByText('TRAIN')).toBeTruthy()
    expect(screen.getByText('1 word')).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('')
  })

  it('does not send invalid words and shows a hint, keeping the text', () => {
    const room = makeRoom()
    render(<Typist room={room} />)
    type('ab')
    expect(room.actions.submitWord).not.toHaveBeenCalled()
    expect(screen.getByText('3 letters or more, A to Z only')).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('ab')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } })
    expect(screen.queryByText('3 letters or more, A to Z only')).toBeNull()
  })

  it('shows a duplicate once and does not re-send', () => {
    const room = makeRoom()
    render(<Typist room={room} />)
    type('train')
    type('TRAIN')
    expect(screen.getAllByText('TRAIN')).toHaveLength(1)
    expect(room.actions.submitWord).toHaveBeenCalledTimes(1)
  })

  it('lists newest first with a count', () => {
    render(<Typist room={makeRoom()} />)
    type('cat')
    type('dog')
    const items = screen.getAllByRole('listitem').map((l) => l.textContent)
    expect(items).toEqual(['DOG', 'CAT'])
    expect(screen.getByText('2 words')).toBeTruthy()
  })

  it('shows Too late on rejection, keeps earlier words, and removes the rejected one', async () => {
    const submitWord = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(rejected('Too late'))
    render(<Typist room={makeRoom({ actions: { submitWord } })} />)
    type('cat')
    type('dog')
    expect(await screen.findByText('Too late')).toBeTruthy()
    expect(screen.getByText('CAT')).toBeTruthy()
    expect(screen.queryByText('DOG')).toBeNull()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
    expect(screen.queryByText('Too late')).toBeNull()
  })

  it('shows other server messages as given', async () => {
    const submitWord = vi.fn().mockRejectedValue(rejected('Invalid word'))
    render(<Typist room={makeRoom({ actions: { submitWord } })} />)
    type('cat')
    expect(await screen.findByText('Invalid word')).toBeTruthy()
    expect(screen.queryByText('CAT')).toBeNull()
  })

  it('shows Word limit reached', async () => {
    const submitWord = vi.fn().mockRejectedValue(rejected('Word limit reached'))
    render(<Typist room={makeRoom({ actions: { submitWord } })} />)
    type('cat')
    expect(await screen.findByText('Word limit reached')).toBeTruthy()
  })

  it('playing: shows the board (same letters), the draining fill, and no clock', () => {
    const { container } = render(<Typist room={makeRoom({ now: T0 + ROUND_MS / 2 })} />)
    expect(screen.getByTestId('board')).toBeTruthy()
    expect(tileTexts()).toEqual(LETTERS)
    const fill = screen.getByTestId('fill')
    expect(fill.style.height).toBe('50%')
    expect(fill.style.background).toBe(css('hsl(65 70% 45%)'))
    expect(fill).toHaveAttribute('aria-hidden', 'true')
    expect(container.textContent).not.toMatch(/\d+:\d\d/)
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('playing: the fill follows the clock (full at the start, nearly gone at the end)', () => {
    const { rerender } = render(<Typist room={makeRoom({ now: T0 })} />)
    expect(screen.getByTestId('fill').style.height).toBe('100%')
    rerender(<Typist room={makeRoom({ now: T0 + ROUND_MS * 0.9 })} />)
    expect(parseFloat(screen.getByTestId('fill').style.height)).toBeCloseTo(10, 5)
    expect(screen.getByTestId('fill').style.background).toBe(css('hsl(13 70% 45%)'))
  })

  it('playing before the board arrives shows a blank square, not letters', () => {
    render(<Typist room={makeRoom({ board: null })} />)
    expect(screen.queryByTestId('board')).toBeNull()
    expect(screen.getByLabelText('Loading board')).toBeTruthy()
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('countdown: whole-second number and pens line, no board, no fill, no input', () => {
    render(<Typist room={makeRoom({ phase: 'countdown', now: T0 - 2500 })} />)
    expect(screen.getByTestId('countdown')).toHaveTextContent(/^3$/)
    expect(screen.getByText('Get ready to type')).toBeTruthy()
    expect(screen.queryByText(/pens/i)).toBeNull()
    expect(screen.queryByTestId('board')).toBeNull()
    expect(screen.queryByTestId('tile')).toBeNull()
    expect(screen.queryByTestId('fill')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('keeps a main landmark in every in-round phase', () => {
    for (const [phase, now] of [['countdown', T0 - 2500], ['playing', T0 + 1000], ['locked', T0 + ROUND_MS + 500]] as const) {
      const r = render(<Typist room={makeRoom({ phase, now })} />)
      expect(screen.getByRole('main')).toHaveAttribute('data-testid', 'typist')
      r.unmount()
    }
  })

  it('locked: board stays, fill is gone, no clock', () => {
    const { container } = render(<Typist room={makeRoom({ phase: 'locked', now: T0 + ROUND_MS + 500 })} />)
    expect(tileTexts()).toEqual(LETTERS)
    expect(screen.queryByTestId('fill')).toBeNull()
    expect(container.textContent).not.toMatch(/\d+:\d\d/)
  })

  it('Rotate board turns the board a quarter turn each tap', () => {
    render(<Typist room={makeRoom()} />)
    const wrap = () => (screen.getByTestId('board').parentElement as HTMLElement).style.transform
    expect(wrap()).toBe('rotate(0deg)')
    const btn = screen.getByRole('button', { name: /rotate board/i })
    fireEvent.click(btn)
    expect(wrap()).toBe('rotate(90deg)')
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(wrap()).toBe('rotate(0deg)')
  })

  it('never creates an audio context (typists stay silent)', () => {
    const { rerender } = render(<Typist room={makeRoom({ phase: 'countdown', now: T0 - 2500 })} />)
    rerender(<Typist room={makeRoom({ now: T0 + 1000 })} />)
    type('cat')
    rerender(<Typist room={makeRoom({ phase: 'locked', now: T0 + ROUND_MS + 500 })} />)
    expect(AudioCtor).not.toHaveBeenCalled()
  })

  it('locked still shows the list and still accepts an attempt', async () => {
    const submitWord = vi.fn().mockRejectedValue(rejected('Too late'))
    const { rerender } = render(<Typist room={makeRoom()} />)
    type('cat')
    rerender(<Typist room={makeRoom({ phase: 'locked', actions: { submitWord } })} />)
    expect(screen.getByText("Time's up!")).toBeTruthy()
    expect(screen.getByText('CAT')).toBeTruthy()
    type('dog')
    expect(submitWord).toHaveBeenCalledWith('DOG')
    expect(await screen.findByText('Too late')).toBeTruthy()
    expect(screen.getByText('CAT')).toBeTruthy()
  })

  it('focuses the input when playing starts', () => {
    const { rerender } = render(<Typist room={makeRoom({ phase: 'countdown' })} />)
    rerender(<Typist room={makeRoom()} />)
    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  it('seeds the list from earlier words without duplicates', async () => {
    const loadOwnWords = vi.fn().mockResolvedValue(['CAT', 'DOG'])
    render(<Typist room={makeRoom()} loadOwnWords={loadOwnWords} />)
    type('dog')
    expect(await screen.findByText('CAT')).toBeTruthy()
    expect(screen.getAllByText('DOG')).toHaveLength(1)
    await act(async () => {})
  })

  describe('flaky network', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('keeps the word marked sending... while it retries, then clears the mark', async () => {
      const submitWord = vi.fn().mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline()).mockResolvedValueOnce(undefined)
      render(<Typist room={makeRoom({ actions: { submitWord } })} />)
      type('cat')
      await act(() => vi.advanceTimersByTimeAsync(0))
      expect(screen.getByRole('listitem')).toHaveTextContent('CAT sending...')
      expect(screen.queryByRole('alert')).toBeNull()
      await act(() => vi.advanceTimersByTimeAsync(500))
      expect(submitWord).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('listitem')).toHaveTextContent('CAT sending...')
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(submitWord).toHaveBeenCalledTimes(3)
      expect(screen.getByRole('listitem')).toHaveTextContent(/^CAT$/)
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('removes the word after 3 failed retries with a connection message', async () => {
      const submitWord = vi.fn().mockRejectedValue(offline())
      render(<Typist room={makeRoom({ actions: { submitWord } })} />)
      type('cat')
      await act(() => vi.advanceTimersByTimeAsync(3499))
      expect(screen.getByText(/CAT/)).toBeTruthy()
      await act(() => vi.advanceTimersByTimeAsync(1))
      expect(submitWord).toHaveBeenCalledTimes(4)
      expect(screen.queryByText(/CAT/)).toBeNull()
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send. Check your connection.")
    })

    it('a server rejection during retries removes the word at once with its message', async () => {
      const submitWord = vi.fn().mockRejectedValueOnce(offline()).mockRejectedValueOnce(rejected('Too late'))
      render(<Typist room={makeRoom({ actions: { submitWord } })} />)
      type('cat')
      await act(() => vi.advanceTimersByTimeAsync(500))
      expect(submitWord).toHaveBeenCalledTimes(2)
      expect(screen.queryByText(/CAT/)).toBeNull()
      expect(screen.getByRole('alert')).toHaveTextContent('Too late')
      await act(() => vi.advanceTimersByTimeAsync(5000))
      expect(submitWord).toHaveBeenCalledTimes(2)
    })
  })
})
