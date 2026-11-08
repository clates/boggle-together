import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// By default the real library runs; a test can swap in a fake (to see exactly what was encoded) or a failure.
const lib = vi.hoisted(() => ({
  fake: null as null | ((type: number, level: string) => unknown),
  calls: [] as { type: number; level: string; data: string[] }[],
}))
vi.mock('qrcode-generator', async (importOriginal) => {
  const real = ((await importOriginal()) as { default: (t: number, l: string) => unknown }).default
  return {
    default: (type: number, level: string) => (lib.fake ? lib.fake(type, level) : real(type, level)),
  }
})

import JoinQr from './JoinQr'

const URL = 'http://localhost:3000/r/PECAN-2654?m=type'

function fakeQr(size: number) {
  return (type: number, level: string) => {
    const call = { type, level, data: [] as string[] }
    lib.calls.push(call)
    return {
      addData: (d: string) => call.data.push(d),
      make: () => {},
      getModuleCount: () => size,
      isDark: (r: number, c: number) => r === c,
    }
  }
}

afterEach(() => {
  lib.fake = null
  lib.calls = []
})

describe('JoinQr', () => {
  it('encodes exactly the given URL at error level M, with a 4-module white quiet zone', async () => {
    lib.fake = fakeQr(21)
    render(<JoinQr url={URL} />)
    const svg = await screen.findByTestId('join-qr')
    expect(svg.tagName.toLowerCase()).toBe('svg')
    expect(lib.calls).toHaveLength(1)
    expect(lib.calls[0].data).toEqual([URL])
    expect(lib.calls[0].level).toBe('M')
    expect(svg.getAttribute('viewBox')).toBe('0 0 29 29')
    const bg = svg.querySelector('rect')!
    expect(bg).toHaveClass('qr-light')
    expect(svg.querySelector('path')).toHaveClass('qr-dark')
    expect(bg.getAttribute('width')).toBe('29')
    // the diagonal: one dark module per row, offset by the quiet zone
    const d = svg.querySelector('path')!.getAttribute('d')!
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true)
    expect(d.match(/M/g)).toHaveLength(21)
  })

  it('has a caption and an accessible name', async () => {
    lib.fake = fakeQr(21)
    render(<JoinQr url={URL} />)
    expect(await screen.findByRole('img', { name: /QR code/i })).toBeInTheDocument()
    expect(screen.getByText('Scan with a phone to type words for this game')).toBeInTheDocument()
  })

  it('works with the real library (module count fits a version, quiet zone included)', async () => {
    render(<JoinQr url={URL} />)
    const svg = await screen.findByTestId('join-qr')
    const size = Number(svg.getAttribute('viewBox')!.split(' ')[2])
    expect((size - 8 - 21) % 4).toBe(0)
    expect(size).toBeGreaterThanOrEqual(29)
  })

  it('shows nothing when generation throws', async () => {
    let attempts = 0
    lib.fake = () => {
      attempts++
      throw new Error('code length overflow')
    }
    const { container } = render(<JoinQr url={URL} />)
    await waitFor(() => expect(attempts).toBe(1))
    await waitFor(() => expect(container.innerHTML).toBe(''))
    await new Promise((r) => setTimeout(r, 20))
    expect(container.innerHTML).toBe('')
  })

  it('while the library loads, holds the same-size space but shows nothing', async () => {
    lib.fake = fakeQr(21)
    const { container } = render(<JoinQr url={URL} />)
    const box = container.querySelector('.join-qr')!
    expect(box).toHaveClass('join-qr-pending')
    expect(box).toHaveAttribute('aria-hidden', 'true')
    expect(box.querySelector('svg')).toBeNull()
    expect(box.querySelector('.join-qr-code')).not.toBeNull() // the 200 px slot
    expect(screen.queryByTestId('join-qr')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    // then the same box fills in
    await screen.findByTestId('join-qr')
    expect(container.querySelector('.join-qr')).not.toHaveClass('join-qr-pending')
  })
})
