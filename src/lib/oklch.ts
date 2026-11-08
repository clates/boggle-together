// OKLCH -> sRGB hex, dependency free (Björn Ottosson's OKLab matrices). Used by the timer so the
// colour is a plain #rrggbb that every browser renders, including iPads older than Safari 15.4.

/** [L 0..1, C, H degrees] */
export type Oklch = [number, number, number]

function toLinearSrgb([L, C, H]: Oklch): [number, number, number] {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const EPS = 0.0005
const inGamut = (rgb: number[]) => rgb.every((c) => c >= -EPS && c <= 1 + EPS)

/** Lower the chroma (same lightness and hue) until the colour fits in sRGB. */
export function clampChroma([L, C, H]: Oklch): Oklch {
  if (inGamut(toLinearSrgb([L, C, H]))) return [L, C, H]
  let lo = 0
  let hi = C
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(toLinearSrgb([L, mid, H]))) lo = mid
    else hi = mid
  }
  return [L, lo, H]
}

const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const byte = (c: number) => Math.round(Math.min(1, Math.max(0, gamma(c))) * 255)

/** The sRGB hex (#rrggbb, lowercase) of an OKLCH colour, gamut-clamped by chroma. */
export function oklchToHex(lch: Oklch): string {
  return '#' + toLinearSrgb(clampChroma(lch)).map((c) => byte(c).toString(16).padStart(2, '0')).join('')
}

/** Straight-line interpolation in OKLCH, along the shorter hue arc. */
export function mixOklch(a: Oklch, b: Oklch, t: number): Oklch {
  let dh = b[2] - a[2]
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] + dh * t + 360) % 360]
}
