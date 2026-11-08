import { describe, it, expect } from 'vitest'
import { drainColor, drainEdge, LOW_AT } from './drain'
import { oklchToHex } from './oklch'

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
// WCAG relative luminance, enough to say "darker"
const lum = (hex: string) =>
  rgb(hex)
    .map((v) => v / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0)
const near = (hex: string, expected: string, tol = 3) => rgb(hex).every((v, i) => Math.abs(v - rgb(expected)[i]) <= tol)

describe('drainColor', () => {
  it('hits the OKLCH keyframes as plain hex: green, sunflower, vermilion', () => {
    expect(drainColor(1)).toBe('#42d0a0')
    expect(drainColor(0.5)).toBe('#f9d047')
    expect(drainColor(0.15)).toBe('#d74a21')
    expect(drainColor(0)).toBe('#d74a21')
  })
  it('matches the palette analysis within a few units per channel', () => {
    expect(near(drainColor(1), '#42D0A0')).toBe(true)
    expect(near(drainColor(0.5), '#F9D047')).toBe(true)
    expect(near(drainColor(0), '#D74A21')).toBe(true)
    expect(near(drainColor(0.3), '#EF8400')).toBe(true)
  })
  it('holds the red from 0.15 down to 0', () => {
    expect(drainColor(0.1)).toBe('#d74a21')
    expect(drainColor(0.01)).toBe(drainColor(0.15))
  })
  it('clamps, and treats NaN as 0', () => {
    expect(drainColor(2)).toBe(drainColor(1))
    expect(drainColor(-3)).toBe(drainColor(0))
    expect(drainColor(NaN)).toBe(drainColor(0))
  })
  it('is always a #rrggbb string (no oklch() for older Safari)', () => {
    for (let p = 0; p <= 1; p += 0.05) expect(drainColor(p)).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('drainEdge', () => {
  it('is a darker line of the same colour at every point of the sweep', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      expect(drainEdge(p)).toMatch(/^#[0-9a-f]{6}$/)
      expect(lum(drainEdge(p))).toBeLessThan(lum(drainColor(p)) / 3)
    }
  })
  it('hits exact waterline colours at the keyframes', () => {
    expect(drainEdge(1)).toBe('#006c4e')
    expect(drainEdge(0.5)).toBe('#907401')
    expect(drainEdge(0.15)).toBe('#571000')
    expect(drainEdge(0)).toBe('#571000')
  })
  it('clamps like the fill', () => {
    expect(drainEdge(NaN)).toBe(drainEdge(0))
    expect(drainEdge(5)).toBe(drainEdge(1))
  })
})

describe('LOW_AT', () => {
  it('is the last fifth of the round', () => {
    expect(LOW_AT).toBe(0.2)
  })
})

describe('oklchToHex', () => {
  it('converts in-gamut colours and clamps out-of-gamut chroma instead of clipping channels', () => {
    expect(oklchToHex([1, 0, 0])).toBe('#ffffff')
    expect(oklchToHex([0, 0, 0])).toBe('#000000')
    expect(oklchToHex([0.51, 0.19, 23])).toBe('#ba1c2d')
    expect(oklchToHex([0.9, 0.4, 145])).toMatch(/^#[0-9a-f]{6}$/)
  })
})
