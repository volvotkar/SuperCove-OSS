import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Code2, Download, Eye, Paperclip, PenLine, Plus, Trash2 } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useDelete, useInsert, useRows, useUpdate } from '../../lib/data'
import type { Attachment, Note } from '../../lib/types'
import { Button, EmptyState, Input } from '../../components/ui'
import { MarkdownEditor, type EditorPalette } from '../../components/MarkdownEditor'
import { hydrateImages, scRef } from '../../lib/imgsrc'
import { uploadAttachment } from '../../lib/upload'
import { InlineRename } from '../../components/InlineRename'
import { AttachmentList, UploadButton } from './attachments'

/**
 * Notes: multiple named tabs per project, markdown editing, export,
 * attachments. The editor surface has its own mini-theme
 * (light / dark / book) — deliberately scoped here, not app-wide.
 */

type EditorTheme = 'light' | 'dark' | 'book'
/** Hybrid renders markdown in place as you type; raw/preview are escape hatches. */
type EditorMode = 'hybrid' | 'raw' | 'preview'

const MODES = [
  { id: 'hybrid', label: 'Write', icon: PenLine },
  { id: 'raw', label: 'Raw', icon: Code2 },
  { id: 'preview', label: 'Read', icon: Eye },
] as const satisfies readonly { id: EditorMode; label: string; icon: typeof Eye }[]

const EDITOR_THEMES: Record<EditorTheme, EditorPalette> = {
  light: { bg: '#fdfdfb', ink: '#1c2130' },
  dark: { bg: '#10162a', ink: '#dfe4f0' },
  book: { bg: '#f0e7d8', ink: '#3a2f22', font: 'Georgia, "Times New Roman", serif' },
}

function getEditorTheme(): EditorTheme {
  const v = localStorage.getItem('sc-note-theme')
  return v === 'dark' || v === 'book' ? v : 'light'
}

export function NotesTab({ projectId }: { projectId: string }) {
  const { data: allNotes = [] } = useRows<Note>('notes', { column: 'position' })
  const insertNote = useInsert<Note>('notes')
  const updateNote = useUpdate<Note>('notes')
  const delNote = useDelete('notes')
  const notes = useMemo(() => allNotes.filter((n) => n.project_id === projectId), [allNotes, projectId])

  const [activeId, setActiveId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const active = notes.find((n) => n.id === activeId) ?? notes[0] ?? null

  function addNote(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    insertNote.mutate(
      { project_id: projectId, name: name.trim(), position: notes.length },
      {
        onSuccess: (n) => {
          setActiveId(n.id)
          setName('')
          setNaming(false)
        },
      },
    )
  }

  return (
    <div>
      {/* Note tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {notes.map((n) => {
          const isActive = active?.id === n.id
          const pill = `rounded-field px-3 py-1.5 text-[13px] font-medium transition-colors ${
            isActive ? 'bg-tide-soft text-tide' : 'border border-line text-ink-muted hover:bg-sunken'
          }`
          // The open note's tab doubles as its rename field; the rest just switch.
          return isActive ? (
            <span key={n.id} className={pill}>
              <InlineRename
                value={n.name}
                onRename={(name) => updateNote.mutate({ id: n.id, patch: { name } })}
                title="Click to rename this note"
              />
            </span>
          ) : (
            <button key={n.id} type="button" onClick={() => setActiveId(n.id)} className={pill}>
              {n.name}
            </button>
          )
        })}
        {naming ? (
          <form onSubmit={addNote} className="flex gap-1.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Note name…"
              autoFocus
              className="h-8 max-w-[160px] py-1"
            />
            <Button type="submit" className="h-8 py-1">
              Add
            </Button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setNaming(true)}
            className="grid h-8 w-8 place-items-center rounded-field border border-dashed border-line text-ink-faint hover:bg-sunken"
            aria-label="New note"
          >
            <Plus size={15} />
          </button>
        )}
      </div>

      {active ? (
        <NoteEditor key={active.id} note={active} onDelete={() => delNote.mutate(active.id)} />
      ) : (
        <EmptyState>No notes in this project yet — add a tab to start writing.</EmptyState>
      )}
    </div>
  )
}

export function NoteEditor({
  note,
  onDelete,
  toolbarExtra,
}: {
  note: Note
  onDelete: () => void
  /** Slot for page-specific controls (e.g. the "move to project" picker). */
  toolbarExtra?: React.ReactNode
}) {
  const update = useUpdate<Note>('notes')
  const [content, setContent] = useState(note.content)
  const [mode, setMode] = useState<EditorMode>('hybrid')
  const [theme, setTheme] = useState<EditorTheme>(getEditorTheme)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { data: allAttachments = [] } = useRows<Attachment>('attachments', { column: 'created_at' })
  const attachments = allAttachments.filter((a) => a.note_id === note.id)

  // Latest content, readable from the unmount cleanup without re-running it.
  const latest = useRef(content)
  latest.current = content
  const savedRef = useRef(note.content)

  const save = useCallback(
    (text: string) => {
      if (text === savedRef.current) return
      savedRef.current = text
      update.mutate({ id: note.id, patch: { content: text, updated_at: new Date().toISOString() } })
    },
    [note.id, update],
  )

  // Debounced autosave
  useEffect(() => {
    if (content === savedRef.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => save(content), 700)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // Flush on unmount — switching notes inside the debounce window used to drop
  // the last edit silently.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      save(latest.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chooseTheme(t: EditorTheme) {
    setTheme(t)
    localStorage.setItem('sc-note-theme', t)
  }

  function exportNote() {
    const blob = new Blob([content], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${note.name}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const t = EDITOR_THEMES[theme]
  const rendered = mode === 'preview' ? DOMPurify.sanitize(marked.parse(content, { async: false })) : ''

  // Preview holds `sc-attachment/<id>` refs; swap them for live signed URLs.
  const previewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (mode === 'preview' && previewRef.current) void hydrateImages(previewRef.current)
  }, [mode, rendered])

  // Paste parity for the raw textarea (the hybrid editor handles its own).
  const rawRef = useRef<HTMLTextAreaElement>(null)
  async function onRawPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    const el = rawRef.current
    const at = el?.selectionStart ?? content.length
    for (const file of files) {
      try {
        const att = await uploadAttachment(file, {
          projectId: note.project_id,
          noteId: note.id,
        })
        setContent((c) => c.slice(0, at) + scRef(att) + c.slice(at))
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed.')
      }
    }
  }
  const [uploadError, setUploadError] = useState<string | null>(null)

  return (
    <div className="rounded-card border border-line bg-surface">
      {/* Editor toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        {/* Hybrid is the default: markdown renders as you type, raw syntax
            shows only on the cursor's line. Raw/Preview stay for the times you
            want the plain source or a clean read. */}
        <div className="flex rounded-field border border-line p-0.5">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              title={`${label} mode`}
              className={`flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                mode === id ? 'bg-tide-soft text-tide' : 'text-ink-muted hover:bg-sunken'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Mini theme switcher, editor-scoped */}
        <div className="flex rounded-field border border-line p-0.5">
          {(Object.keys(EDITOR_THEMES) as EditorTheme[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseTheme(id)}
              title={`${id} theme`}
              className={`h-5 w-6 rounded-[5px] border text-[10px] ${
                theme === id ? 'border-tide' : 'border-transparent'
              }`}
              style={{ background: EDITOR_THEMES[id].bg, color: EDITOR_THEMES[id].ink }}
            >
              A
            </button>
          ))}
        </div>

        <div className="flex-1" />
        {toolbarExtra}
        <span className="text-[11.5px] text-ink-faint">
          {update.isPending ? 'Saving…' : 'Saved'}
        </span>
        <UploadButton projectId={note.project_id} noteId={note.id}>
          <Paperclip size={14} />
        </UploadButton>
        <button
          type="button"
          onClick={exportNote}
          title="Export as .md"
          className="grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-sunken"
        >
          <Download size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete note “${note.name}”?`)) onDelete()
          }}
          title="Delete note"
          className="grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-neg-soft hover:text-neg"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Editor / preview surface — carries its own theme */}
      {mode === 'preview' ? (
        <div
          ref={previewRef}
          className="prose-sc min-h-[320px] px-5 py-4 text-[14.5px] leading-relaxed"
          style={{ background: t.bg, color: t.ink, fontFamily: t.font }}
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      ) : mode === 'hybrid' ? (
        <MarkdownEditor
          value={content}
          onChange={setContent}
          onBlur={() => save(latest.current)}
          palette={t}
          projectId={note.project_id}
          noteId={note.id}
        />
      ) : (
        <textarea
          ref={rawRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={() => save(content)}
          onPaste={onRawPaste}
          placeholder="Write in markdown…"
          spellCheck={false}
          className="block min-h-[320px] w-full resize-y px-5 py-4 font-mono text-[13.5px] leading-relaxed outline-none"
          style={{ background: t.bg, color: t.ink, fontFamily: t.font ?? undefined }}
        />
      )}

      {uploadError && (
        <p className="border-t border-line px-4 py-2 text-[12.5px] text-neg">{uploadError}</p>
      )}

      {attachments.length > 0 && (
        <div className="border-t border-line px-3 py-2">
          <AttachmentList attachments={attachments} />
        </div>
      )}
    </div>
  )
}
