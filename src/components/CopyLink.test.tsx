import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CopyLink from './CopyLink'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'execCommand')
})

describe('CopyLink', () => {
  it('copies the join link and says so in a toast that goes away again', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<CopyLink code="POND-3580" />)
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/r/POND-3580`)
    expect(screen.getByRole('status')).toHaveTextContent('Link copied')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('is an icon with no visible words, labelled for screen readers, and can show the code beside it', () => {
    render(<CopyLink code="POND-3580" showCode />)
    const button = screen.getByRole('button', { name: 'Copy link' })
    expect(button).toHaveTextContent('')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(screen.getByText('POND-3580')).toBeInTheDocument()
  })

  it('uses the old copy command where the clipboard API is missing', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const exec = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    render(<CopyLink code="POND-3580" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    expect(exec).toHaveBeenCalledWith('copy')
    expect(screen.getByRole('status')).toHaveTextContent('Link copied')
  })

  it('tells the truth when copying is not possible', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    Object.defineProperty(document, 'execCommand', { value: vi.fn().mockReturnValue(false), configurable: true })
    render(<CopyLink code="POND-3580" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    })
    expect(screen.getByRole('status')).toHaveTextContent(/Couldn't copy/)
    expect(screen.getByRole('status')).not.toHaveTextContent('Link copied')
  })
})
