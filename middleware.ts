// Vercel Routing Middleware: room links get room-specific preview tags (see src/lib/share.ts). Link
// crawlers do not run JavaScript, so the tags have to be in the HTML the server sends. People get the
// same page with different <head> tags; if anything goes wrong, the request carries on untouched.
import { next } from '@vercel/functions'
import { injectShareMeta, shareMeta, shareableCode } from './src/lib/share'

export const config = { matcher: '/r/:code' }

export default async function middleware(request: Request) {
  const url = new URL(request.url)
  const code = shareableCode(url.pathname.slice('/r/'.length))
  if (!code) return next()
  try {
    const page = await fetch(new URL('/index.html', url))
    if (!page.ok) return next()
    const html = injectShareMeta(await page.text(), shareMeta(url.origin, code))
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' },
    })
  } catch {
    return next()
  }
}
