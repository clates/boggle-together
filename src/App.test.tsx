import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./lib/useRoom', () => ({ useRoom: () => ({ status: 'not-found' }) }))

describe('App', () => {
  it('renders Home buttons at /', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Start a room' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join a room' })).toBeInTheDocument()
  })

  it('renders the room route at /r/:code', () => {
    render(
      <MemoryRouter initialEntries={['/r/ABCD']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText('Room not found')).toBeInTheDocument()
  })
})
