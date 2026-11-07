import { useLayoutEffect, type RefObject } from 'react'

// Keeps a fixed element on top of the *visible* part of the page. When a phone's keyboard opens,
// the visual viewport shrinks (and on iOS the page pans) while 100vh/100dvh/100svh stay the same,
// so CSS units alone would let the keyboard cover the bottom of the screen. This writes
// --vv-h (visible height) and --vv-top (pan offset) on the element; CSS falls back to 100dvh.
export function useVisualViewport(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const el = ref.current
    if (!vv || !el) return
    let frame = 0
    const apply = () => {
      frame = 0
      el.style.setProperty('--vv-h', `${vv.height}px`)
      el.style.setProperty('--vv-top', `${vv.offsetTop}px`)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply)
    }
    apply()
    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    return () => {
      cancelAnimationFrame(frame)
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
    }
  }, [ref])
}
