import { supabase } from './supabase'
import type { Attachment } from './types'

export const MAX_FILE_BYTES = 25 * 1024 * 1024

/** Returns the exact user-facing rejection copy, or null if the file is fine. */
export function fileSizeError(file: File): string | null {
  if (file.size <= MAX_FILE_BYTES) return null
  const mb = Math.round((file.size / 1024 / 1024) * 10) / 10
  return `This file is ${mb} MB — the limit is 25 MB. Try compressing it or uploading a smaller version.`
}

export async function uploadAttachment(
  file: File,
  opts: { projectId: string | null; noteId?: string },
): Promise<Attachment> {
  const sizeErr = fileSizeError(file)
  if (sizeErr) throw new Error(sizeErr)

  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) throw new Error('Not signed in.')

  // Miscellaneous notes have no project — they get their own folder.
  const path = `${uid}/${opts.projectId ?? 'misc'}/${crypto.randomUUID()}-${file.name}`
  const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      project_id: opts.projectId,
      note_id: opts.noteId ?? null,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select()
    .single()
  if (error) {
    // Don't leave an orphaned object behind
    await supabase.storage.from('attachments').remove([path])
    throw new Error(`Could not save attachment: ${error.message}`)
  }
  return data as Attachment
}

export async function attachmentUrl(att: Attachment): Promise<string> {
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(att.storage_path, 60 * 10)
  if (error || !data) throw new Error('Could not create download link.')
  return data.signedUrl
}

export async function deleteAttachment(att: Attachment): Promise<void> {
  await supabase.storage.from('attachments').remove([att.storage_path])
  const { error } = await supabase.from('attachments').delete().eq('id', att.id)
  if (error) throw error
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}
