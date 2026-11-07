// Guard: every colour lives in the :root token block of index.css. Rules and components use var(--token),
// so a stray literal (an old #fff, a quick "red") cannot creep back in and break the palette's contrast.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname)
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

const NAMED = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'silver', 'navy', 'maroon', 'teal', 'olive', 'lime', 'aqua', 'fuchsia', 'ivory', 'beige', 'gold', 'crimson', 'tomato']
// a colour literal inside a declaration value; rgb(from var(--x) ...) and color-mix() of tokens stay allowed
const LITERAL = new RegExp(`#[0-9a-f]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\\((?!\\s*from\\s+var\\()|\\b(?:${NAMED.join('|')})\\b`, 'i')

/** The rules after the :root block, as [selector, declaration] pairs. */
function declarationsOutsideRoot(css: string): string[] {
  const text = stripComments(css)
  const start = text.indexOf(':root {')
  const end = text.indexOf('}', start)
  expect(start).toBeGreaterThanOrEqual(0)
  const outside = text.slice(0, start) + text.slice(end + 1)
  // values only: what follows "prop:" up to ";" or "}" (selectors such as .results-list s are not values)
  return [...outside.matchAll(/([-a-z]+)\s*:\s*([^;{}]+)[;}]/gi)].map((m) => `${m[1]}: ${m[2].trim()}`)
}

describe('index.css colour tokens', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')

  it('has no colour literal outside the :root token block', () => {
    const offenders = declarationsOutsideRoot(css).filter((d) => LITERAL.test(d.split(': ').slice(1).join(': ')))
    expect(offenders).toEqual([])
  })

  it('the guard itself catches literals', () => {
    const bad = ':root { --a: #fff; }\n.x { color: #222; }\n.y { background: rgb(0 0 0 / .5); }\n.z { border: 1px solid white; }\n.ok { color: var(--a); white-space: nowrap; background: transparent; }'
    expect(declarationsOutsideRoot(bad).filter((d) => LITERAL.test(d.split(': ').slice(1).join(': ')))).toEqual([
      'color: #222',
      'background: rgb(0 0 0 / .5)',
      'border: 1px solid white',
    ])
  })
})

describe('components', () => {
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))

  it('set no colours inline (only the timer passes --fill / --fill-edge)', () => {
    const offenders: string[] = []
    for (const f of files) {
      const code = readFileSync(join(SRC, f), 'utf8')
      for (const [style] of code.matchAll(/style=\{\{[\s\S]*?\}\}/g))
        if (/color|background|fill|stroke|border|shadow|outline/i.test(style)) offenders.push(`${f}: ${style}`)
      for (const [attr] of code.matchAll(/\b(?:fill|stroke|color|stop-color)=["{][^"}]*["}]/g)) offenders.push(`${f}: ${attr}`)
      if (/['"`]#[0-9a-f]{3,8}\b/i.test(code)) offenders.push(`${f}: colour literal`)
    }
    expect(offenders).toEqual([])
  })

  it('the timer colours come in as custom properties', () => {
    const timer = readFileSync(join(SRC, 'components', 'TimerFill.tsx'), 'utf8')
    expect(timer).toMatch(/'--fill': drainColor\(/)
    expect(timer).toMatch(/'--fill-edge': drainEdge\(/)
  })
})
