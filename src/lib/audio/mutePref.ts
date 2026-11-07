// The per-device mute switch, remembered in localStorage. Storage may be missing or throw
// (private mode, blocked site data): then sound is on and nothing is remembered.

export const MUTE_KEY = 'boggle.muted'

export function readMuted(): boolean {
  try {
    const v = window.localStorage.getItem(MUTE_KEY)
    return v === '1' || v === 'true'
  } catch {
    return false
  }
}

export function writeMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    /* not remembered; fine */
  }
}
