import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Grid3x3, Heading1, ImagePlus, Trash2, Type } from 'lucide-react'
import { useDelete, useInsert, useRows, useUpdate } from '../../lib/data'
import type { Attachment, ScrapbookItem } from '../../lib/types'
import { uploadAttachment, deleteAttachment } from '../../lib/upload'
import { peekImageSrc, resolveImageSrc, onImageResolved } from '../../lib/imgsrc'
import { Button } from '../../components/ui'

/**
 * A free-form board of absolutely-positioned blocks.
 *
 * Geometry rules that matter (all three were bugs first time round):
 *  1. Everything snaps to GRID, which is also the dotted background's spacing,
 *     so blocks visibly line up with the dots.
 *  2. Drag math works in *content* coordinates (pointer − surface origin +
 *     scroll), not pointer deltas. Delta math silently drifts the moment the
 *     surface scrolls mid-drag.
 *  3. The scroll window is viewport-height and the canvas grows to fit its
 *     content, so the board scrolls internally instead of making the whole
 *     page 1600px tall.
 */

/** Matches the dotted background spacing below — keep the two in step. */
const GRID = 20
/** Below this much movement it's a click, not a drag — matches useDragScroll. */
const DRAG_THRESHOLD = 3
/** Start auto-scrolling when the pointer comes this close to an edge. */
const EDGE = 48
const EDGE_SPEED = 14
const MIN_W = GRID * 4
const MIN_H = GRID * 2

const snap = (n: number) => Math.round(n / GRID) * GRID

type Box = { x: number; y: number; w: number; h: number }

export function Canvas({ scrapbookId }: { scrapbookId: string }) {
  const { data: allItems = [] } = useRows<ScrapbookItem>('scrapbook_items', { column: 'z' })
  const insert = useInsert<ScrapbookItem>('scrapbook_items')
  const update = useUpdate<ScrapbookItem>('scrapbook_items')
  const del = useDelete('scrapbook_items')
  const { data: attachments = [] } = useRows<Attachment>('attachments', { column: 'created_at' })

  const items = useMemo(
    () => allItems.filter((i) => i.scrapbook_id === scrapbookId),
    [allItems, scrapbookId],
  )
  const surface = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Live drag/resize geometry, so we don't write to the DB on every pointermove.
  const [draft, setDraft] = useState<{ id: string; box: Box } | null>(null)

  const topZ = items.reduce((m, i) => Math.max(m, i.z), 0)

  // Blocks placed before snapping existed sit off the grid until touched.
  const offGrid = useMemo(
    () => items.filter((i) => i.x % GRID || i.y % GRID || i.w % GRID || i.h % GRID),
    [items],
  )

  // Canvas grows to fit its contents plus a screen of slack, so there's always
  // somewhere to drag to — and no phantom scrollbar on an empty board.
  const extent = useMemo(() => {
    const right = items.reduce((m, i) => Math.max(m, i.x + i.w), 0)
    const bottom = items.reduce((m, i) => Math.max(m, i.y + i.h), 0)
    return { w: right + 600, h: Math.max(900, bottom + 400) }
  }, [items])

  // Cascade new blocks instead of stacking them all at the same coordinates.
  const nextSlot = useCallback(() => {
    const n = items.length
    return { x: snap(40 + (n % 6) * 40), y: snap(40 + (n % 6) * 40) }
  }, [items.length])

  const addItem = useCallback(
    (kind: ScrapbookItem['kind'], patch: Partial<ScrapbookItem> = {}) => {
      const slot = nextSlot()
      insert.mutate(
        {
          scrapbook_id: scrapbookId,
          kind,
          content: kind === 'heading' ? 'Heading' : kind === 'text' ? 'Type here…' : '',
          x: slot.x,
          y: slot.y,
          w: kind === 'heading' ? GRID * 16 : GRID * 12,
          h: kind === 'heading' ? GRID * 3 : GRID * 6,
          z: topZ + 1,
          ...patch,
        },
        { onError: (e) => setError(e.message) },
      )
    },
    [insert, scrapbookId, topZ, nextSlot],
  )

  /**
   * Pull every stray block onto the grid. Sequential on purpose: firing several
   * `mutate` calls at once against one mutation instance lets later calls
   * supersede earlier ones, and only the last write lands.
   */
  async function tidyUp() {
    setBusy(true)
    setError(null)
    try {
      for (const i of offGrid) {
        await update.mutateAsync({
          id: i.id,
          patch: {
            x: Math.max(0, snap(i.x)),
            y: Math.max(0, snap(i.y)),
            w: Math.max(MIN_W, snap(i.w)),
            h: Math.max(MIN_H, snap(i.h)),
          },
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not tidy up.')
    } finally {
      setBusy(false)
    }
  }

  /** Paste an image anywhere on the board. */
  useEffect(() => {
    async function onPaste(e: ClipboardEvent) {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
      if (files.length === 0) return
      e.preventDefault()
      setBusy(true)
      setError(null)
      for (const raw of files) {
        try {
          const ext = (raw.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
          const file =
            raw.name && raw.name !== 'image.png'
              ? raw
              : new File([raw], `scrapbook-${Date.now()}.${ext}`, { type: raw.type })
          // Scrapbook images have no project and no note — they belong to the board.
          const att = await uploadAttachment(file, { projectId: null })
          const dims = await imageSize(file)
          addItem('image', { attachment_id: att.id, content: att.file_name, ...dims })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Upload failed.')
        }
      }
      setBusy(false)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addItem])

  /**
   * Shared pointer loop for moving and resizing.
   *
   * Works in content coordinates and re-reads scroll every frame, so dragging
   * stays correct while the surface auto-scrolls under the pointer.
   */
  function beginDrag(e: React.PointerEvent, item: ScrapbookItem, mode: 'move' | 'resize') {
    e.preventDefault()
    e.stopPropagation()
    setSelected(item.id)

    const el = surface.current
    if (!el) return
    // Capture so the gesture survives the pointer leaving the element. It
    // throws if the pointer isn't active, and the window-level listeners below
    // already cover that case — so a failure here must not abort the drag.
    try {
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    } catch {
      /* non-fatal */
    }

    const toContent = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect()
      return { x: cx - r.left + el.scrollLeft, y: cy - r.top + el.scrollTop }
    }

    const start = toContent(e.clientX, e.clientY)
    const base: Box = { x: item.x, y: item.y, w: item.w, h: item.h }
    // Where inside the block the grab happened, so it doesn't jump to the cursor.
    const grab = { x: start.x - base.x, y: start.y - base.y }

    let moved = false
    let box = base
    let pointer = { cx: e.clientX, cy: e.clientY }
    let edgeTimer: ReturnType<typeof setInterval> | null = null

    function apply() {
      const p = toContent(pointer.cx, pointer.cy)
      box =
        mode === 'move'
          ? {
              ...base,
              x: Math.max(0, snap(p.x - grab.x)),
              y: Math.max(0, snap(p.y - grab.y)),
            }
          : {
              ...base,
              w: Math.max(MIN_W, snap(p.x - base.x)),
              h: Math.max(MIN_H, snap(p.y - base.y)),
            }
      setDraft({ id: item.id, box })
    }

    /**
     * Scroll the surface when the pointer nears an edge, so the far side of the
     * board is reachable — without this you simply run out of screen and can't
     * place anything to the right.
     *
     * Driven by an interval rather than rAF on purpose: rAF is suspended when
     * the document is hidden, which makes this behaviour untestable and gives
     * it a second, subtler failure mode for no benefit at this granularity.
     */
    function autoScroll() {
      if (!el) return
      const r = el.getBoundingClientRect()
      let dx = 0
      let dy = 0
      if (pointer.cx > r.right - EDGE) dx = EDGE_SPEED
      else if (pointer.cx < r.left + EDGE) dx = -EDGE_SPEED
      if (pointer.cy > r.bottom - EDGE) dy = EDGE_SPEED
      else if (pointer.cy < r.top + EDGE) dy = -EDGE_SPEED
      if (!dx && !dy) return
      el.scrollLeft += dx
      el.scrollTop += dy
      apply()
    }

    function onMove(ev: PointerEvent) {
      pointer = { cx: ev.clientX, cy: ev.clientY }
      if (!moved) {
        const p = toContent(ev.clientX, ev.clientY)
        if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) < DRAG_THRESHOLD) return
        moved = true
        edgeTimer = setInterval(autoScroll, 16)
      }
      apply()
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (edgeTimer) clearInterval(edgeTimer)
      setDraft(null)
      if (!moved) return
      // One write at the end, not one per pointermove.
      update.mutate({ id: item.id, patch: box })
      // Swallow only the click that belongs to this gesture. A `once` listener
      // would linger and eat the next unrelated click instead, so it's torn
      // down on the following tick whether or not it fired.
      const swallow = (ev: MouseEvent) => ev.stopPropagation()
      window.addEventListener('click', swallow, { capture: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  async function removeItem(item: ScrapbookItem) {
    if (!window.confirm('Delete this block?')) return
    // Drop the stored file too, or the bucket leaks.
    if (item.attachment_id) {
      const att = attachments.find((a) => a.id === item.attachment_id)
      if (att) await deleteAttachment(att).catch(() => {})
    }
    del.mutate(item.id)
    setSelected(null)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => addItem('heading')}>
          <Heading1 size={15} /> Heading
        </Button>
        <Button variant="ghost" onClick={() => addItem('text')}>
          <Type size={15} /> Text
        </Button>
        {offGrid.length > 0 && (
          <Button variant="ghost" onClick={tidyUp} disabled={busy} title="Line up every block with the grid">
            <Grid3x3 size={15} /> Tidy up ({offGrid.length})
          </Button>
        )}
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-faint">
          <ImagePlus size={14} />
          {busy ? 'Uploading…' : 'Paste an image anywhere'}
        </span>
        {error && <span className="text-[12.5px] text-neg">{error}</span>}
      </div>

      {/* Scroll window: viewport-height so the board scrolls itself rather than
          stretching the page. Drag near an edge to pan. */}
      <div
        ref={surface}
        onPointerDown={() => setSelected(null)}
        className="relative h-[68vh] w-full overflow-auto overscroll-contain rounded-card border border-line bg-surface"
      >
        {/* Canvas: grows with content. The dotted grid lives here so it scrolls
            with the blocks and stays aligned to the snap positions. */}
        <div
          className="relative bg-[radial-gradient(var(--border)_1px,transparent_1px)]"
          style={{
            width: extent.w,
            height: extent.h,
            backgroundSize: `${GRID}px ${GRID}px`,
          }}
        >
          {items.length === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-24 text-center text-[13.5px] text-ink-faint">
              Empty board — add a heading or text, or paste a screenshot straight in.
            </p>
          )}
          {items.map((item) => {
            const box = draft?.id === item.id ? draft.box : item
            return (
              <ItemBlock
                key={item.id}
                item={item}
                box={box}
                selected={selected === item.id}
                onPointerDown={(e, mode) => beginDrag(e, item, mode)}
                onSelect={() => setSelected(item.id)}
                onChange={(content) => update.mutate({ id: item.id, patch: { content } })}
                onDelete={() => removeItem(item)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Natural size, snapped to the grid and capped so a big screenshot fits. */
function imageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 360 / img.width)
      resolve({
        w: Math.max(MIN_W, snap(img.width * scale)),
        h: Math.max(MIN_H, snap(img.height * scale)),
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ w: GRID * 12, h: GRID * 8 })
    }
    img.src = url
  })
}

function ItemBlock({
  item,
  box,
  selected,
  onPointerDown,
  onSelect,
  onChange,
  onDelete,
}: {
  item: ScrapbookItem
  box: Box
  selected: boolean
  onPointerDown: (e: React.PointerEvent, mode: 'move' | 'resize') => void
  onSelect: () => void
  onChange: (content: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.content)
  useEffect(() => {
    if (!editing) setDraft(item.content)
  }, [item.content, editing])

  function commit() {
    setEditing(false)
    if (draft !== item.content) onChange(draft)
  }

  return (
    <div
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        zIndex: item.z,
        // Without this a touch-drag pans the canvas instead of moving the block.
        // Panning still works by dragging empty board space.
        touchAction: editing ? 'auto' : 'none',
      }}
      onPointerDown={(e) => {
        if (!editing) onPointerDown(e, 'move')
        else e.stopPropagation()
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      className={`absolute rounded-field ${
        selected ? 'ring-2 ring-tide' : ''
      } ${item.kind === 'image' ? '' : 'border border-line bg-surface p-2'} ${
        editing ? '' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      {item.kind === 'image' ? (
        <ItemImage id={item.attachment_id} alt={item.content} />
      ) : editing ? (
        <textarea
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(item.content)
              setEditing(false)
            }
          }}
          className={`h-full w-full resize-none bg-transparent outline-none ${
            item.kind === 'heading'
              ? 'font-display text-[19px] font-semibold tracking-tight'
              : 'text-[13.5px] leading-relaxed'
          }`}
        />
      ) : (
        <div
          onDoubleClick={() => setEditing(true)}
          className={`h-full w-full overflow-hidden whitespace-pre-wrap break-words ${
            item.kind === 'heading'
              ? 'font-display text-[19px] font-semibold tracking-tight'
              : 'text-[13.5px] leading-relaxed'
          }`}
        >
          {item.content || <span className="text-ink-faint">Double-click to edit</span>}
        </div>
      )}

      {selected && (
        <>
          <button
            type="button"
            title="Delete block"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-ink-faint shadow-sm hover:bg-neg-soft hover:text-neg"
          >
            <Trash2 size={12} />
          </button>
          {/* Corner resize handle */}
          <span
            onPointerDown={(e) => onPointerDown(e, 'resize')}
            style={{ touchAction: 'none' }}
            className="absolute -bottom-1 -right-1 h-3.5 w-3.5 cursor-se-resize rounded-sm border border-tide bg-surface"
          />
        </>
      )}
    </div>
  )
}

function ItemImage({ id, alt }: { id: string | null; alt: string }) {
  const [src, setSrc] = useState<string | null>(() => (id ? peekImageSrc(id) : null))
  useEffect(() => {
    if (!id) return
    let live = true
    void resolveImageSrc(id).then((u) => live && setSrc(u))
    const off = onImageResolved(() => live && setSrc(peekImageSrc(id)))
    return () => {
      live = false
      off()
    }
  }, [id])

  if (!src) return <span className="grid h-full w-full place-items-center rounded-field bg-sunken" />
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      className="pointer-events-none h-full w-full rounded-field object-cover"
    />
  )
}
