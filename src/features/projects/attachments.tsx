import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { FileText, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { Attachment } from '../../lib/types'
import { attachmentUrl, deleteAttachment, humanSize, uploadAttachment } from '../../lib/upload'
import { resolveImageSrc } from '../../lib/imgsrc'

/** Paperclip-style upload control. Rejections (e.g. over 25 MB) show loudly below. */
export function UploadButton({
  projectId,
  noteId,
  children,
  label,
}: {
  projectId: string | null
  noteId?: string
  children?: ReactNode
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const qc = useQueryClient()

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      await uploadAttachment(file, { projectId, noteId })
      qc.invalidateQueries({ queryKey: ['attachments'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="relative inline-flex flex-col">
      <input ref={inputRef} type="file" hidden onChange={onPick} />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Attach a file (max 25 MB)"
        className={
          label
            ? 'inline-flex items-center gap-1.5 rounded-field border border-line-strong bg-surface px-3.5 py-2 text-[14px] font-medium hover:bg-sunken disabled:opacity-50'
            : 'grid h-7 w-7 place-items-center rounded-full text-ink-muted hover:bg-sunken disabled:opacity-50'
        }
      >
        {children}
        {label && (busy ? 'Uploading…' : label)}
      </button>
      {error && (
        <span
          role="alert"
          className="absolute right-0 top-full z-10 mt-1 w-72 rounded-field border border-line bg-surface px-3 py-2 text-[12.5px] text-neg shadow-lg"
        >
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">
            dismiss
          </button>
        </span>
      )}
    </span>
  )
}

/** Small preview for image attachments — signed URLs, so resolved on mount. */
function Thumb({ att }: { att: Attachment }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void resolveImageSrc(att.id).then((u) => live && setSrc(u))
    return () => {
      live = false
    }
  }, [att.id])

  return src ? (
    <img
      src={src}
      alt=""
      className="h-8 w-8 shrink-0 rounded object-cover"
      loading="lazy"
    />
  ) : (
    <span className="h-8 w-8 shrink-0 rounded bg-sunken" />
  )
}

export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const qc = useQueryClient()

  async function open(att: Attachment) {
    const url = await attachmentUrl(att)
    window.open(url, '_blank', 'noopener')
  }

  async function remove(att: Attachment) {
    if (!window.confirm(`Delete “${att.file_name}”?`)) return
    await deleteAttachment(att)
    qc.invalidateQueries({ queryKey: ['attachments'] })
  }

  return (
    <ul className="flex flex-col">
      {attachments.map((att) => (
        <li key={att.id} className="group flex items-center gap-2.5 rounded-field px-2 py-1.5 hover:bg-sunken">
          {att.mime_type?.startsWith('image/') ? (
            <Thumb att={att} />
          ) : (
            <FileText size={15} className="shrink-0 text-ink-faint" />
          )}
          <button
            type="button"
            onClick={() => open(att)}
            className="min-w-0 flex-1 truncate text-left text-[13.5px] hover:underline"
            title="Open"
          >
            {att.file_name}
          </button>
          <span className="tnum shrink-0 text-[11.5px] text-ink-faint">{humanSize(att.size_bytes)}</span>
          <button
            type="button"
            onClick={() => remove(att)}
            title="Delete"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-faint transition-all sm:opacity-0 hover:bg-neg-soft hover:text-neg sm:group-hover:opacity-100"
          >
            <Trash2 size={13} />
          </button>
        </li>
      ))}
    </ul>
  )
}
