import { useEffect, useRef } from 'react'

/**
 * Horizontal scroll without a visible scrollbar:
 *  - vertical wheel / trackpad → scrolls the strip sideways (Apple-style),
 *    releasing to the page once an edge is reached so the page never traps
 *  - click-drag with a mouse pans it (touch uses the browser's native panning)
 * Cell clicks still fire because a drag only starts after a few px of movement.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return // already horizontal
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0
      if (atStart || atEnd) return // let the page scroll past the strip
      el.scrollLeft += e.deltaY
      e.preventDefault()
    }

    let dragging = false
    let moved = false
    let startX = 0
    let startLeft = 0

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return // touch pans natively
      dragging = true
      moved = false
      startX = e.clientX
      startLeft = el.scrollLeft
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - startX
      if (Math.abs(dx) > 3) {
        moved = true
        el.scrollLeft = startLeft - dx
        el.style.cursor = 'grabbing'
      }
    }
    const onUp = (e: PointerEvent) => {
      // Swallow the click that ends a real drag so a cell isn't toggled.
      if (moved) {
        const stop = (ev: Event) => {
          ev.stopPropagation()
          ev.preventDefault()
          el.removeEventListener('click', stop, true)
        }
        el.addEventListener('click', stop, true)
      }
      dragging = false
      el.style.cursor = ''
      void e
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  return ref
}
