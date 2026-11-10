// GET /api/og?code=ROWAN-8209: the link-preview image for a room (no code, or a code that is not
// shareable, gives the home image). The image depends only on the code, so it caches well.
import { ImageResponse } from '@vercel/og'
import { shareableCode } from '../src/lib/share'
import { Card, HEIGHT, WIDTH } from './_card'

export const config = { runtime: 'edge' }

const font = fetch(new URL('./_fonts/NotoSans-Bold.ttf', import.meta.url)).then((r) => r.arrayBuffer())

export default async function handler(request: Request) {
  const code = shareableCode(new URL(request.url).searchParams.get('code'))
  return new ImageResponse(<Card code={code} />, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: 'Noto Sans', data: await font, weight: 700, style: 'normal' }],
    headers: { 'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400' },
  })
}
