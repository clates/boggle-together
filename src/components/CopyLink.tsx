import { useEffect, useRef, useState } from 'react'
import { copyText } from '../lib/copyText'

const TOAST_MS = 2200

/** The link that joins this room. */
export const roomLink = (code: string) => `${location.origin}/r/${code}`

/**
 * A bare copy icon (no words, no button chrome; labelled "Copy link" for screen readers) that copies the room's
 * join link, with a small toast ("Link copied") so a tap is never silent. `showCode` puts the room code before it.
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
      {showCode && <span className="copy-link-code">{code}</span>}
      <button type="button" className={`copy-link ${className}`.trim()} aria-label="Copy link" title="Copy link" onClick={() => void copy()}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <rect x="8.5" y="8.5" width="11" height="12" rx="2" />
          <path d="M15.5 5.5v-.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h.5" />
        </svg>
      </button>
      <div className="toast" role="status" aria-live="polite">
        {toast}
      </div>
    </>
  )
}
