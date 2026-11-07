// Test helper: a recording stand-in for the bits of the Web Audio API the engine uses.

type ParamEvent = { kind: 'set' | 'ramp'; value: number; time: number }

export class FakeParam {
  value = 0
  events: ParamEvent[] = []
  setValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'set', value, time })
    return this
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ kind: 'ramp', value, time })
    return this
  }
  cancelScheduledValues() {
    return this
  }
  get peak() {
    return Math.max(this.value, ...this.events.map((e) => e.value))
  }
}

export class FakeNode {
  connected: FakeNode[] = []
  disconnected = false
  connect<T>(n: T): T {
    this.connected.push(n as unknown as FakeNode)
    return n
  }
  disconnect() {
    this.disconnected = true
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam()
}

export class FakeFilter extends FakeNode {
  type = 'lowpass'
  frequency = new FakeParam()
  Q = new FakeParam()
}

export class FakeOscillator extends FakeNode {
  type = 'sine'
  frequency = new FakeParam()
  startAt: number | null = null
  stopAt: number | null = null
  /** stop() calls without a time: a cancel */
  cancelled = false
  onended: (() => void) | null = null
  start(when = 0) {
    if (this.startAt !== null) throw new Error('start called twice')
    this.startAt = when
  }
  stop(when?: number) {
    if (this.startAt === null) throw new Error('stop before start')
    if (when === undefined) this.cancelled = true
    else this.stopAt = when
  }
}

export class FakeAudioContext {
  currentTime: number
  state: 'suspended' | 'running' | 'closed'
  destination = new FakeNode()
  oscillators: FakeOscillator[] = []
  gains: FakeGain[] = []
  resumeCalls = 0
  onstatechange: (() => void) | null = null
  /** whether resume() works (a real browser only allows it during a user gesture) */
  canResume: boolean

  constructor({ currentTime = 0, state = 'running', canResume = true }: { currentTime?: number; state?: 'suspended' | 'running'; canResume?: boolean } = {}) {
    this.currentTime = currentTime
    this.state = state
    this.canResume = canResume
  }

  resume() {
    this.resumeCalls++
    if (this.canResume && this.state !== 'running') {
      this.state = 'running'
      this.onstatechange?.()
    }
    return Promise.resolve()
  }

  createOscillator() {
    const o = new FakeOscillator()
    this.oscillators.push(o)
    return o
  }
  createGain() {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
  createBiquadFilter() {
    return new FakeFilter()
  }

  /** oscillators that are still going to sound */
  get live() {
    return this.oscillators.filter((o) => !o.cancelled)
  }
}

/** Follows an oscillator's output to its own gain (through an optional filter). */
export function voiceOf(o: FakeOscillator) {
  let node: FakeNode | undefined = o.connected[0]
  while (node && !(node instanceof FakeGain)) node = node.connected[0]
  const gain = node as FakeGain
  return {
    type: o.type,
    frequency: o.frequency.value,
    start: o.startAt!,
    duration: o.stopAt! - o.startAt!,
    peak: gain.gain.peak,
    gain,
  }
}
