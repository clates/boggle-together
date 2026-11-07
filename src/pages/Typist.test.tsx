import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Participant } from '../lib/useRoom'
import Typist, { type TypistRoom } from './Typist'

const me: Participant = { room_code: 'ABCD', id: '1', kind: 'typist', name: 'Typist', ready: false, pens_down: false }

function makeRoom(over: Partial<TypistRoom> = {}): TypistRoom {
  return { me, phase: 'playing', actions: { submitWord: vi.fn().mockResolvedValue(undefined) }, ...over }
}

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
    const submitWord = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Too late'))
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
    const submitWord = vi.fn().mockRejectedValue(new Error('Word limit reached'))
    render(<Typist room={makeRoom({ actions: { submitWord } })} />)
    type('cat')
    expect(await screen.findByText('Word limit reached')).toBeTruthy()
  })

  it('has no board and no clock', () => {
    const { container } = render(<Typist room={makeRoom()} />)
    expect(container.querySelector('[data-testid="board"], .board')).toBeNull()
    expect(container.textContent).not.toMatch(/\d+:\d\d/)
  })

  it('countdown shows a waiting message and no input', () => {
    render(<Typist room={makeRoom({ phase: 'countdown' })} />)
    expect(screen.getByText(/Get ready/)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('locked still shows the list and still accepts an attempt', async () => {
    const submitWord = vi.fn().mockRejectedValue(new Error('Too late'))
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
})
