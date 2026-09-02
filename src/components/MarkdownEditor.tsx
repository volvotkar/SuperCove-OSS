import { useEffect, useRef } from 'react'
import { EditorState, StateEffect, type Extension } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { uploadAttachment } from '../lib/upload'
import {
  attachmentIdFromSrc,
  onImageResolved,
  peekImageSrc,
  resolveImageSrc,
  scRef,
} from '../lib/imgsrc'

/** Fired when a signed image URL resolves, so widgets can repaint. */
const redrawImages = StateEffect.define<null>()

/**
 * Hybrid markdown editor — you type markdown and see it rendered in place,
 * with no edit/preview switch. The raw syntax un-hides on whichever line the
 * cursor is on, so the marks are always reachable for editing.
 *
 * Built on CodeMirror 6: we walk the Lezer markdown tree and emit two kinds of
 * decoration — line decorations that size headings/quotes, and replace
 * decorations that hide the syntax marks themselves.
 */

export type EditorPalette = { bg: string; ink: string; font?: string }

/** Syntax marks worth hiding once the cursor leaves the line. */
const HIDDEN_MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'StrongEmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'QuoteMark',
  'LinkMark',
])

const HEADING_LINE: Record<string, string> = {
  ATXHeading1: 'cm-sc-h1',
  ATXHeading2: 'cm-sc-h2',
  ATXHeading3: 'cm-sc-h3',
  ATXHeading4: 'cm-sc-h4',
  ATXHeading5: 'cm-sc-h5',
  ATXHeading6: 'cm-sc-h6',
}

const INLINE_MARK: Record<string, string> = {
  StrongEmphasis: 'cm-sc-strong',
  Emphasis: 'cm-sc-em',
  Strikethrough: 'cm-sc-strike',
  InlineCode: 'cm-sc-code',
  URL: 'cm-sc-link',
  Link: 'cm-sc-link',
}

/** Stands in for the "- " of a bullet so the list still reads as a list. */
class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-sc-bullet'
    span.textContent = '•'
    return span
  }
  eq() {
    return true
  }
}

/**
 * Renders `![alt](sc-attachment/<id>)` as the actual picture. The URL is a
 * short-lived signed one, so it's resolved through the cache rather than being
 * read out of the document.
 */
class ImageWidget extends WidgetType {
  // Explicit fields: this repo builds with `erasableSyntaxOnly`, which rules
  // out TypeScript constructor parameter properties.
  id: string
  alt: string
  constructor(id: string, alt: string) {
    super()
    this.id = id
    this.alt = alt
  }
  eq(other: ImageWidget) {
    return other.id === this.id && other.alt === this.alt
  }
  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-sc-img'
    const img = document.createElement('img')
    img.alt = this.alt
    const cached = peekImageSrc(this.id)
    if (cached) img.src = cached
    else void resolveImageSrc(this.id).then((url) => url && (img.src = url))
    wrap.appendChild(img)
    return wrap
  }
  ignoreEvent() {
    return false
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const decos: { from: number; to: number; deco: Decoration }[] = []
  const { state } = view
  // Every line touched by a cursor or selection shows its raw syntax — but
  // only while the editor has focus, so an idle note reads fully rendered.
  const activeLines = new Set<number>()
  if (view.hasFocus) {
    for (const r of state.selection.ranges) {
      const first = state.doc.lineAt(r.from).number
      const last = state.doc.lineAt(r.to).number
      for (let n = first; n <= last; n++) activeLines.add(n)
    }
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name

        const headingClass = HEADING_LINE[name]
        if (headingClass) {
          const line = state.doc.lineAt(node.from)
          decos.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ class: headingClass }),
          })
          return
        }

        if (name === 'FencedCode' || name === 'CodeBlock') {
          const first = state.doc.lineAt(node.from).number
          const last = state.doc.lineAt(node.to).number
          for (let n = first; n <= last; n++) {
            const line = state.doc.line(n)
            decos.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: 'cm-sc-codeblock' }),
            })
          }
          return
        }

        // The language tag after ``` — noise once you've stopped editing.
        if (name === 'CodeInfo' && !activeLines.has(state.doc.lineAt(node.from).number)) {
          decos.push({ from: node.from, to: node.to, deco: Decoration.replace({}) })
          return
        }

        if (name === 'Blockquote') {
          const first = state.doc.lineAt(node.from).number
          const last = state.doc.lineAt(node.to).number
          for (let n = first; n <= last; n++) {
            const line = state.doc.line(n)
            decos.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ class: 'cm-sc-quote' }),
            })
          }
          return
        }

        // A whole image collapses to the picture itself, unless the cursor is
        // on that line — then the raw markdown stays editable.
        if (name === 'Image') {
          const lineNo = state.doc.lineAt(node.from).number
          if (!activeLines.has(lineNo)) {
            const raw = state.doc.sliceString(node.from, node.to)
            const m = /^!\[([^\]]*)\]\(\s*([^)\s]+)/.exec(raw)
            const id = m ? attachmentIdFromSrc(m[2]) : null
            if (id) {
              decos.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({ widget: new ImageWidget(id, m?.[1] ?? '') }),
              })
              return false
            }
          }
          return
        }

        const inlineClass = INLINE_MARK[name]
        if (inlineClass) {
          decos.push({
            from: node.from,
            to: node.to,
            deco: Decoration.mark({ class: inlineClass }),
          })
          return
        }

        const lineNo = state.doc.lineAt(node.from).number
        const revealed = activeLines.has(lineNo)

        if (name === 'ListMark' && !revealed) {
          // Only bullets get the • stand-in; ordered numbers stay as typed.
          const text = state.doc.sliceString(node.from, node.to)
          if (text === '-' || text === '*' || text === '+') {
            decos.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new BulletWidget() }),
            })
          }
          return
        }

        if (HIDDEN_MARKS.has(name) && !revealed) {
          // Swallow the space after "#"/">" too, else headings sit indented.
          let end = node.to
          if ((name === 'HeaderMark' || name === 'QuoteMark') && state.doc.sliceString(end, end + 1) === ' ') {
            end += 1
          }
          if (end > node.from) {
            decos.push({ from: node.from, to: end, deco: Decoration.replace({}) })
          }
        }
      },
    })
  }

  decos.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(
    decos.map((d) => d.deco.range(d.from, d.to)),
    true,
  )
}

/** Clipboard blobs have no filename — invent a sane one for the storage path. */
function namedImageFile(file: File): File {
  if (file.name && file.name !== 'image.png') return file
  const ext = (file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return new File([file], `pasted-${stamp}.${ext}`, { type: file.type })
}

/**
 * Upload dropped/pasted images and insert a ref where the cursor is.
 *
 * A placeholder goes in immediately so a slow upload still shows progress, and
 * is then replaced by position (not by search) so concurrent pastes can't
 * clobber each other.
 */
async function insertImages(view: EditorView, files: File[], ctx: UploadContext) {
  for (const raw of files) {
    const file = namedImageFile(raw)
    const placeholder = `![uploading ${file.name}…]()`
    const from = view.state.selection.main.from
    view.dispatch({
      changes: { from, to: view.state.selection.main.to, insert: placeholder },
      selection: { anchor: from + placeholder.length },
    })
    try {
      const att = await uploadAttachment(file, { projectId: ctx.projectId, noteId: ctx.noteId })
      const text = scRef(att)
      view.dispatch({ changes: { from, to: from + placeholder.length, insert: text } })
    } catch (err) {
      const msg = `![upload failed: ${err instanceof Error ? err.message : 'unknown'}]()`
      view.dispatch({ changes: { from, to: from + placeholder.length, insert: msg } })
    }
  }
}

type UploadContext = { projectId: string | null; noteId?: string }

function imageDropPaste(ctxRef: { current: UploadContext | null }) {
  const imagesFrom = (list: FileList | null | undefined) =>
    [...(list ?? [])].filter((f) => f.type.startsWith('image/'))

  return EditorView.domEventHandlers({
    paste(event, view) {
      const ctx = ctxRef.current
      if (!ctx) return false
      const files = imagesFrom(event.clipboardData?.files)
      if (files.length === 0) return false
      event.preventDefault()
      void insertImages(view, files, ctx)
      return true
    },
    drop(event, view) {
      const ctx = ctxRef.current
      if (!ctx) return false
      const files = imagesFrom(event.dataTransfer?.files)
      if (files.length === 0) return false
      event.preventDefault()
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos != null) view.dispatch({ selection: { anchor: pos } })
      void insertImages(view, files, ctx)
      return true
    },
  })
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      // Selection changes matter as much as edits: moving the cursor onto a
      // line is what reveals its raw syntax. `redrawImages` covers signed URLs
      // that resolve after the first paint.
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged ||
        update.transactions.some((t) => t.effects.some((e) => e.is(redrawImages)))
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

/** Sizes/weights only — colours inherit so the light/dark/book themes hold. */
function baseTheme(palette: EditorPalette): Extension {
  return EditorView.theme({
    '&': {
      backgroundColor: palette.bg,
      color: palette.ink,
      fontFamily: palette.font ?? 'var(--font-sans)',
      fontSize: '14.5px',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-content': { padding: '16px 20px', lineHeight: '1.65', caretColor: palette.ink },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: palette.ink },
    '.cm-scroller': { fontFamily: 'inherit', overflow: 'auto' },
    '&.cm-editor .cm-selectionBackground, & .cm-selectionBackground, &.cm-focused .cm-selectionBackground':
      { backgroundColor: 'color-mix(in srgb, currentColor 18%, transparent)' },
    '.cm-sc-h1': { fontFamily: 'var(--font-display)', fontSize: '1.7em', fontWeight: '600', lineHeight: '1.3' },
    '.cm-sc-h2': { fontFamily: 'var(--font-display)', fontSize: '1.4em', fontWeight: '600', lineHeight: '1.3' },
    '.cm-sc-h3': { fontFamily: 'var(--font-display)', fontSize: '1.2em', fontWeight: '600' },
    '.cm-sc-h4': { fontFamily: 'var(--font-display)', fontSize: '1.05em', fontWeight: '600' },
    '.cm-sc-h5': { fontFamily: 'var(--font-display)', fontWeight: '600' },
    '.cm-sc-h6': { fontFamily: 'var(--font-display)', fontWeight: '600', opacity: '0.75' },
    '.cm-sc-quote': {
      borderLeft: '3px solid color-mix(in srgb, currentColor 30%, transparent)',
      paddingLeft: '0.85em',
      fontStyle: 'italic',
      opacity: '0.85',
    },
    '.cm-sc-strong': { fontWeight: '680' },
    '.cm-sc-em': { fontStyle: 'italic' },
    '.cm-sc-strike': { textDecoration: 'line-through', opacity: '0.7' },
    // The one sanctioned mono surface: genuine code.
    '.cm-sc-code': {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.88em',
      background: 'color-mix(in srgb, currentColor 9%, transparent)',
      padding: '0.12em 0.35em',
      borderRadius: '5px',
    },
    '.cm-sc-codeblock': {
      fontFamily: 'var(--font-mono)',
      fontSize: '0.88em',
      background: 'color-mix(in srgb, currentColor 8%, transparent)',
    },
    '.cm-sc-link': { textDecoration: 'underline', textUnderlineOffset: '2px' },
    '.cm-sc-bullet': { opacity: '0.55', paddingRight: '0.4em' },
    '.cm-sc-img': { display: 'inline-block', maxWidth: '100%' },
    '.cm-sc-img img': {
      display: 'block',
      maxWidth: '100%',
      height: 'auto',
      borderRadius: 'var(--radius-field)',
      margin: '0.35em 0',
    },
  })
}

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  palette,
  minHeight = 320,
  projectId = null,
  noteId,
}: {
  value: string
  onChange: (next: string) => void
  onBlur?: () => void
  palette: EditorPalette
  minHeight?: number
  /** Where pasted images get filed. Omit to disable image paste. */
  projectId?: string | null
  noteId?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // Keep the latest callbacks reachable without rebuilding the editor.
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur
  // Same trick for the upload target: changing note must not remount the editor.
  const uploadCtx = useRef<UploadContext | null>(null)
  uploadCtx.current = noteId ? { projectId, noteId } : { projectId }

  // A signed URL arriving later has to trigger a redraw of the image widgets.
  useEffect(
    () =>
      onImageResolved(() => {
        const v = view.current
        if (v) v.dispatch({ effects: redrawImages.of(null) })
      }),
    [],
  )

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        EditorView.lineWrapping,
        imageDropPaste(uploadCtx),
        livePreview,
        baseTheme(palette),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.view.state.doc.toString())
          if (u.focusChanged && !u.view.hasFocus) onBlurRef.current?.()
        }),
        EditorView.contentAttributes.of({ 'aria-label': 'Note content' }),
      ],
    })
    const v = new EditorView({ state, parent: host.current })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // Rebuilt when the mini-theme changes; `value` is synced separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette.bg, palette.ink, palette.font])

  // External value changes (switching notes) — don't clobber local typing.
  useEffect(() => {
    const v = view.current
    if (!v) return
    const current = v.state.doc.toString()
    if (current === value) return
    v.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div ref={host} style={{ minHeight }} className="sc-md-editor" />
}
