import indexCss from '../index.css?raw'
import indexHtml from '../../index.html?raw'
import { injectShareMeta, OG_COLOURS, shareableCode, shareMeta, shareTags } from './share'

const ORIGIN = 'https://boggle.chrislates.com'

describe('shareableCode', () => {
  it('accepts a room code in any form', () => {
    expect(shareableCode('ROWAN-8209')).toBe('ROWAN-8209')
    expect(shareableCode('rowan8209')).toBe('ROWAN-8209')
    expect(shareableCode('rowan%208209')).toBe('ROWAN-8209')
  })

  it('accepts words from older lists', () => {
    expect(shareableCode('WALNUT-1234')).toBe('WALNUT-1234')
    expect(shareableCode('MAHOGANY-1234')).toBe('MAHOGANY-1234')
  })

  it('rejects incomplete codes, missing codes and words create_room never uses', () => {
    expect(shareableCode('ROWAN-82')).toBeNull()
    expect(shareableCode('')).toBeNull()
    expect(shareableCode(null)).toBeNull()
    expect(shareableCode('HELLO-1234')).toBeNull()
  })
})

describe('shareMeta', () => {
  it('describes a room link', () => {
    expect(shareMeta(ORIGIN, 'rowan-8209')).toEqual({
      title: 'Join ROWAN-8209 · Boggle Together',
      description: "Someone's inviting you to play!",
      url: `${ORIGIN}/r/ROWAN-8209`,
      image: `${ORIGIN}/api/og?code=ROWAN-8209`,
      imageAlt: 'Room code ROWAN-8209 on letter tiles',
    })
  })

  it('falls back to the home card', () => {
    const home = shareMeta(ORIGIN)
    expect(home.title).toBe('Boggle Together')
    expect(home.image).toBe(`${ORIGIN}/api/og`)
    expect(shareMeta(ORIGIN, 'HELLO-1234')).toEqual(home)
  })
})

describe('injectShareMeta', () => {
  it('replaces the home tags in index.html with the room tags', () => {
    const html = injectShareMeta(indexHtml, shareMeta(ORIGIN, 'ROWAN-8209'))
    expect(html).toContain('<title>Join ROWAN-8209 · Boggle Together</title>')
    expect(html).toContain(`<meta property="og:image" content="${ORIGIN}/api/og?code=ROWAN-8209" />`)
    expect(html.match(/<title>/g)).toHaveLength(1)
    expect(html.match(/property="og:title"/g)).toHaveLength(1)
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>')
  })

  it('index.html already carries exactly the home card', () => {
    const home = injectShareMeta(indexHtml, shareMeta(ORIGIN))
    expect(home).toBe(indexHtml)
  })

  it('escapes what it writes', () => {
    const tags = shareTags({ ...shareMeta(ORIGIN), title: '"><script>' })
    expect(tags).not.toContain('<script>')
    expect(tags).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('leaves HTML without the markers alone', () => {
    expect(injectShareMeta('<html></html>', shareMeta(ORIGIN))).toBe('<html></html>')
  })
})

describe('OG_COLOURS', () => {
  const tokens: Record<keyof typeof OG_COLOURS, string> = {
    bg: '--bg',
    tileFace: '--tile-face',
    tileShade: '--tile-shade',
    tileEdge: '--tile-edge',
    tileInk: '--tile-ink',
    ink: '--ink',
    ink2: '--ink-2',
    accent: '--cta-primary',
  }
  it.each(Object.entries(tokens))('%s matches %s in index.css', (key, token) => {
    const m = indexCss.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`))
    expect(m?.[1].toUpperCase()).toBe(OG_COLOURS[key as keyof typeof OG_COLOURS])
  })
})
