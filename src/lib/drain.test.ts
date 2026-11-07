import { describe, it, expect } from 'vitest'
import { drainColor } from './drain'

describe('drainColor', () => {
  it('maps endpoints and midpoint', () => {
    expect(drainColor(1)).toBe('hsl(130 70% 45%)')
    expect(drainColor(0)).toBe('hsl(0 70% 45%)')
    expect(drainColor(0.5)).toBe('hsl(65 70% 45%)')
  })
  it('clamps', () => {
    expect(drainColor(2)).toBe(drainColor(1))
    expect(drainColor(-3)).toBe(drainColor(0))
  })
  it('treats NaN as 0', () => {
    expect(drainColor(NaN)).toBe('hsl(0 70% 45%)')
  })
})
