import { useEffect, useState } from 'react'
import { BellRing, DatabaseBackup, FileSpreadsheet, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react'
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme'
import { exportAllJSON, exportEncryptedArchive, exportFinanceCSV } from '../lib/backup'
import { disableReminders, enableReminders, remindersEnabled } from '../lib/push'
import { useAuth } from '../auth/AuthProvider'
import { Button, Card, Input, Label, Modal, PageHeader } from '../components/ui'
import { MODULES, isAvailable } from '../lib/modules'
import { setModuleEnabled, useEnabledModules } from '../lib/useModules'
import { PUSH_ENABLED } from '../lib/config'

const THEMES: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
]

export function Settings() {
  const { session, signOut } = useAuth()
  const [pref, setPref] = useState<ThemePref>(getThemePref)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)

  function choose(p: ThemePref) {
    setPref(p)
    setThemePref(p)
  }

  async function runExport(kind: 'json' | 'csv') {
    setExporting(kind)
    setExportError(null)
    try {
      if (kind === 'json') await exportAllJSON()
      else await exportFinanceCSV()
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" />

      <ModulesCard />

      <Card className="mt-4 px-4 py-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Theme</h2>
        <div className="mt-3 flex w-fit rounded-field border border-line bg-surface p-0.5">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => choose(id)}
              className={`flex items-center gap-1.5 rounded-[7px] px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
                pref === id ? 'bg-tide text-tide-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </Card>

      {PUSH_ENABLED && <RemindersCard />}

      <Card className="mt-4 px-4 py-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          Backup & export
        </h2>
        <p className="mt-2 text-[13.5px] text-ink-muted">
          This app holds business-critical records — keep a copy somewhere safe.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => runExport('json')} disabled={exporting !== null}>
            <DatabaseBackup size={15} />
            {exporting === 'json' ? 'Exporting…' : 'Everything (JSON)'}
          </Button>
          <Button variant="ghost" onClick={() => runExport('csv')} disabled={exporting !== null}>
            <FileSpreadsheet size={15} />
            {exporting === 'csv' ? 'Exporting…' : 'Finance ledgers (CSV)'}
          </Button>
        </div>
        {exportError && <p className="mt-2 text-[13px] text-neg">{exportError}</p>}

        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[13.5px] text-ink-muted">
            The full archive adds your uploaded files and is encrypted with a passphrase you
            choose — safe to keep in cloud storage.
          </p>
          <Button variant="ghost" onClick={() => setArchiving(true)} className="mt-3">
            <ShieldCheck size={15} /> Encrypted full archive
          </Button>
        </div>
      </Card>

      {archiving && <ArchiveModal onClose={() => setArchiving(false)} />}

      <Card className="mt-4 px-4 py-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Account</h2>
        <p className="mt-2 text-[14px]">{session?.user.email}</p>
        <Button variant="ghost" onClick={signOut} className="mt-3">
          Sign out
        </Button>
      </Card>
    </div>
  )
}

/**
 * Feature switches. Turning a module off unregisters its route, so its code
 * chunk stops being downloaded and its tables stop being queried — the data
 * itself is untouched and comes straight back when you switch it on again.
 * Backups always include every table regardless of what's switched on here.
 */
function ModulesCard() {
  const enabled = useEnabledModules()

  return (
    <Card className="px-4 py-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Modules</h2>
      <p className="mt-2 text-[13.5px] text-ink-muted">
        Switch off what you don’t use — it disappears from the nav and stops loading. Your data
        stays put, and backups still include everything.
      </p>
      <ul className="mt-3 flex flex-col divide-y divide-line border-t border-line">
        {MODULES.map((m) => {
          const available = isAvailable(m)
          const on = enabled.has(m.id)
          return (
            <li key={m.id} className="flex items-start gap-3 py-2.5">
              <m.icon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-medium">{m.label}</div>
                <div className="text-[12.5px] text-ink-muted">
                  {available ? m.description : 'Needs extra setup — see the docs.'}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={m.label}
                disabled={!available}
                onClick={() => setModuleEnabled(m.id, !on)}
                className={`mt-0.5 grid h-[22px] w-[38px] shrink-0 grid-cols-1 rounded-full p-0.5 transition-colors disabled:opacity-40 ${
                  on ? 'bg-tide' : 'bg-line-strong'
                }`}
              >
                <span
                  className={`h-[18px] w-[18px] rounded-full bg-surface transition-transform ${
                    on ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

/** Passphrase prompt for the encrypted full archive. */
function ArchiveModal({ onClose }: { onClose: () => void }) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ failed: string[]; bytes: number } | null>(null)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (pass !== confirm) return setError('The two passphrases don’t match.')
    setBusy(true)
    setError(null)
    try {
      const res = await exportEncryptedArchive(pass, setProgress)
      setDone({ failed: res.failedAttachments, bytes: res.bytes })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  if (done) {
    return (
      <Modal title="Archive downloaded" onClose={onClose}>
        <p className="text-[13.5px] text-ink-muted">
          {(done.bytes / 1_048_576).toFixed(1)} MB written.
          {done.failed.length > 0
            ? ` ${done.failed.length} attachment${done.failed.length === 1 ? '' : 's'} could not be downloaded and ${done.failed.length === 1 ? 'is' : 'are'} missing from the archive.`
            : ' All tables and attachments included.'}
        </p>
        <p className="mt-3 rounded-field bg-awaited-soft px-3 py-2 text-[13px] text-awaited">
          There is no recovery if you lose the passphrase. Store it in your password manager now.
          To open the archive later, follow <span className="font-medium">reference/RESTORE.md</span>.
        </p>
        <Button onClick={onClose} className="mt-4 w-full">
          Done
        </Button>
      </Modal>
    )
  }

  return (
    <Modal title="Encrypted full archive" onClose={onClose}>
      <form onSubmit={run} className="flex flex-col gap-3.5">
        <p className="text-[13.5px] text-ink-muted">
          Every table plus your uploaded files, gzipped and encrypted with AES-256. The passphrase
          never leaves this device and cannot be reset.
        </p>
        <label>
          <Label>Passphrase</Label>
          <Input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoFocus
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label>
          <Label>Confirm passphrase</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        <Button type="submit" disabled={busy} className="mt-1">
          {busy ? (progress ?? 'Working…') : 'Create archive'}
        </Button>
        {error && <p className="text-[13px] text-neg">{error}</p>}
      </form>
    </Modal>
  )
}

function RemindersCard() {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    remindersEnabled().then(setEnabled)
  }, [])

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      if (enabled) {
        await disableReminders()
        setEnabled(false)
      } else {
        await enableReminders()
        setEnabled(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update reminders.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-4 px-4 py-4">
      <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
        <BellRing size={13} /> Daily reminders
      </h2>
      <p className="mt-2 text-[13.5px] text-ink-muted">
        One notification at 8:00 AM with payment follow-ups due and key-date countdowns —
        only on days there’s something to nudge about.
      </p>
      <Button variant={enabled ? 'ghost' : 'primary'} onClick={toggle} disabled={busy} className="mt-3">
        {busy ? 'Working…' : enabled ? 'Turn off on this device' : 'Enable on this device'}
      </Button>
      {error && <p className="mt-2 text-[13px] text-neg">{error}</p>}
    </Card>
  )
}
