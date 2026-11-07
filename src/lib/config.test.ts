import { describe, expect, it } from 'vitest'
import { configProblem, readConfig } from './config'

describe('config', () => {
  it('production with both values is fine', () => {
    const env = { PROD: true, VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' }
    expect(configProblem(env)).toBeNull()
    expect(readConfig(env)).toEqual({ url: 'https://x.supabase.co', key: 'k' })
  })

  it('production names whichever value is missing, and readConfig throws', () => {
    expect(configProblem({ PROD: true, VITE_SUPABASE_ANON_KEY: 'k' })).toMatch(/VITE_SUPABASE_URL/)
    expect(configProblem({ PROD: true, VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: '' })).toMatch(/VITE_SUPABASE_ANON_KEY/)
    expect(() => readConfig({ PROD: true })).toThrow(/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/)
  })

  it('dev and test fall back to the local stack', () => {
    expect(configProblem({ PROD: false })).toBeNull()
    expect(readConfig({ PROD: false })).toEqual({ url: 'http://127.0.0.1:54321', key: 'missing-anon-key' })
  })
})
