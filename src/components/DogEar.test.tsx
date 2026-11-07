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
})
