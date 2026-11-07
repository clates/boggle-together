import { describe, expect, it, vi } from 'vitest'
import { keepaliveFetch, makeClient } from './supabase'

const ok = () => new Response(JSON.stringify(null), { status: 200, headers: { 'content-type': 'application/json' } })

describe('keepaliveFetch', () => {
  it('adds keepalive to RPC POSTs only', async () => {
    const base = vi.fn(async () => ok())
    const f = keepaliveFetch(base as unknown as typeof fetch)
    await f('http://x/rest/v1/rpc/submit_word', { method: 'POST', body: '{}' })
    await f('http://x/rest/v1/rooms?code=eq.A', { method: 'GET' })
    await f('http://x/auth/v1/token', { method: 'POST' })
    expect((base.mock.calls[0] as unknown[])[1]).toMatchObject({ method: 'POST', keepalive: true })
    expect((base.mock.calls[1] as unknown[])[1]).not.toHaveProperty('keepalive')
    expect((base.mock.calls[2] as unknown[])[1]).not.toHaveProperty('keepalive')
  })

  it('is wired into the client: a submit_word RPC goes out with keepalive', async () => {
    const base = vi.fn(async () => ok())
    const client = makeClient('http://127.0.0.1:54321', 'anon', base as unknown as typeof fetch)
    await client.rpc('submit_word', { p_code: 'A', p_word: 'CAT' })
    const rpcCall = base.mock.calls.find((c) => String((c as unknown[])[0]).includes('/rest/v1/rpc/submit_word')) as unknown[]
    expect(rpcCall).toBeTruthy()
    expect(rpcCall[1]).toMatchObject({ method: 'POST', keepalive: true })
  })
})
