// The 1200x630 link-preview image (rendered by @vercel/og in api/og.tsx). With a code, the room word is
// spelled on tiles like the board's, with the full code and the invitation below; without one, BOGGLE.
import { OG_COLOURS as C, ROOM_DESCRIPTION, SITE_NAME } from '../src/lib/share'

export const WIDTH = 1200
export const HEIGHT = 630

function Tile({ letter, size }: { letter: string; size: number }) {
  return (
    // The lower bevel is the shade showing below the face (Satori paints inset shadows over the border).
    <div
      style={{
        display: 'flex',
        width: size,
        height: size,
        paddingBottom: Math.round(size * 0.09),
        background: C.tileShade,
        border: `${Math.round(size * 0.045)}px solid ${C.tileEdge}`,
        borderRadius: size * 0.14,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          background: C.tileFace,
          color: C.tileInk,
          borderRadius: size * 0.1,
          fontSize: size * 0.6,
          lineHeight: 1,
        }}
      >
        {letter}
      </div>
    </div>
  )
}

/** The card for `code` (already checked by shareableCode), or the home card when null. */
export function Card({ code }: { code: string | null }) {
  const word = code ? code.split('-')[0] : 'BOGGLE'
  const gap = 24
  // Words run 3-8 letters; tiles shrink to keep the row inside the side margins.
  const size = Math.min(170, Math.floor((WIDTH - 160 - gap * (word.length - 1)) / word.length))
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: C.bg,
        color: C.ink,
        fontFamily: 'Noto Sans',
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, color: C.ink2, marginBottom: 44 }}>{SITE_NAME}</div>
      <div style={{ display: 'flex', gap }}>
        {[...word].map((letter, i) => (
          <Tile key={i} letter={letter} size={size} />
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: 64, letterSpacing: code ? 4 : 0, marginTop: 44 }}>
        {code ?? 'Game night, across town'}
      </div>
      <div style={{ display: 'flex', fontSize: 36, color: code ? C.accent : C.ink2, marginTop: 8 }}>
        {code ? ROOM_DESCRIPTION : 'One shared board and timer for every household'}
      </div>
    </div>
  )
}
