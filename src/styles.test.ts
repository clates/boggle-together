// Guard: every colour lives in the :root token block of index.css. Rules and components use var(--token),
// so a stray literal (an old #fff, a quick "red") cannot creep back in and break the palette's contrast.
import { describe, expect, it } from 'vitest'
import indexCss from './index.css?raw'

// every component and page source, as text
const sources = import.meta.glob<string>(['./**/*.tsx', '!./**/*.test.tsx'], { query: '?raw', import: 'default', eager: true })
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

// All 148 CSS named colours and the CSS system colours (Canvas, CanvasText, ...), matched as whole words.
const NAMED = `
  aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown
  burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod
  darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue
  darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen
  fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred
  indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray
  lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen
  linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple
  red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
  slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat
  white whitesmoke yellow yellowgreen
`.trim().split(/\s+/)
const SYSTEM = `
  AccentColor AccentColorText ActiveText ButtonBorder ButtonFace ButtonText Canvas CanvasText Field FieldText GrayText Highlight
  HighlightText LinkText Mark MarkText SelectedItem SelectedItemText VisitedText
`.trim().split(/\s+/)
const WORD = new RegExp(`(?<![\\w-])(?:${[...NAMED, ...SYSTEM].join('|')})(?![\\w-])`, 'i')
// hex, and colour functions (rgb(from var(--x) ...) relative colours stay allowed)
const FUNC = /#[0-9a-f]{3,8}(?![\w-])|(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\((?!\s*from\s+var\()/i

/** Arguments of each color-mix(...) in a value (balanced parentheses). */
function colorMixArgs(v: string): string[] {
  const out: string[] = []
  for (let i = v.toLowerCase().indexOf('color-mix('); i >= 0; i = v.toLowerCase().indexOf('color-mix(', i + 1)) {
    let depth = 0
    let j = i + 'color-mix'.length
    for (; j < v.length; j++) {
      if (v[j] === '(') depth++
      else if (v[j] === ')' && --depth === 0) break
    }
    out.push(v.slice(i + 'color-mix('.length, j))
  }
  return out
}

/** True when a declaration value contains a colour literal. Token names (--timer-red) never count. */
export function hasColourLiteral(value: string): boolean {
  const v = value.replace(/--[\w-]+/g, '')
  if (FUNC.test(v) || WORD.test(v)) return true
  // color-mix() may only mix tokens: anything left besides "in <space> [<hue> hue]", percentages and commas is a literal (e.g. transparent)
  return colorMixArgs(v).some(
    (args) =>
      args
        .replace(/var\(\s*\)/g, '')
        .replace(/\bin\s+[\w-]+(\s+(shorter|longer|increasing|decreasing)\s+hue)?/gi, '')
        .replace(/[\d.]+%/g, '')
        .replace(/[\s,]/g, '') !== '',
  )
}

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
  const css = indexCss

  it('has no colour literal outside the :root token block', () => {
    const offenders = declarationsOutsideRoot(css).filter((d) => hasColourLiteral(d.split(': ').slice(1).join(': ')))
    expect(offenders).toEqual([])
  })

  it('controls never use the decorative --line as their edge (3:1 for UI boundaries)', () => {
    const rules = [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(([, sel, body]) => [sel.trim(), body] as const)
      .filter(([sel]) => /\b(button|input)\b/.test(sel) && !/:disabled/.test(sel))
    const offenders = rules.filter(([, body]) => /border[-a-z]*\s*:[^;]*var\(--line\)/.test(body)).map(([sel]) => sel)
    expect(offenders).toEqual([])
    expect(css).toMatch(/button\.subtle \{[^}]*border-color: var\(--line-strong\)/)
  })

  it('the guard itself catches literals and ignores token names', () => {
    const bad = [
      ':root { --a: #fff; }',
      '.a { color: #222; }',
      '.b { color: #2228; }',
      '.c { color: #222222; }',
      '.d { color: #22222280; }',
      '.e { background: rgb(0 0 0 / .5); }',
      '.f { background: rgba(0, 0, 0, .5); }',
      '.g { color: hsl(0 70% 45%); }',
      '.h { color: oklch(60% 0.18 36); }',
      '.i { border: 1px solid white; }',
      '.j { color: DarkRed; }',
      '.k { border-color: lightgray; }',
      '.l { background: salmon; }',
      '.m { color: CanvasText; }',
      '.n { background: color-mix(in srgb, var(--a), transparent); }',
      '.o { background: color-mix(in oklch, var(--a) 40%, black); }',
      '.ok { color: var(--timer-red); background: var(--white-ish, var(--a)); white-space: nowrap; border-color: transparent; }',
      '.ok2 { background: color-mix(in oklch shorter hue, var(--a) 40%, var(--b)); color: rgb(from var(--a) r g b / 50%); fill: currentColor; color: inherit; }',
    ].join('\n')
    expect(declarationsOutsideRoot(bad).filter((d) => hasColourLiteral(d.split(': ').slice(1).join(': ')))).toEqual([
      'color: #222',
      'color: #2228',
      'color: #222222',
      'color: #22222280',
      'background: rgb(0 0 0 / .5)',
      'background: rgba(0, 0, 0, .5)',
      'color: hsl(0 70% 45%)',
      'color: oklch(60% 0.18 36)',
      'border: 1px solid white',
      'color: DarkRed',
      'border-color: lightgray',
      'background: salmon',
      'color: CanvasText',
      'background: color-mix(in srgb, var(--a), transparent)',
      'background: color-mix(in oklch, var(--a) 40%, black)',
    ])
  })
})

describe('components', () => {
  it('set no colours inline (only the timer passes --fill / --fill-edge)', () => {
    const offenders: string[] = []
    expect(Object.keys(sources).length).toBeGreaterThan(10)
    for (const [f, code] of Object.entries(sources)) {
      for (const [style] of code.matchAll(/style=\{\{[\s\S]*?\}\}/g))
        if (/color|background|fill|stroke|border|shadow|outline/i.test(style)) offenders.push(`${f}: ${style}`)
      for (const [attr] of code.matchAll(/\b(?:fill|stroke|color|stop-color)=["{][^"}]*["}]/g)) offenders.push(`${f}: ${attr}`)
      if (/['"`]#[0-9a-f]{3,8}\b/i.test(code)) offenders.push(`${f}: colour literal`)
    }
    expect(offenders).toEqual([])
  })

  it('the timer colours come in as custom properties', () => {
    const timer = sources['./components/TimerFill.tsx']
    expect(timer).toMatch(/'--fill': drainColor\(/)
    expect(timer).toMatch(/'--fill-edge': drainEdge\(/)
  })
})
