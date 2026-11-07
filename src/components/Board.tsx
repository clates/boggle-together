export type Rotation = 0 | 90 | 180 | 270

export default function Board({ letters, rotation }: { letters: string[]; rotation: Rotation }) {
  return (
    <div className="board-wrap" style={{ transform: `rotate(${rotation}deg)` }}>
      <div className="board" data-testid="board">
        {letters.map((l, i) => (
          <div key={i} className={`tile${l.length > 1 ? ' tile-long' : ''}`} data-testid="tile">
            {l}
          </div>
        ))}
      </div>
    </div>
  )
}
