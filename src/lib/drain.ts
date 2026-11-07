export function drainColor(progress: number): string {
  const p = Number.isNaN(progress) ? 0 : Math.min(1, Math.max(0, progress))
  return `hsl(${130 * p} 70% 45%)`
}
