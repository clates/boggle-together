import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { describe, expect, it } from 'vitest'
import HouseholdList from './HouseholdList'
import type { Participant } from '../lib/useRoom'

const p = (id: string, name: string, kind: Participant['kind'], ready: boolean): Participant => ({
  room_code: 'X', id, name, kind, ready, pens_down: false,
})

describe('HouseholdList', () => {
  it('shows check for ready, hourglass for not, and typists by name below', () => {
    render(
      <HouseholdList
        participants={[p('1', 'Smiths', 'household', true), p('2', 'Joneses', 'household', false), p('3', 'Tina', 'typist', false)]}
      />,
    )
    expect(screen.getByText('Smiths').closest('li')).toHaveTextContent('✅')
    expect(screen.getByText('Joneses').closest('li')).toHaveTextContent('⏳')
    expect(screen.getByText('Tina').closest('li')).toHaveTextContent('⌨️')
    expect(screen.getByText('Tina').closest('li')).not.toHaveTextContent('⏳')
    expect(screen.getByText('Typing on a phone')).toBeInTheDocument()
  })

  it('names several phone typists', () => {
    render(<HouseholdList participants={[p('1', 'Smiths', 'household', true), p('2', 'Tina', 'typist', false), p('3', 'Jo', 'typist', false)]} />)
    expect(screen.getByText('Typing on phones')).toBeInTheDocument()
    expect(screen.getByText('Tina')).toBeInTheDocument()
    expect(screen.getByText('Jo')).toBeInTheDocument()
  })

  it('has no Remove buttons unless asked', () => {
    render(<HouseholdList participants={[p('1', 'Smiths', 'household', true), p('2', 'Joneses', 'household', false)]} />)
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('two-tap Remove for other households, none for me', async () => {
    const onRemove = vi.fn()
    render(
      <HouseholdList
        participants={[p('1', 'Smiths', 'household', true), p('2', 'Joneses', 'household', false), p('3', 'Tina', 'typist', false)]}
        meId="1"
        onRemove={onRemove}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Remove Smiths' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Joneses' }))
    expect(screen.getByText('Remove Joneses?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove Joneses?')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Remove Joneses' }))
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(onRemove).toHaveBeenCalledWith('2')
  })
})
