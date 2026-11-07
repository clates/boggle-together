import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadMode, loadName, saveMode, saveName } from './remember'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('remember me', () => {
  it('round-trips name and mode under boggle.name / boggle.mode', () => {
    saveName('Smiths')
    saveMode('typist')
    expect(localStorage.getItem('boggle.name')).toBe('Smiths')
    expect(localStorage.getItem('boggle.mode')).toBe('typist')
    expect(loadName()).toBe('Smiths')
    expect(loadMode()).toBe('typist')
  })

  it('empty storage gives nothing', () => {
    expect(loadName()).toBe('')
    expect(loadMode()).toBeNull()
  })

  it('ignores a mode it does not know', () => {
    localStorage.setItem('boggle.mode', 'spectator')
    expect(loadMode()).toBeNull()
  })

  it('never throws when storage does', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveName('X')).not.toThrow()
    expect(() => saveMode('household')).not.toThrow()
    expect(loadName()).toBe('')
    expect(loadMode()).toBeNull()
  })

  it('never throws when localStorage itself is off limits', () => {
    const desc = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('SecurityError') } })
    try {
      expect(loadName()).toBe('')
      expect(loadMode()).toBeNull()
      expect(() => saveName('X')).not.toThrow()
    } finally {
      Object.defineProperty(window, 'localStorage', desc)
    }
  })
})
