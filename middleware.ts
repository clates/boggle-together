// Vercel Routing Middleware: room links get room-specific preview tags (see src/lib/share.ts). Link
// crawlers do not run JavaScript, so the tags have to be in the HTML the server sends. People get the
// same page with different <head> tags; if anything goes wrong, the request carries on untouched.
import { next } from '@vercel/functions'
import { injectShareMeta, shareMeta, shareableCode } from './src/lib/share.js'

export const config = { matcher: '/r/:code' }

export default async function middleware(request: Request) {
  const url = new URL(request.url)
  const code = shareableCode(url.pathname.slice('/r/'.length))
  if (!code) return next()
  try {
    // Pass on what lets the request through Deployment Protection on previews, and never follow a
    // redirect (that would be the login page, not the app).
    const headers = new Headers()
    for (const name of ['cookie', 'x-vercel-protection-bypass']) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }
    const page = await fetch(new URL('/index.html', url), { headers, redirect: 'manual' })
    if (page.status !== 200) return next()
    const shell = await page.text()
    if (!shell.includes('<!-- share:start -->')) return next()
    const html = injectShareMeta(shell, shareMeta(url.origin, code))
    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, must-revalidate' },
    })
  } catch {
    return next()
  }
}
