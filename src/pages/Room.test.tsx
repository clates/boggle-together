import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Participant } from '../lib/useRoom'

const hook = vi.hoisted(() => ({ value: {} as any, code: '' }))
vi.mock('../lib/useRoom', () => ({
  useRoom: (code: string) => {
    hook.code = code
    return hook.value
  },
}))
vi.mock('../lib/useRoundWords', () => ({ useRoundWords: () => ({ status: 'loading', byParticipant: {}, retry: () => {} }) }))

import Room from './Room'

const p = (id: string, kind: Participant['kind'], ready = false): Participant => ({
  room_code: 'ABCD', id, name: 'N' + id, kind, ready, pens_down: false,
})

function setHook(over: Record<string, unknown>) {
  hook.value = {
    status: 'ready', room: { code: 'ABCD', round: 0 }, participants: [], me: null, phase: 'lobby',
    serverNowMs: () => Date.now(), board: null, join: vi.fn().mockResolvedValue(undefined),
    actions: { setReady: vi.fn().mockResolvedValue(undefined), startAnyway: vi.fn().mockResolvedValue(undefined) },
    ...over,
  }
}

function renderRoom(path = '/r/ABCD') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>HOME PAGE</p>} />
        <Route path="/r/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => setHook({}))

describe('Room', () => {
  it('shows Room not found with a link home', async () => {
    setHook({ status: 'not-found' })
    renderRoom()
    expect(screen.getByText('Room not found')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /home/i }))
    expect(screen.getByText('HOME PAGE')).toBeInTheDocument()
  })

  it('shows loading', () => {
    setHook({ status: 'loading' })
    renderRoom()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('needs-join shows JoinForm and join is called', async () => {
    setHook({ status: 'needs-join' })
    renderRoom()
    await userEvent.type(screen.getByLabelText(/name/i), '  Smiths ')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(hook.value.join).toHaveBeenCalledWith('household', 'Smiths')
  })

  it('JoinForm typist choice and join error', async () => {
    setHook({ status: 'needs-join', join: vi.fn().mockRejectedValue(new Error('Room is full')) })
    renderRoom()
    expect(screen.getByLabelText('Shared screen')).toBeChecked()
    await userEvent.click(screen.getByLabelText('Type my words'))
    await userEvent.type(screen.getByLabelText(/name/i), 'Tina')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(hook.value.join).toHaveBeenCalledWith('typist', 'Tina')
    expect(await screen.findByText('Room is full')).toBeInTheDocument()
  })

  it('blocks empty and over-long names with a message', async () => {
    setHook({ status: 'needs-join' })
    renderRoom()
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/1 to 24/)
    await userEvent.type(screen.getByLabelText(/name/i), 'x'.repeat(25))
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/1 to 24/)
    expect(hook.value.join).not.toHaveBeenCalled()
  })

  it('lobby: code, link, Ready toggles via setReady', async () => {
    const me = p('1', 'household')
    setHook({ me, participants: [me] })
    renderRoom()
    expect(screen.getByText('ABCD')).toBeInTheDocument()
    expect(screen.getByText(`${location.origin}/r/ABCD`)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /ready\?/i }))
    expect(hook.value.actions.setReady).toHaveBeenCalledWith(true)
  })

  it('Ready toggles off when already ready', async () => {
    const me = p('1', 'household', true)
    const other = p('2', 'household')
    const third = p('3', 'household')
    setHook({ me, participants: [me, other, third] })
    renderRoom()
    await userEvent.click(screen.getByRole('button', { name: /ready\?/i }))
    expect(hook.value.actions.setReady).toHaveBeenCalledWith(false)
  })

  it('Start anyway only when at least half but not all ready', async () => {
    const a = p('1', 'household', true), b = p('2', 'household', false), c = p('3', 'household', false)
    setHook({ me: a, participants: [a, b, c, p('4', 'typist')] })
    const { unmount } = renderRoom()
    expect(screen.queryByRole('button', { name: 'Start anyway' })).not.toBeInTheDocument() // 1 of 3 < 2
    unmount()

    const a2 = p('1', 'household', true), b2 = p('2', 'household', true), c2 = p('3', 'household', false)
    setHook({ me: a2, participants: [a2, b2, c2] })
    const r2 = renderRoom()
    await userEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    expect(hook.value.actions.startAnyway).toHaveBeenCalled()
    r2.unmount()

    const all = [p('1', 'household', true), p('2', 'household', true)]
    setHook({ me: all[0], participants: all })
    renderRoom()
    expect(screen.queryByRole('button', { name: 'Start anyway' })).not.toBeInTheDocument()
  })

  it('a lowercase room link joins the same room as the uppercase one', () => {
    const me = p('1', 'household')
    setHook({ me, participants: [me] })
    renderRoom('/r/abcd')
    expect(hook.code).toBe('ABCD')
    expect(screen.getByText('ABCD')).toBeInTheDocument()
    expect(screen.getByText(`${location.origin}/r/ABCD`)).toBeInTheDocument()
  })

  it('typist in lobby sees waiting screen', () => {
    const me = p('9', 'typist')
    setHook({ me, participants: [me] })
    renderRoom()
    expect(screen.getByText('Waiting for the game to start')).toBeInTheDocument()
  })

  it('stubs by phase and kind', async () => {
    const h = p('1', 'household'), t = p('2', 'typist')
    setHook({ me: h, participants: [h, t], phase: 'playing' })
    const r = renderRoom()
    expect(screen.getByTestId('in-game')).toHaveClass('ingame-playing')
    r.unmount()
    setHook({ me: t, participants: [h, t], phase: 'countdown' })
    const r2 = renderRoom()
    expect(screen.getByText(/Get ready/)).toBeInTheDocument()
    r2.unmount()
    setHook({ me: t, participants: [h, t], phase: 'results' })
    renderRoom()
    await waitFor(() => expect(screen.getByTestId('results')).toBeInTheDocument())
  })
})
