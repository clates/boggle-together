import { afterEach, describe, expect, it, vi } from 'vitest'
import { MUTE_KEY, readMuted, writeMuted } from './mutePref'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('mute preference', () => {
  it('uses the boggle.muted key', () => {
    expect(MUTE_KEY).toBe('boggle.muted')
  })

  it('defaults to sound on', () => {
    expect(readMuted()).toBe(false)
  })

  it('round-trips through localStorage', () => {
    writeMuted(true)
    expect(localStorage.getItem('boggle.muted')).toBe('1')
    expect(readMuted()).toBe(true)
    writeMuted(false)
    expect(localStorage.getItem('boggle.muted')).toBe('0')
    expect(readMuted()).toBe(false)
  })

  it('survives storage throwing on read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(readMuted()).toBe(false)
    expect(() => writeMuted(true)).not.toThrow()
  })

  it('survives localStorage itself being inaccessible', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readMuted()).toBe(false)
    expect(() => writeMuted(true)).not.toThrow()
  })
})
