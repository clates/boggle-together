import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DogEar from './DogEar'

describe('DogEar', () => {
  it('is closed until the tab is tapped, then shows the code and rotate', () => {
    const onRotate = vi.fn()
    render(<DogEar code="WXYZ" onRotate={onRotate} />)
    expect(screen.queryByText('WXYZ')).not.toBeInTheDocument()
    const tab = screen.getByRole('button', { name: /menu/i })
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(tab)
    expect(tab).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('WXYZ')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /rotate/i }))
    expect(onRotate).toHaveBeenCalledTimes(1)
    fireEvent.click(tab)
    expect(screen.queryByText('WXYZ')).not.toBeInTheDocument()
  })

  it('shows the Sound toggle with its state and calls onToggle', () => {
    const onToggle = vi.fn()
    const { rerender } = render(<DogEar code="WXYZ" onRotate={() => {}} sound={{ muted: false, onToggle }} />)
    fireEvent.click(screen.getByRole('button', { name: /menu/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Sound: on' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<DogEar code="WXYZ" onRotate={() => {}} sound={{ muted: true, onToggle }} />)
    expect(screen.getByRole('button', { name: 'Sound: off' })).toBeInTheDocument()
  })

  it('has no Sound toggle when no sound control is given', () => {
    render(<DogEar code="WXYZ" onRotate={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /menu/i }))
    expect(screen.queryByRole('button', { name: /sound/i })).toBeNull()
  })
})
