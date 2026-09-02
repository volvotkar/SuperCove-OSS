import { supabase } from './supabase'
import { TABLES as ALL_TABLES } from './data'
import { APP_SLUG } from './config'

// Everything except device-specific rows (push endpoints aren't user data).
const TABLES = ALL_TABLES.filter((t) => t !== 'push_subscriptions')

function download(name: string, content: BlobPart, mime: string) {
  const blob = new Blob([content], { type: mime })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10)
}

const PAGE = 1000

/**
 * Every row of a table. PostgREST caps a plain select at 1000 rows and says
 * nothing about it, so pull explicit pages until one comes back short —
 * time_logs and habit_checks are already the size where that bites.
 */
async function fetchAll(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    const page = data ?? []
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

async function dumpAllTables(): Promise<Record<string, unknown[]>> {
  const dump: Record<string, unknown[]> = {}
  await Promise.all(
    TABLES.map(async (t) => {
      dump[t] = await fetchAll(t)
    }),
  )
  return dump
}

/** Everything, as one JSON file. */
export async function exportAllJSON(): Promise<void> {
  const dump = await dumpAllTables()
  download(
    `${APP_SLUG}-backup-${stamp()}.json`,
    JSON.stringify({ exported_at: new Date().toISOString(), ...dump }, null, 2),
    'application/json',
  )
}

// ---------------------------------------------------------------------------
// Encrypted full archive (.scb)
//
// Layout: one line of plaintext JSON header, "\n", then AES-GCM ciphertext.
// The header is deliberately readable so the archive stays decryptable years
// from now without this app — see reference/RESTORE.md for the recipe.
//
// Zero dependencies: crypto.subtle and CompressionStream are both native.
// ---------------------------------------------------------------------------

const KDF_ITERATIONS = 310_000
const ARCHIVE_VERSION = 1

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

/** Row-level metadata plus the actual bytes of every attachment. */
async function fetchAttachmentBlobs(
  rows: Record<string, unknown>[],
  onProgress?: (msg: string) => void,
): Promise<{ files: Record<string, string>; failed: string[] }> {
  const files: Record<string, string> = {}
  const failed: string[] = []
  let done = 0
  for (const row of rows) {
    const path = String(row.storage_path ?? '')
    if (!path) continue
    onProgress?.(`Attachments ${++done}/${rows.length}…`)
    const { data, error } = await supabase.storage.from('attachments').download(path)
    if (error || !data) {
      failed.push(path)
      continue
    }
    files[path] = toBase64(new Uint8Array(await data.arrayBuffer()))
  }
  return { files, failed }
}

/**
 * Full encrypted backup: every table (paginated) plus attachment file bytes,
 * gzipped then AES-256-GCM encrypted with a passphrase-derived key.
 *
 * Returns the list of attachments that could not be downloaded, so the caller
 * can say so rather than implying the archive is complete.
 */
export async function exportEncryptedArchive(
  passphrase: string,
  onProgress?: (msg: string) => void,
): Promise<{ failedAttachments: string[]; bytes: number }> {
  if (passphrase.length < 8) throw new Error('Use a passphrase of at least 8 characters.')

  onProgress?.('Reading tables…')
  const dump = await dumpAllTables()

  const { files, failed } = await fetchAttachmentBlobs(
    (dump.attachments ?? []) as Record<string, unknown>[],
    onProgress,
  )

  onProgress?.('Compressing…')
  const payload = new TextEncoder().encode(
    JSON.stringify({ exported_at: new Date().toISOString(), tables: dump, files }),
  )
  const compressed = await gzip(payload)

  onProgress?.('Encrypting…')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      compressed as BufferSource,
    ),
  )

  const header = JSON.stringify({
    format: `${APP_SLUG}-backup`,
    version: ARCHIVE_VERSION,
    cipher: 'AES-GCM',
    compression: 'gzip',
    kdf: 'PBKDF2-SHA256',
    iterations: KDF_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
  })

  const blob = new Blob([header, '\n', cipher as BlobPart])
  download(`${APP_SLUG}-archive-${stamp()}.scb`, blob, 'application/octet-stream')
  return { failedAttachments: failed, bytes: blob.size }
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    if (v == null) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

/** Finance ledgers as CSV (expenses + payments, two files). */
export async function exportFinanceCSV(): Promise<void> {
  const [expenses, payments] = await Promise.all([
    supabase.from('expenses').select('*').order('spent_on'),
    supabase.from('payments').select('*').order('created_at'),
  ])
  if (expenses.error) throw new Error(expenses.error.message)
  if (payments.error) throw new Error(payments.error.message)
  download(`${APP_SLUG}-expenses-${stamp()}.csv`, toCSV(expenses.data ?? []), 'text/csv')
  download(`${APP_SLUG}-payments-${stamp()}.csv`, toCSV(payments.data ?? []), 'text/csv')
}
