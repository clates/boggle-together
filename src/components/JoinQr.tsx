import { useEffect, useState } from 'react'

const QUIET = 4 // modules of white margin, as the QR spec asks

type Matrix = { size: number; path: string }

// Path of the dark modules, offset by the quiet zone: one 1x1 square each.
function toMatrix(qr: { getModuleCount(): number; isDark(r: number, c: number): boolean }): Matrix {
  const n = qr.getModuleCount()
  let path = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + QUIET} ${r + QUIET}h1v1h-1z`
  return { size: n + 2 * QUIET, path }
}

// A QR code for a phone at the same table. The library is loaded only when this is shown,
// so it never weighs on the home page. While it loads, the box keeps its size (invisible) so
// the lobby does not jump when the code appears; if it fails, nothing is shown.
export default function JoinQr({ url }: { url: string }) {
  const [matrix, setMatrix] = useState<Matrix | null | 'failed'>(null)

  useEffect(() => {
    let cancelled = false
    setMatrix(null)
    import('qrcode-generator')
      .then(({ default: qrcode }) => {
        const qr = qrcode(0, 'M')
        qr.addData(url)
        qr.make()
        return toMatrix(qr)
      })
      .then(
        (m) => !cancelled && setMatrix(m),
        () => !cancelled && setMatrix('failed'),
      )
    return () => {
      cancelled = true
    }
  }, [url])

  if (matrix === 'failed') return null
  const caption = <figcaption>Scan with a phone to type words for this game</figcaption>
  if (!matrix)
    return (
      <figure className="join-qr join-qr-pending" aria-hidden="true">
        <div className="join-qr-code" />
        {caption}
      </figure>
    )
  return (
    <figure className="join-qr">
      <div className="join-qr-code">
        <svg
          data-testid="join-qr"
          role="img"
          aria-label="QR code to join this room on a phone"
          viewBox={`0 0 ${matrix.size} ${matrix.size}`}
          shapeRendering="crispEdges"
        >
          {/* colours come from the --qr-light / --qr-dark tokens (index.css) */}
          <rect className="qr-light" width={matrix.size} height={matrix.size} />
          <path className="qr-dark" d={matrix.path} />
        </svg>
      </div>
      {caption}
    </figure>
  )
}
