import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { drainColor } from '../lib/drain'
import TimerFill from './TimerFill'

function css(color: string) {
  const probe = document.createElement('div')
  probe.style.background = color
  return probe.style.background
}

describe('TimerFill', () => {
  it('is as tall as the time left, in the drain color, and hidden from screen readers', () => {
    render(<TimerFill progress={0.25} />)
    const fill = screen.getByTestId('fill')
    expect(fill.style.height).toBe('25%')
    expect(fill.style.background).toBe(css(drainColor(0.25)))
    expect(fill).toHaveAttribute('aria-hidden', 'true')
    expect(fill).toHaveClass('fill')
  })

  it('renders nothing when no time is left', () => {
    const { container } = render(<TimerFill progress={0} />)
    expect(container.innerHTML).toBe('')
  })
})
