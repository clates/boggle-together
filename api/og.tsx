// GET /api/og?code=ROWAN-8209: the link-preview image for a room (no code, or a code that is not
// shareable, gives the home image). The image depends only on the code, so it caches well.
// Node runtime: Satori lays the card out as SVG and resvg rasterises it to PNG.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { shareableCode } from '../src/lib/share'
import { Card, HEIGHT, WIDTH } from './_card'

// vercel.json includes api/_fonts in this function's bundle
const font = readFileSync(join(process.cwd(), 'api/_fonts/NotoSans-Bold.ttf'))

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
