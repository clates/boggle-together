// "Remember me" for the join form: the last name and mode, per browser. Storage can be missing,
// full or blocked (private windows, strict settings); every access is guarded and failures are silent.

export type Mode = 'household' | 'typist'

const NAME = 'boggle.name'
const MODE = 'boggle.mode'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* not remembered this time */
  }
}

export const loadName = () => read(NAME) ?? ''
export const saveName = (name: string) => write(NAME, name)

export function loadMode(): Mode | null {
  const m = read(MODE)
  return m === 'household' || m === 'typist' ? m : null
}
export const saveMode = (mode: Mode) => write(MODE, mode)
