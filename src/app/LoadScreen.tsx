import { useEffect, useState } from 'react'

// Short, crisp, on every open — a greeting, not a splash you wait through.
const QUIRKY = [
  'Steady as she goes.',
  'The cove is calm today.',
  'Small boats, big cargo.',
  'One list to rule them all.',
  'Tide’s in. Let’s work.',
]

function greeting(): string {
  // ~1 in 5 opens get a quirky one
  if (Math.random() < 0.2) {
    return QUIRKY[Math.floor(Math.random() * QUIRKY.length)]
  }
  const h = new Date().getHours()
  if (h < 5) return 'Burning the midnight oil.'
  if (h < 12) return 'Good morning.'
  if (h < 17) return 'Good afternoon.'
  return 'Good evening.'
}

export function LoadScreen({ onDone }: { onDone: () => void }) {
  const [line] = useState(greeting)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1100)
    const t2 = setTimeout(onDone, 1500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [onDone])

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-bg transition-opacity duration-400 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="text-center">
        <img
          src="/favicon.svg"
          alt=""
          className="mx-auto h-12 w-12 rounded-xl"
          style={{ animation: 'sc-rise 500ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
        />
        <p
          className="font-display mt-4 text-lg font-medium tracking-tight"
          style={{ animation: 'sc-rise 500ms 120ms cubic-bezier(0.22, 1, 0.36, 1) both' }}
        >
          {line}
        </p>
      </div>
      <style>{`
        @keyframes sc-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
