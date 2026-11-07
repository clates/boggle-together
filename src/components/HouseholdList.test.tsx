import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HouseholdList from './HouseholdList'
import type { Participant } from '../lib/useRoom'

const p = (id: string, name: string, kind: Participant['kind'], ready: boolean): Participant => ({
  room_code: 'X', id, name, kind, ready, pens_down: false,
})

describe('HouseholdList', () => {
  it('shows check for ready, hourglass for not, omits typists', () => {
    render(
      <HouseholdList
        participants={[p('1', 'Smiths', 'household', true), p('2', 'Joneses', 'household', false), p('3', 'Tina', 'typist', false)]}
      />,
    )
    expect(screen.getByText('Smiths').closest('li')).toHaveTextContent('✅')
    expect(screen.getByText('Joneses').closest('li')).toHaveTextContent('⏳')
    expect(screen.queryByText('Tina')).not.toBeInTheDocument()
    expect(screen.getByText('1 typing their words')).toBeInTheDocument()
  })
})
