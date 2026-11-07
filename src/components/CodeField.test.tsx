import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CodeField from './CodeField'

function setup(initial = '') {
  const onGo = vi.fn()
  render(<CodeField label="Room code" initial={initial} onGo={onGo} />)
  const input = screen.getByLabelText('Room code') as HTMLInputElement
  return { onGo, input }
}

describe('CodeField', () => {
  it('is set up for a phone keyboard: letters, no autocorrect, Go key', () => {
    const { input } = setup()
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('autocapitalize', 'characters')
    expect(input).toHaveAttribute('autocorrect', 'off')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')
    expect(input).toHaveAttribute('enterkeyhint', 'go')
  })

  it.each(['pecan 2654', 'pecan2654', 'PECAN-2654', 'pecan - 2654', 'Pecan, 2654'])('typing %j jumps in once as PECAN-2654', async (typed) => {
    const { onGo, input } = setup()
    await userEvent.type(input, typed)
    expect(input).toHaveValue('PECAN-2654')
    expect(onGo).toHaveBeenCalledTimes(1)
    expect(onGo).toHaveBeenCalledWith('PECAN-2654')
  })

  it('shows the hyphen as soon as a digit follows the word, and never goes early', async () => {
    const { onGo, input } = setup()
    await userEvent.type(input, 'pecan2')
    expect(input).toHaveValue('PECAN-2')
    await userEvent.type(input, '65')
    expect(input).toHaveValue('PECAN-265')
    expect(onGo).not.toHaveBeenCalled()
  })

  it('does not go twice: extra keys after a complete code are ignored', async () => {
    const { onGo, input } = setup()
    await userEvent.type(input, 'pecan26549{enter}')
    expect(input).toHaveValue('PECAN-2654')
    expect(onGo).toHaveBeenCalledTimes(1)
  })

  it('pasting an invite link extracts the code and jumps in', async () => {
    const { onGo, input } = setup()
    await userEvent.click(input)
    await userEvent.paste('https://boggle.example/r/pecan-2654')
    expect(input).toHaveValue('PECAN-2654')
    expect(onGo).toHaveBeenCalledExactlyOnceWith('PECAN-2654')
  })

  it('backspace: the auto hyphen goes with the first digit, then letters go one by one', async () => {
    const { input } = setup()
    await userEvent.type(input, 'pecan2')
    await userEvent.keyboard('{Backspace}')
    expect(input).toHaveValue('PECAN')
    await userEvent.keyboard('{Backspace}')
    expect(input).toHaveValue('PECA')
  })

  it('backspace with the caret right after the hyphen removes the last letter', async () => {
    const { input } = setup()
    await userEvent.type(input, 'pecan265')
    input.setSelectionRange(6, 6) // PECAN-|265
    await userEvent.keyboard('{Backspace}')
    expect(input).toHaveValue('PECA-265')
    expect(input.selectionStart).toBe(4)
  })

  it('Enter with an incomplete code does nothing but show a hint', async () => {
    const { onGo, input } = setup()
    await userEvent.type(input, 'pecan 26{enter}')
    expect(onGo).not.toHaveBeenCalled()
    expect(screen.getByText(/a word and four numbers/i)).toBeInTheDocument()
  })

  it('an unknown word near a real one asks "Did you mean" instead of going', async () => {
    const { onGo, input } = setup()
    await userEvent.type(input, 'peckan 2654')
    expect(onGo).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Did you mean PECAN?' }))
    expect(input).toHaveValue('PECAN-2654')
    expect(onGo).toHaveBeenCalledExactlyOnceWith('PECAN-2654')
  })

  it('fixing the word by hand after a suggestion still jumps in', async () => {
    const { onGo, input } = setup()
    await userEvent.type(input, 'peckan 2654')
    input.setSelectionRange(4, 4) // PECK|AN-2654
    await userEvent.keyboard('{Backspace}')
    expect(input).toHaveValue('PECAN-2654')
    expect(onGo).toHaveBeenCalledExactlyOnceWith('PECAN-2654')
    expect(screen.queryByRole('button', { name: /did you mean/i })).toBeNull()
  })

  it('no near match: goes anyway (the room page says not found)', async () => {
    const { onGo, input } = setup()
    await userEvent.type(input, 'zzzzzz 2654')
    expect(onGo).toHaveBeenCalledExactlyOnceWith('ZZZZZZ-2654')
    expect(screen.queryByRole('button', { name: /did you mean/i })).toBeNull()
  })

  it('an old-list word is a real room and goes straight in', async () => {
    const { onGo, input } = setup()
    await userEvent.type(input, 'mahogany 1234')
    expect(onGo).toHaveBeenCalledExactlyOnceWith('MAHOGANY-1234')
  })

  it('a prefilled complete code does not go by itself; editing it does', async () => {
    const { onGo, input } = setup('PECAN-2654')
    expect(input).toHaveValue('PECAN-2654')
    expect(onGo).not.toHaveBeenCalled()
    await userEvent.type(input, '{Backspace}3')
    expect(onGo).toHaveBeenCalledExactlyOnceWith('PECAN-2653')
  })
})
