// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { assertLocalApiUrl, assertLocalDbUrl } from './guards'

describe('e2e safety guards', () => {
  it('accepts only the local database', () => {
    expect(() => assertLocalDbUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).not.toThrow()
    expect(() => assertLocalDbUrl('postgresql://postgres:pw@db.abc.supabase.co:5432/postgres')).toThrow(/Refusing/)
    expect(() => assertLocalDbUrl('postgresql://postgres:postgres@127.0.0.1:5432/postgres')).toThrow(/Refusing/)
  })

  it('rejects a query string or host= that libpq would use to connect elsewhere', () => {
    expect(() => assertLocalDbUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=db.abc.supabase.co')).toThrow(/Refusing/)
    expect(() => assertLocalDbUrl('postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=require')).toThrow(/Refusing/)
    expect(() => assertLocalDbUrl('postgresql://postgres:postgres@127.0.0.1:54322/host=evil')).toThrow(/Refusing/)
    expect(() => assertLocalDbUrl('host=db.abc.supabase.co port=5432')).toThrow(/Refusing/)
  })

  it('accepts only a local API URL for the browser app (or none: the app then uses the local stack)', () => {
    expect(() => assertLocalApiUrl(undefined)).not.toThrow()
    expect(() => assertLocalApiUrl('http://127.0.0.1:54321')).not.toThrow()
    expect(() => assertLocalApiUrl('http://localhost:54321')).not.toThrow()
    expect(() => assertLocalApiUrl('https://abc.supabase.co')).toThrow(/VITE_SUPABASE_URL/)
    expect(() => assertLocalApiUrl('http://127.0.0.1.evil.example')).toThrow(/VITE_SUPABASE_URL/)
    expect(() => assertLocalApiUrl('not a url')).toThrow(/VITE_SUPABASE_URL/)
  })
})
