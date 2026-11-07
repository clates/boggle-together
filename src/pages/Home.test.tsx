import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({ supabase: { rpc }, ensureSession: vi.fn().mockResolvedValue('u1') }))

import Home from './Home'

function RoomPage() {
  return <p>ROOM PAGE {useParams().code}</p>
}

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/r/:code" element={<RoomPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => rpc.mockReset())

describe('Home', () => {
  it('jumps straight into the room once a spoken code is typed', async () => {
    renderHome()
    await userEvent.type(screen.getByLabelText(/room code/i), 'pecan 2654')
    expect(screen.getByText('ROOM PAGE PECAN-2654')).toBeInTheDocument()
  })

  it('stays on the home screen with a partial code', async () => {
    renderHome()
    await userEvent.type(screen.getByLabelText(/room code/i), 'pecan 265{enter}')
    expect(screen.queryByText(/ROOM PAGE/)).toBeNull()
    expect(screen.getByText(/a word and four numbers/i)).toBeInTheDocument()
  })

  it('explains the app in a sentence or two near Start a room', () => {
    renderHome()
    const intro = screen.getByTestId('home-intro')
    expect(intro).toHaveTextContent(/paper/i)
    expect(intro).toHaveTextContent(/voice or video call/i)
    expect(intro.textContent!.trim().split(/\s+/).length).toBeLessThanOrEqual(35)
  })

  it('Start a room creates and navigates', async () => {
    rpc.mockResolvedValue({ data: 'MAPLE-42', error: null })
    renderHome()
    await userEvent.click(screen.getByRole('button', { name: 'Start a room' }))
    expect(rpc).toHaveBeenCalledWith('create_room')
    expect(await screen.findByText('ROOM PAGE MAPLE-42')).toBeInTheDocument()
  })

  it('shows the error inline when create fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Too many rooms' } })
    renderHome()
    await userEvent.click(screen.getByRole('button', { name: 'Start a room' }))
    expect(await screen.findByText('Too many rooms')).toBeInTheDocument()
  })
})
