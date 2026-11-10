// Link previews (Discord, Slack, iMessage...). Their crawlers do not run JavaScript, so the tags are
// written into the HTML: index.html carries the home card, and middleware.ts swaps in a room card on
// /r/:code. The image comes from api/og.tsx. Only the code from the URL is used, never room state.
import { isComplete, isKnownWord, normalizeCode } from './roomCode'

export const SITE_NAME = 'Boggle Together'
export const HOME_DESCRIPTION =
  'Stretch your table across town for game night. Everyone writes on paper while one shared board and timer keep every household in step.'
export const ROOM_DESCRIPTION = "Someone's inviting you to play!"

/** The colours the image uses. api/og.tsx cannot read index.css, so these mirror its tokens (tested). */
export const OG_COLOURS = {
  bg: '#E4F2FE', // --bg
  tileFace: '#FCF5DF', // --tile-face
  tileShade: '#E5D6B6', // --tile-shade
  tileEdge: '#162137', // --tile-edge
  tileInk: '#162137', // --tile-ink
  ink: '#162137', // --ink
  ink2: '#404E63', // --ink-2
  accent: '#BA1C2D', // --cta-primary
} as const

/**
 * A room code that may be shown in a preview: a complete code whose word is one create_room uses.
 * Anything else gets the home card, so a hand-made link cannot put arbitrary words on our tiles.
 */
export function shareableCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = normalizeCode(raw)
  if (!isComplete(code)) return null
  return isKnownWord(code.split('-')[0]) ? code : null
}

export type ShareMeta = { title: string; description: string; url: string; image: string; imageAlt: string }

/** The preview for a room link, or the home card when the code is not shareable. */
export function shareMeta(origin: string, rawCode?: string | null): ShareMeta {
  const code = shareableCode(rawCode)
  if (!code) {
    return {
      title: SITE_NAME,
      description: HOME_DESCRIPTION,
      url: `${origin}/`,
      image: `${origin}/api/og`,
      imageAlt: 'The word BOGGLE on letter tiles',
    }
  }
  return {
    title: `Join ${code} · ${SITE_NAME}`,
    description: ROOM_DESCRIPTION,
    url: `${origin}/r/${code}`,
    image: `${origin}/api/og?code=${code}`,
    imageAlt: `Room code ${code} on letter tiles`,
  }
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The <title> and preview tags for `meta`. */
export function shareTags(meta: ShareMeta): string {
  const t = escape(meta.title)
  const d = escape(meta.description)
  const img = escape(meta.image)
  const alt = escape(meta.imageAlt)
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${escape(meta.url)}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${alt}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ].join('\n    ')
}

const START = '<!-- share:start -->'
const END = '<!-- share:end -->'

/** `html` with the block between the share markers replaced by tags for `meta` (unchanged if the markers are missing). */
export function injectShareMeta(html: string, meta: ShareMeta): string {
  const a = html.indexOf(START)
  const b = html.indexOf(END, a)
  if (a < 0 || b < 0) return html
  return `${html.slice(0, a + START.length)}\n    ${shareTags(meta)}\n    ${html.slice(b)}`
}
