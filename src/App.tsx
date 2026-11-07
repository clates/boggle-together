import { Route, Routes, useParams } from 'react-router-dom'

function Home() {
  return (
    <main>
      <h1>Boggle Together</h1>
      <button type="button">Start a room</button>
      <button type="button">Join a room</button>
    </main>
  )
}

function Room() {
  const { code } = useParams()
  return (
    <main>
      <p>Room {code}</p>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/r/:code" element={<Room />} />
    </Routes>
  )
}
