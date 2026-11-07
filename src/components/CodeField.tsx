import { useEffect, useId, useLayoutEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { editCode, isComplete, isKnownWord, normalizeCode, suggestWord } from '../lib/roomCode'

const FORMAT_HINT = 'Room codes are a word and four numbers, like PECAN-2654.'

/**
 * The one room-code input. Normalizes as you type (PECAN-2654) and calls onGo as soon as the code is
 * complete, once per code. An unknown word close to a real one asks "Did you mean ...?" instead.
 */
export default function CodeField({
  label,
  initial = '',
  onGo,
  autoFocus = false,
}: {
  label: string
  initial?: string
  onGo: (code: string) => void
  autoFocus?: boolean
}) {
  const [value, setValue] = useState(() => normalizeCode(initial))
  const [hint, setHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const caretRef = useRef<number | null>(null)
  const goneRef = useRef<string | null>(null)
  const hintId = useId()

  const word = value.split('-')[0]
  const suggestion = isComplete(value) && !isKnownWord(word) ? suggestWord(word) : null
  const target = suggestion ? `${suggestion}-${value.split('-')[1]}` : value

  useLayoutEffect(() => {
    const el = inputRef.current
    if (el && caretRef.current !== null && document.activeElement === el) el.setSelectionRange(caretRef.current, caretRef.current)
    caretRef.current = null
  }, [value])

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  function go(code: string) {
    if (goneRef.current === code) return
    goneRef.current = code
    onGo(code)
  }

  function change(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const inputType = (e.nativeEvent as InputEvent).inputType ?? ''
    const next = editCode(value, raw, e.target.selectionStart ?? raw.length, inputType)
    caretRef.current = next.caret
    // React skips the re-render when the value is unchanged; put back what the browser changed.
    if (next.value === value) {
      e.target.value = value
      e.target.setSelectionRange(next.caret, next.caret)
    }
    setValue(next.value)
    setHint(next.value === '' && /\d/.test(raw) ? 'Start with the word, then the four numbers.' : null)
    if (isComplete(next.value)) {
      // A real word goes at once. Anything else only when typed at the end (the last digit), so
      // editing the middle of a complete code never jumps away on a half-fixed word.
      const w = next.value.split('-')[0]
      const typedAtEnd = raw.length >= value.length && next.caret === next.value.length
      if (isKnownWord(w) || (typedAtEnd && !suggestWord(w))) go(next.value)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (isComplete(value)) go(target)
    else setHint(FORMAT_HINT)
  }

  function accept() {
    setValue(target)
    go(target)
  }

  return (
    <form className="code-form" onSubmit={submit}>
      <label>
        {label}
        <input
          ref={inputRef}
          className="code-input"
          type="text"
          value={value}
          onChange={change}
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-describedby={hintId}
        />
      </label>
      <div id={hintId} aria-live="polite" className="code-help">
        {suggestion ? (
          <button type="button" className="suggestion" onClick={accept}>
            Did you mean {suggestion}?
          </button>
        ) : hint ? (
          <p className="muted">{hint}</p>
        ) : null}
      </div>
    </form>
  )
}
