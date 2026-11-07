import { mixOklch, oklchToHex, type Oklch } from './oklch'

// The timer sweep: blue-leaning green at the start, sunflower yellow halfway, vermilion from
// p = 0.15 to the end. Interpolated in OKLCH so the middle stays bright (no muddy olive), and
// returned as plain hex so older Safari (before 15.4, no oklch()) renders it.
const START: Oklch = [0.77, 0.14, 166]
const MID: Oklch = [0.87, 0.155, 92]
const END: Oklch = [0.6, 0.185, 36]
const MID_AT = 0.5
const END_AT = 0.15

/** At or below this much time left the fill gets faint static stripes (class fill-low). */
export const LOW_AT = 0.2

const clamp = (progress: number) => (Number.isNaN(progress) ? 0 : Math.min(1, Math.max(0, progress)))

function sweep(progress: number): Oklch {
  const p = clamp(progress)
  if (p >= MID_AT) return mixOklch(MID, START, (p - MID_AT) / (1 - MID_AT))
  if (p > END_AT) return mixOklch(END, MID, (p - END_AT) / (MID_AT - END_AT))
  return END
}

/** The fill colour for the fraction of time left (1 = full, 0 = none) as #rrggbb. */
export function drainColor(progress: number): string {
  return oklchToHex(sweep(progress))
}

/** The darker "waterline" drawn along the top edge of the fill: same hue, L - 0.30, chroma x 0.75. */
export function drainEdge(progress: number): string {
  const [L, C, H] = sweep(progress)
  return oklchToHex([Math.max(0, L - 0.3), C * 0.75, H])
}
