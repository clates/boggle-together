import { screen } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it } from 'vitest'
import { boot } from './boot'

describe('boot', () => {
  it('shows "This site is not configured" instead of Loading when production env vars are missing', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    await act(async () => {
      await boot(el, { PROD: true })
    })
    expect(screen.getByRole('heading', { name: 'This site is not configured' })).toBeInTheDocument()
    expect(el.textContent).toMatch(/VITE_SUPABASE_URL/)
    expect(el.textContent).not.toMatch(/Loading/)
    el.remove()
  })
})
