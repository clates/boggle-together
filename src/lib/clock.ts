export type ClockSample = { sentMs: number; receivedMs: number; serverMs: number }

/** Offset to add to the local clock to get server time, from the lowest-RTT sample. */
export function estimateOffset(samples: ClockSample[]): number {
  if (samples.length === 0) return 0
  let best = samples[0]
  for (const s of samples) {
    if (s.receivedMs - s.sentMs < best.receivedMs - best.sentMs) best = s
  }
  const rtt = best.receivedMs - best.sentMs
  return best.serverMs + rtt / 2 - best.receivedMs
}
