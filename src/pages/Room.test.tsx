import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Participant } from '../lib/useRoom'

const hook = vi.hoisted(() => ({ value: {} as any, code: '', mounts: 0 }))
vi.mock('../lib/useRoom', async () => {
  const { useState } = await import('react')
  return {
    useRoom: (code: string) => {
      useState(() => hook.mounts++) // counts fresh lookups (mounts), not re-renders
      hook.code = code
      return hook.value
    },
  }
})
// The QR code itself is tested in JoinQr.test; here only where it shows and what it encodes.
vi.mock('../components/JoinQr', () => ({ default: ({ url }: { url: string }) => <p data-testid="join-qr-stub">{url}</p> }))
vi.mock('../lib/useRoundWords', () => ({ useRoundWords: () => ({ status: 'loading', byParticipant: {}, retry: () => {} }) }))

import { resetAudio } from '../lib/audio'
import { FakeAudioContext } from '../lib/audio/fakeAudioContext'
import Room from './Room'

const p = (id: string, kind: Participant['kind'], ready = false): Participant => ({
  room_code: 'ABCD', id, name: 'N' + id, kind, ready, pens_down: false,
})

function setHook(over: Record<string, unknown>) {
  hook.value = {
    status: 'ready', room: { code: 'ABCD', round: 0 }, participants: [], me: null, phase: 'lobby',
    serverNowMs: () => Date.now(), board: null, join: vi.fn().mockResolvedValue(undefined),
    actions: { setReady: vi.fn().mockResolvedValue(undefined), startAnyway: vi.fn().mockResolvedValue(undefined), removeParticipant: vi.fn().mockResolvedValue(undefined) },
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

let ctx: FakeAudioContext
let Ctor: ReturnType<typeof vi.fn>
beforeEach(() => {
  setHook({})
  localStorage.clear()
  ctx = new FakeAudioContext({ state: 'suspended' })
  Ctor = vi.fn(function () {
    return ctx
  })
  vi.stubGlobal('AudioContext', Ctor)
  resetAudio()
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetAudio()
})

const roundRoom = (now: number) => ({
  code: 'ABCD', round: 1, start_at: new Date(now - 1_000).toISOString(), ends_at: new Date(now + 11_000).toISOString(), results_at: null,
})

describe('Room', () => {
  it('not found: shows the code that was typed and a link home', async () => {
    setHook({ status: 'not-found' })
    renderRoom('/r/peckan-2654')
    expect(screen.getByRole('heading')).toHaveTextContent('No room with the code PECKAN-2654')
    expect(screen.getByLabelText(/room code/i)).toHaveValue('PECKAN-2654')
    await userEvent.click(screen.getByRole('link', { name: /home/i }))
    expect(screen.getByText('HOME PAGE')).toBeInTheDocument()
  })

  it('not found: correct the code in place and it retries straight away', async () => {
    setHook({ status: 'not-found' })
    renderRoom('/r/PECAN-2655')
    expect(hook.code).toBe('PECAN-2655')
    await userEvent.type(screen.getByLabelText(/room code/i), '{Backspace}4')
    expect(hook.code).toBe('PECAN-2654')
    expect(screen.getByRole('heading')).toHaveTextContent('No room with the code PECAN-2654')
    expect(screen.getByLabelText(/room code/i)).toHaveValue('PECAN-2654')
  })

  it('not found: a near miss offers the right word', async () => {
    setHook({ status: 'not-found' })
    renderRoom('/r/PECKAN-2654')
    expect(hook.code).toBe('PECKAN-2654')
    await userEvent.click(screen.getByRole('button', { name: 'Did you mean PECAN?' }))
    expect(hook.code).toBe('PECAN-2654')
    expect(screen.getByRole('heading')).toHaveTextContent('No room with the code PECAN-2654')
  })

  it('not found: retrying the same code looks it up again', async () => {
    setHook({ status: 'not-found' })
    renderRoom('/r/PECAN-2654')
    const before = hook.mounts
    await userEvent.type(screen.getByLabelText(/room code/i), '{Enter}')
    expect(hook.code).toBe('PECAN-2654')
    expect(hook.mounts).toBe(before + 1)
    await userEvent.type(screen.getByLabelText(/room code/i), '{Enter}')
    expect(hook.mounts).toBe(before + 2)
  })

  it('a double-encoded link is decoded before reading the code', () => {
    setHook({ status: 'not-found' })
    renderRoom('/r/pecan%25202654')
    expect(hook.code).toBe('PECAN-2654')
  })

  it('a link with a spoken-style code still finds the room', () => {
    setHook({ status: 'not-found' })
    renderRoom('/r/pecan%202654')
    expect(hook.code).toBe('PECAN-2654')
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
    await userEvent.click(screen.getByLabelText('Type on my phone'))
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

  it('lobby: a household can remove another household with two taps', async () => {
    const me = p('1', 'household'), other = p('2', 'household')
    setHook({ me, participants: [me, other] })
    renderRoom()
    expect(screen.queryByRole('button', { name: 'Remove N1' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove N2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(hook.value.actions.removeParticipant).toHaveBeenCalledWith('2')
  })

  it('lobby: Leave room removes me and goes home', async () => {
    const me = p('1', 'household')
    setHook({ me, participants: [me] })
    renderRoom()
    await userEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(hook.value.actions.removeParticipant).toHaveBeenCalledWith('1')
    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
  })

  it('typist waiting screen has Leave room', async () => {
    const me = p('9', 'typist')
    setHook({ me, participants: [p('1', 'household'), me] })
    renderRoom()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(hook.value.actions.removeParticipant).toHaveBeenCalledWith('9')
    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
  })

  it('results: households can remove, everyone can leave', async () => {
    const h = p('1', 'household'), h2 = p('2', 'household'), t = p('3', 'typist')
    setHook({ me: h, participants: [h, h2, t], phase: 'results' })
    const r = renderRoom()
    await userEvent.click(screen.getByRole('button', { name: 'Remove N2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(hook.value.actions.removeParticipant).toHaveBeenCalledWith('2')
    r.unmount()
    setHook({ me: t, participants: [h, h2, t], phase: 'results' })
    renderRoom()
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Leave room' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(hook.value.actions.removeParticipant).toHaveBeenCalledWith('3')
    expect(await screen.findByText('HOME PAGE')).toBeInTheDocument()
  })

  it('household lobby shows a QR code that opens the join form as a typist', () => {
    const me = p('1', 'household')
    setHook({ me, participants: [me], room: { code: 'PECAN-2654', round: 0, start_at: null, ends_at: null, results_at: null } })
    renderRoom('/r/PECAN-2654')
    expect(screen.getByTestId('join-qr-stub').textContent).toBe(`${location.origin}/r/PECAN-2654?m=type`)
  })

  it('no QR code for typists, in a round, or on the results', async () => {
    const h = p('1', 'household'), t = p('2', 'typist')
    const now = Date.now()
    setHook({ me: t, participants: [h, t] })
    const r1 = renderRoom()
    expect(screen.getByText('Waiting for the game to start')).toBeInTheDocument()
    expect(screen.queryByTestId('join-qr-stub')).toBeNull()
    r1.unmount()
    for (const phase of ['countdown', 'playing', 'locked', 'results']) {
      for (const me of [h, t]) {
        const room = phase === 'results' ? { ...roundRoom(now), results_at: new Date(now).toISOString() } : roundRoom(now)
        setHook({ me, participants: [h, t], phase, room })
        const r = renderRoom()
        if (phase === 'results') await waitFor(() => expect(screen.getByTestId('results')).toBeInTheDocument())
        expect(screen.queryByTestId('join-qr-stub')).toBeNull()
        r.unmount()
      }
    }
  })

  it('typist in lobby sees waiting screen', () => {
    const me = p('9', 'typist')
    setHook({ me, participants: [me] })
    renderRoom()
    expect(screen.getByText('Waiting for the game to start')).toBeInTheDocument()
    expect(screen.getByText(/type the words you find on this phone/i)).toBeInTheDocument()
  })

  it('stubs by phase and kind', async () => {
    const h = p('1', 'household'), t = p('2', 'typist')
    setHook({ me: h, participants: [h, t], phase: 'playing' })
    const r = renderRoom()
    expect(screen.getByTestId('in-game')).toHaveClass('ingame-playing')
    r.unmount()
    setHook({ me: t, participants: [h, t], phase: 'countdown' })
    const r2 = renderRoom()
    expect(screen.getByText('Get ready to type')).toBeInTheDocument()
    r2.unmount()
    setHook({ me: t, participants: [h, t], phase: 'results' })
    renderRoom()
    await waitFor(() => expect(screen.getByTestId('results')).toBeInTheDocument())
  })

  it('lobby Ready and Start anyway unlock audio (a user gesture)', async () => {
    const a = p('1', 'household', true), b = p('2', 'household', true), c = p('3', 'household', false)
    setHook({ me: a, participants: [a, b, c] })
    renderRoom()
    await userEvent.click(screen.getByRole('button', { name: /ready\?/i }))
    expect(Ctor).toHaveBeenCalledTimes(1)
    expect(ctx.resumeCalls).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    expect(ctx.resumeCalls).toBe(1) // already running
    expect(Ctor).toHaveBeenCalledTimes(1)
  })

  it('results Ready and Start anyway unlock audio', async () => {
    const a = p('1', 'household', true), b = p('2', 'household', true), c = p('3', 'household', false)
    setHook({ me: a, participants: [a, b, c], phase: 'results', room: { ...roundRoom(Date.now()), results_at: new Date().toISOString() } })
    renderRoom()
    await userEvent.click(screen.getByRole('button', { name: 'Start anyway' }))
    expect(Ctor).toHaveBeenCalledTimes(1)
    expect(ctx.resumeCalls).toBe(1)
    expect(screen.queryByRole('button', { name: /enable sound/i })).toBeNull()
  })

  it('a typist device never creates an audio context, in any phase', async () => {
    const h = p('1', 'household'), t = p('2', 'typist')
    const now = Date.now()
    for (const phase of ['lobby', 'countdown', 'playing', 'locked', 'results']) {
      setHook({ me: t, participants: [h, t], phase, room: roundRoom(now) })
      const r = renderRoom()
      expect(screen.queryByRole('button', { name: /enable sound/i })).toBeNull()
      r.unmount()
    }
    expect(Ctor).not.toHaveBeenCalled()
  })

  it('a household in a round with locked audio sees the enable prompt', () => {
    const h = p('1', 'household')
    setHook({ me: h, participants: [h], phase: 'playing', room: roundRoom(Date.now()) })
    renderRoom()
    expect(screen.getByRole('button', { name: /tap to enable sound/i })).toBeInTheDocument()
  })
})
