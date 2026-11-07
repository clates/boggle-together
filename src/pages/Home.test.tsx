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
  it('joins with trimmed, uppercased code', async () => {
    renderHome()
    await userEvent.type(screen.getByLabelText(/room code/i), '  maple-42 ')
    await userEvent.click(screen.getByRole('button', { name: 'Join a room' }))
    expect(screen.getByText('ROOM PAGE MAPLE-42')).toBeInTheDocument()
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
