import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { drainColor, drainEdge } from '../lib/drain'
import TimerFill from './TimerFill'

describe('TimerFill', () => {
  it('is as tall as the time left, carries the drain colour and waterline, and is hidden from screen readers', () => {
    render(<TimerFill progress={0.25} />)
    const fill = screen.getByTestId('fill')
    expect(fill.style.height).toBe('25%')
    expect(fill.style.getPropertyValue('--fill')).toBe(drainColor(0.25))
    expect(fill.style.getPropertyValue('--fill-edge')).toBe(drainEdge(0.25))
    expect(fill).toHaveAttribute('aria-hidden', 'true')
    expect(fill).toHaveClass('fill')
    expect(fill).not.toHaveClass('fill-low')
  })

  it('gets the low-time stripes only at or below 20% left', () => {
    const { rerender } = render(<TimerFill progress={0.21} />)
    expect(screen.getByTestId('fill')).not.toHaveClass('fill-low')
    rerender(<TimerFill progress={0.2} />)
    expect(screen.getByTestId('fill')).toHaveClass('fill-low')
    rerender(<TimerFill progress={0.05} />)
    expect(screen.getByTestId('fill')).toHaveClass('fill', 'fill-low')
  })

  it('renders nothing when no time is left', () => {
    const { container } = render(<TimerFill progress={0} />)
    expect(container.innerHTML).toBe('')
  })
})
