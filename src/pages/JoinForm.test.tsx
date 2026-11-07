import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JoinForm from './JoinForm'

function renderForm(path = '/r/PECAN-2654') {
  const onJoin = vi.fn().mockResolvedValue(undefined)
  render(
    <MemoryRouter initialEntries={[path]}>
      <JoinForm onJoin={onJoin} />
    </MemoryRouter>,
  )
  return onJoin
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('JoinForm', () => {
  it('offers two labelled cards with one line each, Shared screen by default', () => {
    renderForm()
    const shared = screen.getByRole('radio', { name: 'Shared screen' })
    const phone = screen.getByRole('radio', { name: 'Type on my phone' })
    expect(shared).toBeChecked()
    expect(phone).not.toBeChecked()
    expect(shared).toHaveAccessibleDescription(/one device per household/i)
    expect(phone).toHaveAccessibleDescription(/your own phone/i)
    expect(screen.queryByText('Type my words')).toBeNull()
  })

  it('?m=type starts on Type on my phone', () => {
    renderForm('/r/PECAN-2654?m=type')
    expect(screen.getByRole('radio', { name: 'Type on my phone' })).toBeChecked()
  })

  it('remembers the name and mode after joining', async () => {
    const onJoin = renderForm()
    await userEvent.type(screen.getByLabelText(/your name/i), ' Tina ')
    await userEvent.click(screen.getByRole('radio', { name: 'Type on my phone' }))
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(onJoin).toHaveBeenCalledWith('typist', 'Tina')
    expect(localStorage.getItem('boggle.name')).toBe('Tina')
    expect(localStorage.getItem('boggle.mode')).toBe('typist')
  })

  it('prefills the remembered name and mode', async () => {
    localStorage.setItem('boggle.name', 'Grandma')
    localStorage.setItem('boggle.mode', 'typist')
    const onJoin = renderForm()
    expect(screen.getByLabelText(/your name/i)).toHaveValue('Grandma')
    expect(screen.getByRole('radio', { name: 'Type on my phone' })).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(onJoin).toHaveBeenCalledWith('typist', 'Grandma')
  })

  it('?m=type wins over a remembered Shared screen', () => {
    localStorage.setItem('boggle.mode', 'household')
    renderForm('/r/PECAN-2654?m=type')
    expect(screen.getByRole('radio', { name: 'Type on my phone' })).toBeChecked()
  })

  it('works when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const onJoin = renderForm()
    expect(screen.getByLabelText(/your name/i)).toHaveValue('')
    expect(screen.getByRole('radio', { name: 'Shared screen' })).toBeChecked()
    await userEvent.type(screen.getByLabelText(/your name/i), 'Smiths')
    await userEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(onJoin).toHaveBeenCalledWith('household', 'Smiths')
  })
})
