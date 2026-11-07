// The pre-round countdown: whole seconds left, the only number shown during a game.
export default function Countdown({
  startAt,
  now,
  line = 'Get your pens ready',
}: {
  startAt: number
  now: number
  line?: string
}) {
  const seconds = Number.isFinite(startAt) ? Math.max(0, Math.ceil((startAt - now) / 1000)) : 0
  return (
    <div className="countdown">
      <p className="countdown-number" data-testid="countdown" aria-live="assertive">
        {seconds}
      </p>
      <p className="countdown-line">{line}</p>
    </div>
  )
}
