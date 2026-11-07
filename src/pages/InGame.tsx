// STUB: Task 8 replaces this with the real household in-game view.
export default function InGameStub({ phase, code }: { phase: string; code: string }) {
  return (
    <main data-testid="in-game-stub">
      <h1>In game (stub)</h1>
      <p>Phase: {phase}</p>
      <p>Room {code}</p>
    </main>
  )
}
