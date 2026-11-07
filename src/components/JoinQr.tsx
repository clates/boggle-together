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
// so it never weighs on the home page. Nothing is shown while it loads or if it fails.
export default function JoinQr({ url }: { url: string }) {
  const [matrix, setMatrix] = useState<Matrix | null>(null)

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
        () => {},
      )
    return () => {
      cancelled = true
    }
  }, [url])

  if (!matrix) return null
  return (
    <figure className="join-qr">
      <svg
        data-testid="join-qr"
        role="img"
        aria-label="QR code to join this room on a phone"
        viewBox={`0 0 ${matrix.size} ${matrix.size}`}
        shapeRendering="crispEdges"
      >
        <rect width={matrix.size} height={matrix.size} fill="#fff" />
        <path d={matrix.path} fill="#111" />
      </svg>
      <figcaption>Scan with a phone to type words for this game</figcaption>
    </figure>
  )
}
