export type Rotation = 0 | 90 | 180 | 270

/** `highlight`: one tile (0-15 in reading order) to pick out, e.g. the busiest tile on the results screen. */
export default function Board({ letters, rotation, highlight }: { letters: string[]; rotation: Rotation; highlight?: number }) {
  return (
    <div className="board-wrap" style={{ transform: `rotate(${rotation}deg)` }}>
      <div className="board" data-testid="board">
        {letters.map((l, i) => (
          <div
            key={i}
            className={`tile${l.length > 1 ? ' tile-long' : ''}${i === highlight ? ' tile-highlight' : ''}`}
            data-testid="tile"
            data-highlight={i === highlight || undefined}
          >
            {l}
          </div>
        ))}
      </div>
    </div>
  )
}
