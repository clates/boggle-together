import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Board from './Board'

const L = 'ABCDEFGHIJKLMNOP'.split('')

describe('Board', () => {
  it('renders 16 tiles', () => {
    render(<Board letters={L} rotation={0} />)
    expect(screen.getAllByTestId('tile')).toHaveLength(16)
  })
  it('shows Qu on a Qu tile', () => {
    render(<Board letters={['Qu', ...L.slice(1)]} rotation={0} />)
    expect(screen.getByText('Qu')).toBeInTheDocument()
  })
  it('applies a 90 degree rotation', () => {
    render(<Board letters={L} rotation={90} />)
    expect(screen.getByTestId('board').parentElement!.style.transform).toBe('rotate(90deg)')
  })
})
