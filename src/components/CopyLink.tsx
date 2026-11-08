import { useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/copyText'

const TOAST_MS = 2200

/** The link that joins this room. */
export const roomLink = (code: string) => `${location.origin}/r/${code}`

/**
 * A button that copies the room's join link, with a small toast ("Link copied") so a tap is never
 * silent. `showCode` turns it into a discreet tag: the room code with "copy link" beside it.
 */
export default function CopyLink({ code, showCode = false, className = '' }: { code: string; showCode?: boolean; className?: string }) {
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    const ok = await copyText(roomLink(code))
    setToast(ok ? 'Link copied' : "Couldn't copy. Select the link and copy it by hand.")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }

  return (
    <>
      <button type="button" className={`copy-link ${showCode ? 'subtle copy-link-tag' : ''} ${className}`.trim()} onClick={() => void copy()}>
        {showCode ? (
          <>
            <span className="copy-link-code">{code}</span> <span className="copy-link-action">Copy link</span>
          </>
        ) : (
          'Copy link'
        )}
      </button>
      <div className="toast" role="status" aria-live="polite">
        {toast}
      </div>
    </>
  )
}
