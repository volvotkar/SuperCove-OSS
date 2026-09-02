import type { Attachment } from './types'
import { attachmentUrl } from './upload'
import { supabase } from './supabase'

/**
 * Resolving `sc-attachment/<id>` refs to displayable image URLs.
 *
 * The attachments bucket is private, so images can only be shown through a
 * signed URL — and those expire in 10 minutes. A signed URL must therefore
 * NEVER be written into note content; notes store the stable attachment id and
 * the URL is resolved (and re-resolved) at render time.
 *
 * `sc-attachment/<id>` is deliberately a relative path rather than a custom
 * scheme like `sc://` — DOMPurify strips unknown schemes, but leaves relative
 * paths alone, so the same ref survives the markdown preview pipeline.
 */

export const SC_PREFIX = 'sc-attachment/'

/** Markdown to insert for an uploaded image. */
export function scRef(att: Attachment): string {
  return `![${att.file_name}](${SC_PREFIX}${att.id})`
}

export function attachmentIdFromSrc(src: string): string | null {
  const i = src.indexOf(SC_PREFIX)
  return i === -1 ? null : src.slice(i + SC_PREFIX.length).split(/[?#]/)[0] || null
}

// Signed URLs live 10 min; re-mint at 8 to stay clear of the edge.
const TTL_MS = 8 * 60 * 1000

type Entry = { url: string; at: number }
const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<string | null>>()
const listeners = new Set<() => void>()

/** Notify anything rendering images that a URL just became available. */
export function onImageResolved(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Cached URL if we already have a fresh one, else null (and kicks off a fetch). */
export function peekImageSrc(id: string): string | null {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url
  void resolveImageSrc(id)
  return null
}

export async function resolveImageSrc(id: string): Promise<string | null> {
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url

  const existing = inflight.get(id)
  if (existing) return existing

  const p = (async () => {
    const { data, error } = await supabase
      .from('attachments')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    const url = await attachmentUrl(data as Attachment)
    if (!url) return null
    cache.set(id, { url, at: Date.now() })
    for (const fn of listeners) fn()
    return url
  })().finally(() => inflight.delete(id))

  inflight.set(id, p)
  return p
}

/** Swap every `sc-attachment/…` src in a rendered container for a live URL. */
export async function hydrateImages(root: HTMLElement): Promise<void> {
  const imgs = [...root.querySelectorAll('img')].filter((el) =>
    (el.getAttribute('src') ?? '').includes(SC_PREFIX),
  )
  await Promise.all(
    imgs.map(async (el) => {
      const id = attachmentIdFromSrc(el.getAttribute('src') ?? '')
      if (!id) return
      const url = await resolveImageSrc(id)
      if (url) el.setAttribute('src', url)
      else el.replaceWith(Object.assign(document.createElement('em'), {
        textContent: '[image unavailable]',
      }))
    }),
  )
}
