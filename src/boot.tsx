import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { configProblem, type Env } from './lib/config'

export function NotConfigured({ problem }: { problem: string }) {
  return (
    <main>
      <h1>This site is not configured</h1>
      <p>The game server settings are missing, so it cannot start.</p>
      <p className="muted">{problem}</p>
    </main>
  )
}

/**
 * Renders the app, or a plain message when the build is missing its Supabase settings.
 * The app is imported only after the check, because the Supabase client throws on load without them.
 */
export async function boot(container: HTMLElement, env: Env): Promise<void> {
  const root = createRoot(container)
  const problem = configProblem(env)
  if (problem) {
    root.render(<NotConfigured problem={problem} />)
    return
  }
  const { default: App } = await import('./App')
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}
