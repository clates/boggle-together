// GET /api/og?code=ROWAN-8209: the link-preview image for a room (no code, or a code that is not
// shareable, gives the home image). The image depends only on the code, so it caches well.
// Node runtime: Satori lays the card out as SVG and resvg rasterises it to PNG.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { OG_COLOURS as C, ROOM_DESCRIPTION, SITE_NAME, shareableCode } from '../src/lib/share.js'

// The card: with a code, the room word is spelled on tiles like the board's, with the full code and the
// invitation below; without one, BOGGLE. (One file: Vercel leaves api/_* files out of the deployment.)
const WIDTH = 1200
const HEIGHT = 630

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
function Card({ code }: { code: string | null }) {
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

// vercel.json includes fonts/ in this function's bundle
const font = readFileSync(join(process.cwd(), 'fonts/NotoSans-Bold.ttf'))

export async function GET(request: Request): Promise<Response> {
  const code = shareableCode(new URL(request.url).searchParams.get('code'))
  const svg = await satori(<Card code={code} />, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: 'Noto Sans', data: font, weight: 700, style: 'normal' }],
  })
  const png = new Resvg(svg).render().asPng()
  return new Response(new Uint8Array(png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    },
  })
}
