import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'

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

  it('renders a placeholder at /r/:code', () => {
    render(
      <MemoryRouter initialEntries={['/r/ABCD']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByText(/ABCD/)).toBeInTheDocument()
  })
})
